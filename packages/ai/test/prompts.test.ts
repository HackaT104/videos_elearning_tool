// Kiểm prompt trong app (không gọi mạng): checklist chuyển động có mặt, độ dài hợp lý, đường kiểm tham số của designScene giữ nguyên.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { opts: any; validate?: (v: any) => string[] }[] = [];
let reply: any = null;
vi.mock("../src/client", () => ({
  askJson: vi.fn(async (opts: any, validate?: (v: any) => string[]) => {
    calls.push({ opts, validate });
    return reply;
  }),
  ask: vi.fn(async (opts: any) => {
    calls.push({ opts });
    return reply;
  }),
}));

const { CUSTOM_SCENE_CHECKLIST, MOTION_CHECKLIST, REVIEW_BATCH, designScene, drawIllustration, fixReadings, reviewReadings, reviewReadingsPrompt, reviseScene, writeCustomScene } = await import("../src/index");
const { DESIGN_TEMPLATE_IDS, TEMPLATES } = await import("@cvs/engine");

const video: any = { key: "V1", title: "Tín chỉ carbon", level: "cơ bản", style: undefined, font: undefined, scenes: [] };
const scene: any = { id: "s1", title: "Mở đầu", scriptStart: 0, scriptEnd: 20, visual: "Tiêu đề lớn", onscreen: ["Tín chỉ carbon"], sentences: [{ text: "Câu một." }, { text: "Câu hai." }] };
const T = { dur: 8, cues: [0.2, 4], ends: [3.8, 7.5] };

beforeEach(() => {
  calls.length = 0;
});

describe("checklist chuyển động", () => {
  it("có các mục chính và ngắn gọn", () => {
    for (const k of ["MỘT tiêu điểm", "hook", "HÌNH DẠNG", "progressive disclosure", "**…**", "warn", "máy quay"]) expect(MOTION_CHECKLIST).toContain(k);
    for (const k of ["Stagger", "expo.out", "strokeDashoffset", "back.out", "power2.inOut", "đứng yên", "Intl.Segmenter", "0.3em", "đếm số", "tự viết exit", "CHÍNH phần tử được scale"]) expect(CUSTOM_SCENE_CHECKLIST).toContain(k);
    // cảnh tùy biến không có exit/máy quay của engine → checklist chung không được nói ngược lại cho mọi cảnh
    expect(MOTION_CHECKLIST).toContain("Cảnh TEMPLATE");
    expect(CUSTOM_SCENE_CHECKLIST).not.toContain("phần tử bọc");
    const lines = (MOTION_CHECKLIST + "\n" + CUSTOM_SCENE_CHECKLIST).split("\n").length;
    expect(lines).toBeLessThanOrEqual(40);
    expect(MOTION_CHECKLIST.length + CUSTOM_SCENE_CHECKLIST.length).toBeLessThan(5000);
  });
});

describe("designScene / reviseScene", () => {
  it("system prompt có checklist + thư viện, ghi chú sửa nằm trong content", async () => {
    const id = DESIGN_TEMPLATE_IDS[0];
    reply = { template: id, params: TEMPLATES[id].example, assumptions: ["x"], reasoning: "r" };
    const r = await reviseScene(video, scene, "Đổi màu nhấn", T as any);
    expect(r).toEqual({ design: { template: id, params: TEMPLATES[id].example, by: "ai" }, assumptions: ["x"], reasoning: "r" });
    const { opts } = calls[0];
    expect(opts.system).toContain(MOTION_CHECKLIST);
    expect(opts.system).toContain("KHÔNG BỊA SỐ LIỆU");
    expect(opts.system).toContain(`### ${id}`);
    expect(opts.content).toContain("Đổi màu nhấn");
    expect(opts.content).toContain('"template": string, "params": object, "assumptions": string[], "reasoning": string');
  });

  it("kiểm tham số: template lạ, cue vượt số câu, ví dụ hợp lệ", async () => {
    reply = { template: DESIGN_TEMPLATE_IDS[0], params: {}, assumptions: [] };
    await designScene(video, scene, T as any);
    const validate = calls[0].validate!;
    expect(validate({ template: "khong-co", params: {} })).toEqual(['template "khong-co" không có trong thư viện']);
    // cảnh thử có 2 câu: chỉ xét ví dụ không đặt mốc từ câu thứ 3 trở đi
    const fits = (ex: unknown) => !/"cue":\s*([2-9]|\d{2,})/.test(JSON.stringify(ex));
    // image-focus chỉ chọn được khi cảnh đã có ảnh (xem test riêng)
    for (const id of DESIGN_TEMPLATE_IDS.filter((t) => t !== "image-focus" && fits(TEMPLATES[t].example))) expect(validate({ template: id, params: TEMPLATES[id].example })).toEqual([]);
    const tc = { ...TEMPLATES["title-card"].example, at: { subtitle: { cue: 5 } } };
    expect(validate({ template: "title-card", params: tc }).some((e) => e.includes("vượt quá số câu (2)"))).toBe(true);
  });
});

describe("hình minh hoạ & ảnh của cảnh", () => {
  it("illustration cần brief; SVG AI tự viết ở designScene bị bỏ; thiết kế hiện tại không gửi lại SVG", async () => {
    reply = { template: "illustration", params: { brief: "Công nhân đội mũ", svg: "<svg/>", svgKey: "k" }, assumptions: [] };
    const sc = { ...scene, design: { template: "illustration", params: { brief: "cũ", svg: "<svg>RẤT DÀI</svg>", svgKey: "k" }, by: "ai" } };
    const r = await reviseScene(video, sc, "vẽ minh hoạ người công nhân đội mũ bảo hộ", T as any);
    expect(r.design.params).toEqual({ brief: "Công nhân đội mũ" });
    expect(calls[0].opts.content).not.toContain("RẤT DÀI");
    expect(calls[0].opts.content).toContain('"brief":"cũ"');
    expect(calls[0].opts.system).toContain("### illustration");
    const v = calls[0].validate!;
    expect(v({ template: "illustration", params: {} })).toContain('illustration cần "brief" (mô tả hình bằng lời)');
    expect(v({ template: "illustration", params: { brief: "x" } })).toEqual([]);
  });
  it("image-focus chỉ có trong thư viện khi cảnh đã có ảnh, và phải giữ nguyên mã ảnh", async () => {
    reply = { template: "title-card", params: TEMPLATES["title-card"].example, assumptions: [] };
    await designScene(video, scene, T as any);
    expect(calls[0].opts.system).not.toContain("### image-focus");
    expect(calls[0].validate!({ template: "image-focus", params: { image: "x" } })).toEqual(['template "image-focus" không có trong thư viện']);
    calls.length = 0;
    const img = "0123456789abcdef-10x10.png";
    await designScene(video, { ...scene, design: { template: "image-focus", params: { image: img }, by: "user" } }, T as any);
    expect(calls[0].opts.system).toContain("### image-focus");
    expect(calls[0].validate!({ template: "image-focus", params: { image: img } })).toEqual([]);
    expect(calls[0].validate!({ template: "image-focus", params: { image: "khac" } }).join()).toContain("giữ nguyên");
  });
  it("drawIllustration: lấy khối svg, lọc an toàn, cần ≥ 2 nhóm part; sai thì hỏi lại kèm lỗi", async () => {
    const good = `<svg viewBox="0 0 800 600"><g id="part-1"><rect x="0" y="500" width="800" height="60" fill="var(--bg2)"/><circle cx="1" cy="1" r="1"/><circle cx="2" cy="1" r="1"/></g><g id="part-2"><circle cx="400" cy="300" r="80" fill="#ff0000" onclick="x()"/><path class="draw" pathLength="1" d="M0 0 L10 10" stroke="var(--ink)"/><script>alert(1)</script></g></svg>`;
    const answers = ["Không có hình", "```svg\n<svg viewBox=\"0 0 800 600\"><circle r=\"1\"/></svg>\n```", "```svg\n" + good + "\n```"];
    const { ask } = await import("../src/client");
    for (let i = 0; i < 3; i++) (ask as any).mockImplementationOnce(async (opts: any) => (calls.push({ opts }), answers.shift()));
    const r = await drawIllustration("Công nhân đội mũ bảo hộ", { strokeWidth: 5, dark: false });
    expect(calls.length).toBe(3);
    expect(calls[0].opts.system).toContain("var(--accent)");
    expect(calls[0].opts.system).toContain('stroke-width="5"');
    expect(calls[2].opts.content).toContain("part-N");
    expect(r.svg).toContain('<g id="part-2">');
    expect(r.svg).not.toMatch(/script|onclick|#ff0000/);
    expect(r.svg).toContain("fill:var(--ink-soft)");
  });
});

describe("writeCustomScene", () => {
  it("system prompt có cả hai checklist và nhắc hợp đồng thắng", async () => {
    reply = '```html\n<ok/>\n```\n```json\n{"assumptions":["a"]}\n```';
    const r = await writeCustomScene(video, scene, { engine: "hyperframes", T: T as any, contract: "HĐ", examples: [], lint: () => [] });
    expect(r).toEqual({ code: "<ok/>", assumptions: ["Cảnh tùy biến do AI viết mã", "a"] });
    const { opts } = calls[0];
    expect(opts.system).toContain(MOTION_CHECKLIST);
    expect(opts.system).toContain(CUSTOM_SCENE_CHECKLIST);
    expect(opts.system).toContain("hợp đồng thắng");
  });
});

describe("rà soát cách đọc", () => {
  const items = Array.from({ length: 130 }, (_, i) => ({ id: `s1#${i}`, text: `Câu ${i}`, tts: i === 1 ? "Nghỉ [nghỉ 1s] tiếp" : `câu ${i}`, warnings: [] as string[] }));
  it("prompt: rà soát mọi câu, quy tắc ISO/số/viết tắt, giữ thẻ, chỉ trả câu cần đổi kèm lý do + thuật ngữ", () => {
    const p = reviewReadingsPrompt([{ id: "s1#0", text: "Hệ thống ISO 45001 và HSE.", tts: "Hệ thống ISO 45001 và HSE.", warnings: ["Còn chữ số: 45001"] }], "An toàn lao động");
    for (const k of ["ISO 45001", "i sô bốn lăm nghìn không trăm linh một", "2,78", "sáu mươi phần trăm", "[nghỉ …]", "KHÔNG BỊA SỐ LIỆU"]) expect(p.system).toContain(k);
    for (const k of ["TỪNG câu", "kể cả câu không có cảnh báo", "các bon", '"suggestions"', '"reason"', '"glossary"', "CHỈ gồm các câu cần đổi", "Hệ thống ISO 45001 và HSE.", "An toàn lao động"]) expect(p.content).toContain(k);
  });
  it("chia lượt ≤ 60 câu; bỏ đề xuất sai id / trùng cách đọc / mất thẻ [nghỉ]", async () => {
    const { askJson } = await import("../src/client");
    const replies = [
      { suggestions: [{ id: "s1#0", tts: "câu không", reason: "đọc số", glossary: [{ term: "HSE", reading: "hát ét ét" }, { term: "", reading: "x" }] }, { id: "s1#1", tts: "Nghỉ tiếp" }, { id: "s1#2", tts: "câu 2" }, { id: "s9#0", tts: "x" }] },
      { suggestions: [{ id: "s1#61", tts: "câu sáu mươi mốt", reason: " " }] },
      { suggestions: [] },
    ];
    for (const r of replies) (askJson as any).mockImplementationOnce(async (opts: any, validate: any) => (calls.push({ opts, validate }), r));
    const progress: number[] = [];
    const out = await reviewReadings(items, "ctx", (d) => progress.push(d));
    expect(REVIEW_BATCH).toBe(60);
    expect(calls).toHaveLength(3);
    expect(calls[0].opts.content).toContain('"s1#59"');
    expect(calls[0].opts.content).not.toContain('"s1#60"');
    expect(calls[2].opts.content).toContain('"s1#129"');
    expect(calls[0].validate!({})).toEqual(["Thiếu suggestions"]);
    expect(progress).toEqual([60, 120, 130]);
    expect(out).toEqual([
      { id: "s1#0", tts: "câu không", reason: "đọc số", glossary: [{ term: "HSE", reading: "hát ét ét" }] },
      { id: "s1#61", tts: "câu sáu mươi mốt", reason: undefined, glossary: undefined },
    ]);
  });
  it("fixReadings vẫn dùng prompt sửa (fixes)", async () => {
    reply = { fixes: [{ id: "s1#0", tts: "câu không" }, { id: "khac", tts: "x" }] };
    expect(await fixReadings(items.slice(0, 1))).toEqual([{ id: "s1#0", tts: "câu không" }]);
    expect(calls[0].opts.content).toContain('"fixes"');
  });
});
