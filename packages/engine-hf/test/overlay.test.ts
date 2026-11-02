// Lớp phủ logo + phụ đề gắn cứng: HyperFrames biên dịch như cảnh "overlay" (qua lint), host phủ cả video, ảnh logo chép vào assets/img,
// đổi cài đặt → đổi file dựng; Remotion nhận cùng SceneSpec. Không phủ gì khi phụ đề chỉ trong trình phát và không có logo.
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildVideo, computeTiming, resolveOverlay } from "@cvs/core";
import { overlaySpec } from "@cvs/engine";
import { buildProps } from "@cvs/engine-rmt";
import { hfBuild, lintScene } from "../src";

const LOGO = "0123456789abcdef-600x200.png";
const root = mkdtempSync(join(tmpdir(), "cvs-ov-"));
const assets = join(root, "assets");
mkdirSync(assets, { recursive: true });
// PNG 1×1 hợp lệ (nội dung không quan trọng với build)
writeFileSync(join(assets, LOGO), Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const v = buildVideo({ title: "B", fileName: "MO1_U1_1", scenes: [
  { scriptStart: 0, scriptEnd: 10, title: "Mở đầu", visual: "", onscreen: [], vo: "Mỗi tấn CO₂ giảm được ghi nhận. Thẩm tra độc lập 100%." },
  { scriptStart: 10, scriptEnd: 20, title: "Tiếp", visual: "", onscreen: [], vo: "Câu thứ ba." },
] }, { course: "C", level: "L1" }, 0);
const timing = computeTiming(v);
const build = (o: Parameters<typeof resolveOverlay>[0], dir = join(root, "w")) => hfBuild({ video: v, timing, manifest: null, voDir: join(root, "vo"), workDir: dir, assetsDir: assets, overlay: resolveOverlay(o) });

describe("lớp phủ HyperFrames", () => {
  it("phụ đề trong trình phát + không logo → không có overlay", async () => {
    const r = await build({}, join(root, "none"));
    expect(existsSync(join(root, "none", "compositions", "overlay.html"))).toBe(false);
    expect(readFileSync(join(root, "none", "index.html"), "utf8")).not.toContain('data-composition-id="overlay"');
    expect(r.warnings).toEqual([]);
  });
  it("gắn cứng + logo: cảnh overlay qua lint, host sau mọi cảnh, logo chép vào assets/img, dòng Nguồn được nâng", async () => {
    const dir = join(root, "both");
    const r = await build({ subtitle: { mode: "burn" }, logo: { assetId: LOGO, position: "bottom-left", scenes: "skip-first" } }, dir);
    expect(r.warnings.filter((w) => /overlay/.test(w))).toEqual([]);
    const html = readFileSync(join(dir, "compositions", "overlay.html"), "utf8");
    expect(lintScene(html, "overlay").filter((i) => i.severity === "error")).toEqual([]);
    expect(html).toContain(`src="assets/img/${LOGO}"`);
    expect(html).toContain("Mỗi tấn CO₂ giảm được ghi nhận.");
    // mỗi câu: hiện + ẩn 0,15 s theo at(); logo hiện ở đầu cảnh 2 (mốc cuối của TIMING)
    expect(html).toMatch(/tl\.fromTo\("#overlay-c0", \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.15, ease: "power1\.out" \}, at\(0, 0\)\);/);
    expect(html).toMatch(/tl\.fromTo\("#overlay-c0", \{ opacity: 1 \}, \{ opacity: 0, duration: 0\.15, ease: "power1\.in", immediateRender: false \}, at\(0, 1\)\);/);
    expect(html).toMatch(/tl\.fromTo\("#overlay-logo", \{ opacity: 0 \}, \{ opacity: 1, duration: 0\.4, ease: "power1\.out" \}, at\(3, 0\)\);/);
    expect(html).toContain(`"cues":[${timing.scenes[0].start + timing.scenes[0].cues[0]},`);
    expect(html).not.toMatch(/class="[^"]*\bt\b/); // không phải chữ của cảnh → QA bố cục không đo
    expect(existsSync(join(dir, "assets", "img", LOGO))).toBe(true);
    const index = readFileSync(join(dir, "index.html"), "utf8");
    const last = index.lastIndexOf('data-composition-src="compositions/s2.html"');
    expect(index.indexOf('data-composition-src="compositions/overlay.html"')).toBeGreaterThan(last);
    expect(index).toMatch(/\.src-line\{bottom:\d+px !important;\}/);
    expect(index).toContain(`data-duration="${timing.total}"`);
  });
  it("đổi cài đặt → đổi file dựng (render lại); tắt → xoá overlay", async () => {
    const dir = join(root, "chg");
    await build({ subtitle: { mode: "burn", size: 40 } }, dir);
    const a = readFileSync(join(dir, "compositions", "overlay.html"), "utf8");
    await build({ subtitle: { mode: "burn", size: 56 } }, dir);
    const b = readFileSync(join(dir, "compositions", "overlay.html"), "utf8");
    expect(a).not.toBe(b);
    expect(b).toContain("font-size:56px");
    await build({ subtitle: { mode: "player" } }, dir);
    expect(existsSync(join(dir, "compositions", "overlay.html"))).toBe(false);
  });
  it("thiếu file logo → cảnh báo, không vỡ build", async () => {
    const r = await build({ logo: { assetId: "ffffffffffffffff-10x10.png" } }, join(root, "miss"));
    expect(r.warnings.some((w) => /Thiếu ảnh logo/.test(w))).toBe(true);
  });
});

describe("Remotion cùng lớp phủ", () => {
  it("props.overlay = cùng SceneSpec, css toàn trang nâng dòng Nguồn", async () => {
    const o = resolveOverlay({ subtitle: { mode: "burn" }, logo: { assetId: LOGO } });
    const p = await buildProps(v, timing, assets, o);
    const ov = overlaySpec(v, timing, o, () => true)!;
    expect(p.overlay?.spec.html).toBe(ov.spec.html);
    expect(p.overlay?.spec.anims).toEqual(ov.spec.anims);
    expect(p.overlay?.T).toEqual(ov.T);
    expect(p.css).toContain(".src-line{bottom:");
    expect((await buildProps(v, timing, assets)).overlay).toBeUndefined();
  });
});
