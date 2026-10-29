import { describe, expect, it } from "vitest";
import { at, computeTiming, parseVideoFileName, sceneVoiceHash, splitSentences, buildVideo } from "../src";

describe("tách câu", () => {
  it.each([
    ["Câu một. Câu hai? Câu ba!", ["Câu một.", "Câu hai?", "Câu ba!"]],
    ["Phiên bản 5.0 có hiệu lực. Tiếp theo là 423,9 ppm.", ["Phiên bản 5.0 có hiệu lực.", "Tiếp theo là 423,9 ppm."]],
    ["Lưu ý: điều này quan trọng. Hết.", ["Lưu ý: điều này quan trọng.", "Hết."]],
    ["TS. Nguyễn Văn A trình bày. Xong.", ["TS. Nguyễn Văn A trình bày.", "Xong."]],
    ["Gồm điện, nước v.v. và nhiều thứ khác.", ["Gồm điện, nước v.v. và nhiều thứ khác."]],
    ["Điều 3.8.2 quy định rõ. 11 năm sau.", ["Điều 3.8.2 quy định rõ.", "11 năm sau."]],
    ["Anh ấy nói: “Đi thôi.” Rồi đi.", ["Anh ấy nói: “Đi thôi.”", "Rồi đi."]],
    ["Không có dấu kết câu", ["Không có dấu kết câu"]],
  ])("%s", (input, want) => expect(splitSentences(input)).toEqual(want));
});

describe("mã video", () => {
  it("bóc tên file", () => expect(parseVideoFileName("videos/MO1_U1.5_1.mp4")).toMatchObject({ module: "MO1", unit: "U1.5", seq: "1" }));
  it("chấp nhận gạch nối", () => expect(parseVideoFileName("MO2-U2.2-3").base).toBe("MO2_U2.2_3"));
});

describe("timing", () => {
  const v = buildVideo(
    { title: "T", fileName: "MO1_U1_1", scenes: [
      { scriptStart: 0, scriptEnd: 10, title: "a", visual: "", onscreen: [], vo: "Một hai ba bốn năm. Sáu bảy tám." },
      { scriptStart: 10, scriptEnd: 20, title: "b", visual: "", onscreen: [], vo: "Chín mười." },
    ] },
    { course: "CAR", level: "L1" }, 0,
  );
  it("ước tính khi chưa có giọng, cảnh nối tiếp nhau", () => {
    const t = computeTiming(v);
    expect(t.estimated).toBe(true);
    expect(t.scenes[1].start).toBeCloseTo(t.scenes[0].dur, 3);
    expect(t.scenes[0].cues[0]).toBe(v.pace.lead);
    expect(t.total).toBeCloseTo(t.scenes[0].dur + t.scenes[1].dur, 3);
  });
  it("dùng mốc giọng thật khi hash khớp", () => {
    const hash = sceneVoiceHash(v.voice, v.scenes[0], v.pace.gap);
    const t = computeTiming(v, { version: 1, scenes: { s1: { hash, file: "s1.mp3", dur: 4, cues: [0.05, 2.1], ends: [1.8, 3.8] } } });
    expect(t.scenes[0].estimated).toBe(false);
    expect(t.scenes[0].dur).toBeCloseTo(0.5 + 4 + 0.6, 3);
    expect(t.scenes[0].cues).toEqual([0.55, 2.6]);
    expect(t.scenes[1].estimated).toBe(true);
  });
  it("hash đổi khi đổi lời đọc → dùng ước tính", () => {
    const t = computeTiming(v, { version: 1, scenes: { s1: { hash: "cu", file: "s1.mp3", dur: 4, cues: [0], ends: [4] } } });
    expect(t.scenes[0].estimated).toBe(true);
  });
  it("at(i, f)", () => {
    expect(at({ cues: [1, 3], ends: [2, 5] }, 1, 0.5)).toBe(4);
    expect(at({ cues: [1, 3], ends: [2, 5] }, 9, 2)).toBe(5);
  });
});
