import { describe, expect, it } from "vitest";
import { loudnormFilter, mixGraph, musicGainDb, parseEbur128, parseLoudnorm } from "../src/loudness";

const LOUDNORM_OUT = `[Parsed_loudnorm_0 @ 0x55d0c0] 
{
	"input_i" : "-27.61",
	"input_tp" : "-9.85",
	"input_lra" : "6.30",
	"input_thresh" : "-38.05",
	"output_i" : "-16.02",
	"output_tp" : "-1.50",
	"output_lra" : "5.10",
	"output_thresh" : "-26.40",
	"normalization_type" : "dynamic",
	"target_offset" : "0.02"
}`;

const EBUR128_OUT = `[Parsed_ebur128_0 @ 0x7fdb6c002640] Summary:

  Integrated loudness:
    I:         -16.1 LUFS
    Threshold: -26.2 LUFS

  Loudness range:
    LRA:         4.0 LU
    Threshold: -36.2 LUFS

  True peak:
    Peak:       -1.7 dBFS`;

describe("chuẩn hoá âm lượng", () => {
  it("đọc số đo loudnorm và dựng lượt chuẩn hoá tuyến tính −16 LUFS / −1,5 dBTP", () => {
    const m = parseLoudnorm(LOUDNORM_OUT)!;
    expect(m).toEqual({ I: -27.61, TP: -9.85, LRA: 6.3, thresh: -38.05, offset: 0.02 });
    expect(loudnormFilter()).toBe("loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json");
    expect(loudnormFilter(m)).toBe("loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-27.61:measured_TP=-9.85:measured_LRA=6.30:measured_thresh=-38.05:offset=0.02:linear=true");
    expect(loudnormFilter({ ...m, I: -Infinity })).toBe("anull"); // giọng im lặng
    expect(parseLoudnorm("không có json")).toBeNull();
  });

  it("đồ thị trộn: không nhạc / nhạc thường / nhạc hạ theo giọng (sidechaincompress)", () => {
    const m = parseLoudnorm(LOUDNORM_OUT)!;
    expect(mixGraph(30, m)).toMatch(/^\[0:a\].*loudnorm=.*\[aout\]$/);
    expect(mixGraph(30, m)).not.toContain("[1:a]");
    const music = { file: "m.mp3", volumeDb: -20, duck: true, fadeIn: 1, fadeOut: 1, gainDb: -12.5 };
    const g = mixGraph(30, m, music);
    expect(g).toContain("asplit=2[v][key]");
    expect(g).toContain("[m][key]sidechaincompress=");
    expect(g).toContain("atrim=0:30.000");
    expect(g).toContain("volume=-12.50dB");
    expect(g).toContain("afade=t=in:st=0:d=1");
    expect(g).toContain("afade=t=out:st=29.000:d=1");
    expect(g).toMatch(/\[v\]\[md\]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0\.7943:level=false\[aout\]$/);
    const flat = mixGraph(30, m, { ...music, duck: false, fadeIn: 0 });
    expect(flat).not.toContain("sidechaincompress");
    expect(flat).not.toContain("afade=t=in");
    expect(flat).toContain("[v][m]amix=inputs=2");
    // video ngắn hơn hai lần fade → fade bị kẹp
    expect(mixGraph(1, m, music)).toContain("afade=t=out:st=0.500:d=0.5");
  });

  it("nhạc đặt dưới giọng theo LU", () => {
    expect(musicGainDb({ I: -14, TP: -1, LRA: 5, thresh: -24, offset: 0 }, -20)).toBe(-22); // −16 −20 − (−14)
    expect(musicGainDb(null, -20)).toBe(-20);
  });

  it("đọc tóm tắt ebur128", () => {
    expect(parseEbur128(EBUR128_OUT)).toEqual({ I: -16.1, LRA: 4, TP: -1.7 });
    expect(parseEbur128("")).toBeNull();
  });
});
