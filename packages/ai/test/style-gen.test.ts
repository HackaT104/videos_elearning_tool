// Tạo phong cách bằng AI: prompt chung, ảnh gửi dạng base64 (đúng loại), kiểm câu trả lời (gửi lại lỗi cho Claude).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const calls: { opts: any; validate?: (v: any) => string[] }[] = [];
vi.mock("../src/client", () => ({
  askJson: vi.fn(async (opts: any, validate?: (v: any) => string[]) => {
    calls.push({ opts, validate });
    return { theme: {}, rationale: "", closest: "" };
  }),
  ask: vi.fn(),
}));
const { generateStyle, styleGenErrors, styleGenPrompt } = await import("../src/index");

const input = { prompt: "Ấm áp, giấy kraft, chữ viết tay", subject: { project: "An toàn điện", course: "ATD", videoTitle: "Khoá – thẻ", scene: { title: "Quy trình", visual: "4 bước", onscreen: ["Ngắt điện"], text: "Bước một." } }, base: null, images: 2, frames: 1 };

describe("styleGenPrompt", () => {
  it("có mô tả, chủ đề, giá trị được phép; không cho CSS", () => {
    const p = styleGenPrompt(input);
    for (const k of ["KHÔNG CSS", "4,5:1", "be-vietnam", "solid-shadow", "groundSpec", "back.out(1.3)", "closest", "am-moc"]) expect(p.system).toContain(k);
    for (const k of ["giấy kraft", "An toàn điện", "Ngắt điện", "2 ảnh", "1 khung", "pnpm cvs style-refs"]) expect(p.content).toContain(k);
    expect(styleGenPrompt({ ...input, base: { id: "tuy-chinh-x-1", draft: { name: "Gốc" } as any } }).content).toContain("PHONG CÁCH HIỆN TẠI (tuy-chinh-x-1)");
  });
});

describe("generateStyle", () => {
  it("gửi ảnh base64 kèm nhãn trước prompt; bỏ file không phải ảnh; validate = styleGenErrors", async () => {
    const d = mkdtempSync(join(tmpdir(), "cvs-sg-"));
    writeFileSync(join(d, "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 1]));
    writeFileSync(join(d, "b.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(d, "c.svg"), "<svg/>");
    await generateStyle(input, [{ file: join(d, "a.jpg"), label: "Ảnh 1" }, { file: join(d, "b.png"), label: "Ảnh 2" }, { file: join(d, "c.svg"), label: "SVG" }]);
    const c = calls[0].opts.content;
    expect(c.map((b: any) => b.type)).toEqual(["text", "image", "text", "image", "text"]);
    expect(c[1].source).toEqual({ type: "base64", media_type: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 1]).toString("base64") });
    expect(c[3].source.media_type).toBe("image/png");
    expect(c[4].text).toContain("MÔ TẢ CỦA NGƯỜI DÙNG");
    expect(calls[0].validate).toBe(styleGenErrors);
    expect(styleGenErrors({ theme: { name: "x" }, rationale: "", closest: "khong" }).join("\n")).toMatch(/colors[^]*rationale[^]*closest/);
  });
});
