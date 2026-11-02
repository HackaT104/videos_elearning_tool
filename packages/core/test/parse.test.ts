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

describe("bóc tài liệu nội dung module (bài, mục, khối Loại:, lời thoại không nhãn)", async () => {
  const r = await parseInputFile("Noi_dung_module.docx", load("Noi_dung_module.docx"), { course: "CAR", level: "L1" });
  const v = r.videos[0];
  it("chỉ khối Loại: Video là video; không cảnh báo", () => {
    expect(r.kind).toBe("script");
    expect(r.videos.map((x) => x.key)).toEqual(["CAR-L1_MO1_U1.1_2"]);
    expect(r.warnings).toEqual([]);
  });
  it("tiêu đề = mục đánh số ngay trước video (bỏ số), mã theo tên file", () => {
    expect(v.title).toBe("Từ ánh nắng đến dòng điện");
    expect([v.module, v.unit, v.seq]).toEqual(["MO1", "U1.1", "2"]);
  });
  it("đoạn trong ngoặc kép sau mốc cảnh là lời thoại kể cả khi không có nhãn Giọng đọc", () => {
    expect(v.scenes).toHaveLength(4);
    expect(v.scenes.map((s) => s.sentences.length)).toEqual([2, 2, 1, 1]);
    expect(v.scenes[1].sentences.map((x) => x.text)).toEqual(["Bên trong tấm pin, ánh sáng đánh bật các điện tử trong lớp silic.", "Dòng điện tử này tạo ra điện một chiều."]);
    expect(v.scenes.flatMap((s) => s.sentences.map((x) => x.text)).join(" ")).not.toMatch(/["“”]/);
  });
  it('Text: "a" / "b" → hai mục chữ trên màn hình', () => {
    expect(v.scenes[0].onscreen).toEqual(["Ánh nắng", "Dòng điện"]);
    expect(v.scenes[1].onscreen).toEqual(["Hiệu ứng quang điện"]);
    expect(v.scenes[2].onscreen).toEqual(["220 V"]); // "Text lớn:"
    expect(v.scenes[2].visual).toBe("Mũi tên đi từ tấm pin vào hộp biến tần rồi ra ổ cắm.");
  });
  it("Nguồn chỉ là đoạn của nó – không nuốt quiz, tài liệu tham khảo", () => {
    expect(v.sources).toBe("IEA, Renewables 2024; IRENA (2023).");
  });
  it("ngữ cảnh: mục tiêu + bài đọc của chính bài, ≤ 6000 ký tự, không lẫn câu hỏi, tài liệu tham khảo, bài khác", () => {
    const c = v.context!;
    expect(c.length).toBeGreaterThan(3000);
    expect(c.length).toBeLessThanOrEqual(6000);
    expect(c).toContain("Mô tả được đường đi của năng lượng");
    expect(c).toContain("Đoạn đọc 24:"); // gần video nhất được giữ trước
    expect(c).not.toMatch(/Câu 1\.|Tài liệu tham khảo số|Các bước lắp đặt|Đo hướng mái|unit_number|Loại:/);
  });
  it("liệt kê các bài (số, tiêu đề, thời lượng, loại phần 2, video)", () => {
    expect(r.units).toEqual([
      { number: "1.1", title: "Năng lượng mặt trời và điện mặt trời", duration: "20", sectionType: "video&reading", videos: ["CAR-L1_MO1_U1.1_2"] },
      { number: "1.2", title: "Lắp đặt hệ thống điện mặt trời mái nhà", duration: "25", sectionType: "video&reading" },
    ]);
  });
});
