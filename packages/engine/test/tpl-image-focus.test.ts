import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { dropMissingImages, makeAssetId, parseAssetId, rasterSize, sceneImageRefs, syncSceneImages, TEMPLATES, validateParams } from "../src";
import { imageFocus } from "../src/templates/image-focus";

const ctx = (n = 4) => ({ p: "s3", theme: THEMES["giay-ky-thuat"], slow: false, sentences: Array.from({ length: n }, (_, i) => `Câu ${i + 1}.`), sceneTitle: "x" });
const ID = "0123456789abcdef-1600x1000.png";
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);

describe("template image-focus", () => {
  it("ảnh tham chiếu tương đối assets/img; id có tiền tố, không trùng; khoanh vẽ nét + nhãn; Ken Burns và phóng trên div HTML", () => {
    const spec = imageFocus.build({ ...imageFocus.example, image: ID }, ctx());
    expect(sceneImageRefs(spec.html)).toEqual([ID]);
    const all = ids(spec.html);
    for (const id of all) expect(id.startsWith("s3-")).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const a of spec.anims) expect(all).toContain(a.id);
    expect(spec.anims.filter((a) => /^s3-c\d$/.test(a.id) && a.from.dash === 1).length).toBe(3);
    expect(spec.html.match(/<rect id="s3-c\d" class="draw" pathLength="1"/g)!.length).toBe(3);
    expect(spec.texts).toEqual(["Khai báo sự cố trên **phần mềm**", "Mục Báo cáo sự cố", "Mô tả ngắn gọn", "Gửi báo cáo"]);
    const kb = spec.anims.find((a) => a.id === "s3-kb")!;
    expect(kb.to.scale).toBeCloseTo(1.04);
    expect(kb.until).toEqual({ end: 0 });
    const z = spec.anims.find((a) => a.id === "s3-zoom")!;
    expect(z.to.scale).toBeCloseTo(1.6);
    expect(spec.html).toMatch(/id="s3-zoom" class="abs cvs-cam"/);
    // phóng không lộ mép ảnh: x ∈ [W − sW, 0]
    const W = Number(/id="s3-frame" class="abs" style="left:\d+px;top:\d+px;width:(\d+)px/.exec(spec.html)![1]);
    expect(z.to.x!).toBeLessThanOrEqual(0);
    expect(z.to.x!).toBeGreaterThanOrEqual(W - 1.6 * W - 1);
    // vùng khoanh lần lượt theo câu, vùng trước lùi lại
    const draws = spec.anims.filter((a) => /^s3-c\d$/.test(a.id)).map((a) => ("cue" in a.at ? a.at.cue + (a.at.f ?? 0) : 0));
    expect([...draws].sort()).toEqual(draws);
    expect(spec.anims.some((a) => a.id === "s3-cg0" && a.to.opacity! < 1)).toBe(true);
    for (const m of spec.html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(28);
    // khung giữ tỉ lệ ảnh (contain)
    const H = Number(/id="s3-frame" class="abs" style="left:\d+px;top:\d+px;width:\d+px;height:(\d+)px/.exec(spec.html)![1]);
    expect(W / H).toBeCloseTo(1.6, 1);
  });

  it("cover: khung phủ vùng nội dung; mã ảnh sai → khung giữ chỗ, không <img>", () => {
    const c = imageFocus.build({ image: "abcdefabcdefabcd-800x800.jpg", fit: "cover" }, ctx(2));
    expect(c.html).toContain('src="assets/img/abcdefabcdefabcd-800x800.jpg"');
    const bad = imageFocus.build({ image: "../../etc/passwd" }, ctx(2));
    expect(bad.html).not.toContain("<img");
    expect(bad.assumptions.some((a) => a.includes("không hợp lệ"))).toBe(true);
    const evil = imageFocus.build({ image: `${ID}" onerror="alert(1)` } as any, ctx(2));
    expect(evil.html).not.toContain("onerror");
  });

  it("đăng ký + validateParams; tham số tối thiểu dựng được", () => {
    expect(TEMPLATES["image-focus"]).toBe(imageFocus);
    expect(validateParams("image-focus", imageFocus.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams("image-focus", {})).toEqual(['Thiếu "image"']);
    const s = imageFocus.build({ image: ID, callouts: [{ x: 95, y: 2, w: 40, h: 50, label: "Góc phải" }] }, ctx(1));
    expect(s.html).toContain('id="s3-lab0"');
  });
});

describe("ảnh của dự án (engine/assets)", () => {
  it("mã ảnh mang kích thước; parse chặt", () => {
    expect(makeAssetId("ABCDEF0123456789ffff".toLowerCase(), 1600, 900, "png")).toBe("abcdef0123456789-1600x900.png");
    expect(parseAssetId("abcdef0123456789-1600x900.png")).toEqual({ w: 1600, h: 900, ext: "png" });
    for (const bad of ["x.png", "abcdef0123456789-0x9.png", "abcdef0123456789-10x9.gif", "../abcdef0123456789-10x9.png", 5]) expect(parseAssetId(bad)).toBeNull();
  });
  it("đọc kích thước PNG/JPEG/WebP từ đầu file", () => {
    const png = Buffer.alloc(33);
    png.writeUInt32BE(0x89504e47, 0);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(rasterSize(png)).toEqual({ w: 640, h: 480, ext: "png" });
    // JPEG: SOI, APP0 (len 4), SOF0 (h 300, w 500)
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0xf4, 0x03, 0, 0, 0, 0, 0, 0]);
    expect(rasterSize(jpg)).toEqual({ w: 500, h: 300, ext: "jpg" });
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBPVP8X", 8, "ascii");
    webp.writeUIntLE(1919, 24, 3);
    webp.writeUIntLE(1079, 27, 3);
    expect(rasterSize(webp)).toEqual({ w: 1920, h: 1080, ext: "webp" });
    expect(rasterSize(Buffer.from("<svg/>"))).toBeNull();
  });
  it("bỏ <img> trỏ tới ảnh thiếu; chép ảnh dùng, xoá ảnh thừa", () => {
    const html = `<div><img src="assets/img/${ID}" alt=""><img src="assets/img/aaaaaaaaaaaaaaaa-10x10.png" alt=""></div>`;
    expect(dropMissingImages(html, (id) => id === ID)).toBe(`<div><img src="assets/img/${ID}" alt=""></div>`);
    const root = mkdtempSync(join(tmpdir(), "cvs-img-"));
    const assets = join(root, "assets");
    const work = join(root, "work");
    mkdirSync(assets);
    mkdirSync(join(work, "assets", "img"), { recursive: true });
    writeFileSync(join(assets, ID), "x");
    writeFileSync(join(work, "assets", "img", "old.png"), "x");
    const r = syncSceneImages([ID, "bbbbbbbbbbbbbbbb-1x1.png"], assets, work);
    expect(r.missing).toEqual(["bbbbbbbbbbbbbbbb-1x1.png"]);
    expect(readdirSync(join(work, "assets", "img"))).toEqual([ID]);
  });
});
