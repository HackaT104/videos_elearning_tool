// Hoạt hình vẽ tay: lint mã cảnh do AI viết, trang dựng tự chứa, mã đệm, template cartoon (clip + chữ phủ), biên dịch HyperFrames,
// chính sách bật template trong prompt. Vẽ thật (Chromium + ffmpeg) chỉ chạy khi CVS_RENDER_TESTS=1.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cartoonHtml, cartoonKey, checkCartoon, lintCartoon, renderCartoon, type CartoonInput } from "../src";
import { buildVideo } from "@cvs/core";
import { buildSceneSpec, TEMPLATES } from "@cvs/engine";
import { compileScene, lintErrors, lintScene } from "@cvs/engine-hf";
import { cartoonPrompt, designErrors, designPrompt, parseCartoonReply } from "@cvs/ai";
import { probe } from "@cvs/tts";

const OK = `function scene(t) {
  boilSeed('bg'); paint(rectPts(-100, -100, 2120, 1300), { wash: THEME.bg || '#E3ECF3', ink: null });
  kysu(960, 860, 26, { ...emotions(t, [[0, 'neutral'], [at(1, .2), 'surprised']]) });
}`;
const inp = (o: Partial<CartoonInput> = {}): CartoonInput => ({ code: OK, dur: 4, cues: [0.3, 2], ends: [1.8, 3.8], fast: true, clawd: false, theme: { bg: "#E3ECF3" }, ...o });

describe("mã cảnh hoạt hình", () => {
  it("lint: cần scene(t); cấm mạng, DOM, ngẫu nhiên, thời gian thực, chữ, shots(), Clawd khi tắt", () => {
    expect(lintCartoon(OK)).toEqual([]);
    expect(lintCartoon("")).toEqual(["Mã cảnh rỗng"]);
    expect(lintCartoon("function draw() {}").join()).toMatch(/scene\(t\)/);
    const bad = (s: string) => lintCartoon(`function scene(t) { ${s} }`).join(" | ");
    expect(bad("fetch('http://x')")).toMatch(/mạng/);
    expect(bad("document.body.innerHTML = ''")).toMatch(/DOM/);
    expect(bad("const r = Math.random()")).toMatch(/Math\.random/);
    expect(bad("const d = Date.now()")).toMatch(/Date/);
    expect(bad("setTimeout(() => 1, 5)")).toMatch(/timer/);
    expect(bad("letter('OK', 1, 2, 40)")).toMatch(/chữ/);
    expect(bad("eval('1')")).toMatch(/eval/);
    expect(bad("while (true) {}")).toMatch(/vô hạn/);
    expect(bad("import('x')")).toMatch(/import/);
    expect(bad("clawd(1, 2, 3, {})")).toMatch(/Clawd đang tắt/);
    expect(lintCartoon("function scene(t) { clawd(1, 2, 3, {}) }", { clawd: true })).toEqual([]);
    expect(bad("shots([])")).toMatch(/shots/);
    // chú thích không bị coi là mã; tên biến top/self bình thường
    expect(lintCartoon("function scene(t) { // fetch() trong chú thích\n const top = 1; }")).toEqual([]);
  });
  it("trang tự chứa: không tải gì từ ngoài, mã không phá được thẻ script", () => {
    const html = cartoonHtml(inp({ code: `function scene(t) { const s = "</script><script>alert(1)"; }` }));
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<\/script><script>alert/);
    expect(html).toContain("<\\/script><script>alert(1)");
    expect(html).toContain('"clawd":false');
    expect(html).toContain("function kysu(");
  });
  it("mã đệm đổi theo mã, mốc câu, chế độ; giữ nguyên khi giống hệt", () => {
    const k = cartoonKey(inp());
    expect(k).toMatch(/^[a-f0-9]{16}$/);
    expect(cartoonKey(inp())).toBe(k);
    expect(cartoonKey(inp({ cues: [0.4, 2] }))).not.toBe(k);
    expect(cartoonKey(inp({ fast: false }))).not.toBe(k);
    expect(cartoonKey(inp({ code: OK + " " }))).not.toBe(k);
  });
});

describe("template cartoon trong hai bộ dựng", () => {
  const video = () => buildVideo({ title: "Bài 1", fileName: "MO1_U1_1", scenes: [
    { scriptStart: 0, scriptEnd: 10, title: "Rủi ro", visual: "Kỹ sư phát hiện dây hở", onscreen: ["Kiểm tra trước khi vận hành"], vo: "Kỹ sư đến máy. Anh thấy dây điện hở." },
  ] }, { course: "CAR", level: "L1" }, 0);
  const T = { id: "s1", start: 0, dur: 6, lead: 0.5, tail: 0.6, audioDur: 4.9, cues: [0.5, 3], ends: [2.8, 5.4], estimated: true };
  it("có clip → <video> tua theo cảnh + chữ phủ theo kịch bản; chưa có → khung giữ chỗ + ghi chú", () => {
    const v = video();
    v.scenes[0].design = { template: "cartoon", params: { brief: "Kỹ sư phát hiện dây hở", code: OK, clip: "0123456789abcdef.mp4", title: "Kiểm tra trước khi vận hành" }, by: "ai" };
    const spec = buildSceneSpec(v, v.scenes[0]);
    expect(spec.errors).toEqual([]);
    expect(spec.html).toContain('src="assets/cartoon/0123456789abcdef.mp4"');
    expect(spec.assumptions.some((a) => a.includes("hoạt hình vẽ tay do AI"))).toBe(true);
    expect(spec.assumptions.some((a) => a.startsWith("Chữ không có"))).toBe(false);
    const html = compileScene(spec, T, { scene: v.scenes[0], videoKey: v.key });
    expect(html).toContain('<video id="s1-clip0" class="clip cartoon-clip" data-cvs-clip="1" data-start="0" data-duration="6"');
    expect(lintErrors(lintScene(html, "s1"))).toEqual([]);
    // tên clip lạ (đường dẫn) → không dùng
    v.scenes[0].design.params.clip = "../../x.mp4";
    const s2 = buildSceneSpec(v, v.scenes[0]);
    expect(s2.html).not.toContain("<video");
    expect(s2.assumptions.some((a) => a.includes("Chưa có clip hoạt hình"))).toBe(true);
  });
  it("cảnh tùy biến vẫn bị cấm class=clip / video ngoài", () => {
    const custom = `<!-- s1 · x --><template><div class="clip"></div><video src="assets/cartoon/../x.mp4"></video></template>`;
    const rules = lintErrors(lintScene(custom, "s1")).map((x) => x.rule);
    expect(rules).toContain("no-clip-class");
    expect(rules).toContain("local-img-only");
  });
  it("AI chỉ thấy/chọn được cartoon khi dự án bật; cần brief", () => {
    const v = video();
    const sc = v.scenes[0];
    expect(designPrompt(v, sc).system).not.toContain("### cartoon");
    expect(designErrors(sc, { template: "cartoon", params: { brief: "x" } }, { video: v }).join()).toMatch(/chưa bật/);
    v.cartoon = { clawd: false };
    expect(designPrompt(v, sc).system).toContain("### cartoon");
    expect(designErrors(sc, { template: "cartoon", params: {} }, { video: v }).join()).toMatch(/brief/);
    expect(designErrors(sc, { template: "cartoon", params: { brief: "Kỹ sư", title: "Kiểm tra trước khi vận hành" } }, { video: v })).toEqual([]);
    expect(TEMPLATES.cartoon.schema.required).toEqual(["brief"]);
  });
  it("prompt viết mã: mốc câu, màu phong cách, kysu, Clawd tắt, chế độ nhẹ; tách mã + assumptions", () => {
    const v = video();
    const p = cartoonPrompt(v, v.scenes[0], T, { brief: "Kỹ sư phát hiện dây hở", fast: true });
    expect(p.system).toContain("function scene(t)");
    expect(p.system).toContain("CHỈ dùng kysu()");
    expect(p.system).toContain("Chế độ NHẸ");
    expect(p.system).toContain("John Heibel");
    expect(p.content).toContain("[câu 1] 3.00–5.40s: Anh thấy dây điện hở.");
    expect(p.content).toContain("Kỹ sư phát hiện dây hở");
    expect(cartoonPrompt(v, v.scenes[0], T, { brief: "x", clawd: true }).system).toContain("clawd() nếu người dùng yêu cầu rõ");
    expect(parseCartoonReply("```js\nfunction scene(t) {}\n```\n```json\n{\"assumptions\": [\"máy ép\"]}\n```")).toEqual({ code: "function scene(t) {}", assumptions: ["máy ép"] });
    expect(parseCartoonReply("không có mã").code).toBeNull();
  });
});

describe.runIf(process.env.CVS_RENDER_TESTS === "1")("vẽ thật (Chromium + ffmpeg)", () => {
  it("vẽ thử: không lỗi, có ảnh; lỗi chạy được báo rõ", async () => {
    const r = await checkCartoon(inp(), [0.5, 2.5]);
    expect(r.errors).toEqual([]);
    expect(r.frames).toHaveLength(2);
    expect(r.frames[0].jpg.subarray(0, 2).toString("hex")).toBe("ffd8");
    const bad = await checkCartoon(inp({ code: "function scene(t) { kysu(1, 2, 3, { draw: () => { throw new Error('hỏng'); } }); }" }), [0.5]);
    expect(bad.errors.join()).toMatch(/hỏng/);
  }, 120_000);
  it("render clip 12 khung/giây đúng thời lượng; lần sau dùng đệm", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "cvs-brush-")), "c.mp4");
    const a = await renderCartoon(inp({ dur: 1.5 }), out);
    expect(a.cached).toBe(false);
    const info = await probe(out);
    expect(info.streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1920, height: 1080 });
    expect(Math.abs(info.duration - 1.5)).toBeLessThan(0.15);
    expect((await renderCartoon(inp({ dur: 1.5 }), out)).cached).toBe(true);
  }, 180_000);
});
