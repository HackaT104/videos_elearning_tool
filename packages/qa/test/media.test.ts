import { describe, expect, it } from "vitest";
import type { Timing } from "@cvs/core";
import { formatItems, holdOf, loudnessItems, parseBlack, parseFreeze, parsePeak, visualItems } from "../src/media";

const timing: Timing = {
  videoKey: "V", fps: 30, width: 1920, height: 1080, total: 20, estimated: false,
  scenes: [
    { id: "s1", start: 0, dur: 10, lead: 0.4, tail: 0.6, audioDur: 9, cues: [0.4, 3, 5], ends: [2.8, 4.8, 9.4], estimated: false },
    { id: "s2", start: 10, dur: 10, lead: 0.4, tail: 0.6, audioDur: 9, cues: [0.4], ends: [9.4], estimated: false },
  ],
};

const VID_ERR = `[blackdetect @ 0x7f15c0002780] black_start:0 black_end:0.3 black_duration:0.3
[freezedetect @ 0x7f15c0002c00] lavfi.freezedetect.freeze_start: 5.5
[freezedetect @ 0x7f15c0002c00] lavfi.freezedetect.freeze_duration: 4.5
[freezedetect @ 0x7f15c0002c00] lavfi.freezedetect.freeze_end: 10
[blackdetect @ 0x7f15c0002780] black_start:12 black_end:13.2 black_duration:1.2
[freezedetect @ 0x7f15c0002c00] lavfi.freezedetect.freeze_start: 15`;

const ASTATS = `[Parsed_astats_1 @ 0x7fdb6c002b00] Overall
[Parsed_astats_1 @ 0x7fdb6c002b00] Peak level dB: -2.133478
[Parsed_astats_1 @ 0x7fdb6c002b00] Peak count: 2.000000`;

describe("QA file MP4", () => {
  it("đọc blackdetect / freezedetect / astats", () => {
    expect(parseBlack(VID_ERR)).toEqual([{ start: 0, end: 0.3 }, { start: 12, end: 13.2 }]);
    expect(parseFreeze(VID_ERR, 20)).toEqual([{ start: 5.5, end: 10 }, { start: 15, end: 20 }]); // đứng tới hết video
    expect(parsePeak(ASTATS)).toBeCloseTo(-2.13, 2);
    expect(parsePeak("Overall\nPeak level dB: -inf")).toBe(-Infinity);
  });

  it("chỉ báo đứng hình dài hơn nhịp của cảnh, màn hình đen > 0,5 s", () => {
    expect(holdOf(timing.scenes[0])).toBeCloseTo(5.5); // 5 → 10 là khoảng dài nhất, +0,5
    expect(holdOf(timing.scenes[1])).toBeCloseTo(10.1);
    const items = visualItems(parseBlack(VID_ERR), parseFreeze(VID_ERR, 20), timing);
    expect(items.map((i) => i.scene)).toEqual(["s2"]); // đen 1,2 s ở s2; đứng 4,5 s ở s1 (≤ 5,5) và 5 s ở s2 (≤ 10,1) → bỏ qua
    expect(items[0].message).toMatch(/Màn hình đen 1\.2 s/);
    const long = visualItems([], [{ start: 1, end: 8 }], timing);
    expect(long[0]).toMatchObject({ scene: "s1", severity: "warning" });
    expect(long[0].message).toMatch(/Hình đứng yên 7\.0 s/);
  });

  it("định dạng: H.264 1920×1080 30 fps, AAC, thời lượng ±0,15 s", () => {
    const ok = { duration: 20.1, streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "30/1" }, { codec_type: "audio", codec_name: "aac" }] };
    expect(formatItems(ok, timing)).toEqual([]);
    const bad = { duration: 20.3, streams: [{ codec_type: "video", codec_name: "hevc", width: 1280, height: 720, r_frame_rate: "25/1" }, { codec_type: "audio", codec_name: "mp3" }] };
    const msgs = formatItems(bad, timing).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/cần AAC/);
    expect(msgs).toMatch(/H\.264 1920×1080 \(đang là hevc 1280×720\)/);
    expect(msgs).toMatch(/25\.00 fps, cần 30 fps/);
    expect(msgs).toMatch(/lệch timing/);
  });

  it("âm lượng: −16 LUFS ±1,5, đỉnh thật ≤ −1,5 dBTP (+0,5), méo khi chạm 0 dBFS", () => {
    expect(loudnessItems({ I: -16.4, TP: -1.6 }, -2)).toEqual([]);
    const m = loudnessItems({ I: -23, TP: 0.2 }, 0).map((i) => i.message).join("\n");
    expect(m).toMatch(/−23|-23\.0 LUFS/);
    expect(m).toMatch(/Đỉnh thật 0\.2 dBTP/);
    expect(m).toMatch(/clipping/);
    expect(loudnessItems(null, null)[0].message).toMatch(/Không đo được/);
  });
});
