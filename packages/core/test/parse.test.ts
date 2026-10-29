import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findCrossLevelDuplicates, parseInputFile, readXlsxHeaders } from "../src";

const FX = join(import.meta.dirname, "..", "..", "..", "fixtures");
const load = (f: string) => readFileSync(join(FX, f));

describe("bóc docx kịch bản (2 video)", async () => {
  const r = await parseInputFile("Kich_ban_L1.docx", load("Kich_ban_L1.docx"), { course: "CAR", level: "L1" });
  it("nhận diện kịch bản đầy đủ", () => expect(r.kind).toBe("script"));
  it("tìm đủ 2 video với mã có tiền tố cấp độ", () => expect(r.videos.map((v) => v.key)).toEqual(["CAR-L1_MO1_U1.5_1", "CAR-L1_MO2_U2.2_1"]));
  it("bóc cảnh dạng đoạn văn: mốc, tên, hình, Text, lời thoại", () => {
    const s = r.videos[0].scenes;
    expect(s).toHaveLength(3);
    expect(s[1]).toMatchObject({ scriptStart: 20, scriptEnd: 45, title: "So sánh", onscreen: ["Phát thải", "Hấp thụ"] });
    expect(s[1].visual).toContain("nhà máy phát thải");
    expect(s[0].sentences.map((x) => x.text)).toEqual([
      "Chào mừng bạn đến với khóa học về tín chỉ carbon.",
      "Mỗi tín chỉ đại diện cho 1 tCO₂e được giảm hoặc loại bỏ khỏi khí quyển.",
    ]);
  });
  it("không viết lại lời thoại, chỉ chuẩn hóa tts", () => {
    const st = r.videos[0].scenes[2].sentences[1];
    expect(st.text).toBe("Từ ngày 01/01/2027, VCS Version 5.0A sẽ được áp dụng.");
    expect(st.tts).toContain("phiên bản năm chấm không a");
  });
  it("đọc phần Nguồn và ngữ cảnh (bảng số liệu)", () => {
    expect(r.videos[0].sources).toContain("Verra");
    expect(r.videos[0].context).toContain("1,5°C");
  });
  it("bóc cảnh dạng bảng", () => {
    const v = r.videos[1];
    expect(v.title).toBe("Chu trình dự án VCS");
    expect(v.scenes).toHaveLength(2);
    expect(v.scenes[0].onscreen).toEqual(["Thiết kế", "Thẩm định", "Đăng ký"]);
    expect(v.scenes[0].sentences).toHaveLength(3);
  });
  it("giọng cơ bản xen kẽ nữ/nam", () => expect(r.videos.map((v) => v.voice.voiceId)).toEqual(["Trúc Ly", "Hải Đăng"]));
});

describe("bóc outline", async () => {
  const r = await parseInputFile("Outline_L2.docx", load("Outline_L2.docx"), { course: "CAR", level: "L2" });
  it("nhận diện outline", () => expect(r.kind).toBe("outline"));
  it("có mục tiêu và đầu mục", () => {
    expect(r.outline!.title).toBe("Thị trường carbon tự nguyện");
    expect(r.outline!.objectives).toHaveLength(2);
    expect(r.outline!.items.map((i) => i.heading)).toEqual(["1. Hai loại thị trường", "2. Các bên tham gia"]);
  });
});

describe("bóc xlsx", async () => {
  const r = await parseInputFile("Kich_ban_L2.xlsx", load("Kich_ban_L2.xlsx"), { course: "CAR", level: "L2" });
  it("mỗi sheet một học phần, tự nhận cột tiếng Việt và tiếng Anh", () => {
    expect(r.videos.map((v) => v.key)).toEqual(["CAR-L2_MO2_U2.2_1", "CAR-L2_MO3_U3.1_1"]);
    expect(r.warnings).toEqual([]);
  });
  it("gộp các hàng cùng mã video, mã trống kế thừa hàng trên", () => {
    const v = r.videos[0];
    expect(v.scenes).toHaveLength(3);
    expect(v.scenes[1]).toMatchObject({ scriptStart: 15, scriptEnd: 40, onscreen: ["Thẩm định", "Thẩm tra"] });
    expect(v.sources).toBe("Verra, VCS Standard v4.7");
  });
  it("nhịp trung cấp", () => expect(r.videos[0].pace).toEqual({ lead: 0.7, gap: 0.8, tail: 1.2 }));
  it("đọc tiêu đề cột cho màn hình ghép cột", async () => {
    const h = await readXlsxHeaders(load("Kich_ban_L2.xlsx"));
    expect(h[0].auto.vo).toBe(8);
    expect(h[1].auto.code).toBe(1);
  });
  it("ghép cột tay", async () => {
    const r2 = await parseInputFile("Kich_ban_L2.xlsx", load("Kich_ban_L2.xlsx"), {
      course: "CAR", level: "L2", columnMaps: { MO2: { vo: 6 } }, // cố ý ghép "Mô tả hình" làm lời thoại
    });
    expect(r2.videos[0].scenes[0].sentences[0].text).toBe("Tiêu đề bài học");
  });
});

describe("trùng tên giữa các cấp độ", async () => {
  const a = await parseInputFile("Kich_ban_L1.docx", load("Kich_ban_L1.docx"), { course: "CAR", level: "L1" });
  const b = await parseInputFile("Kich_ban_L2.xlsx", load("Kich_ban_L2.xlsx"), { course: "CAR", level: "L2" });
  it("phát hiện MO2_U2.2_1 có ở L1 và L2, mã vẫn khác nhau", () => {
    const items = [...a.videos, ...b.videos].map((v) => ({ level: v.level, base: `${v.module}_${v.unit}_${v.seq}` }));
    expect(findCrossLevelDuplicates(items)).toEqual(["MO2_U2.2_1 (L1, L2)"]);
    const keys = [...a.videos, ...b.videos].map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
