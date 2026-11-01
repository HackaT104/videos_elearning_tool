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

const { CUSTOM_SCENE_CHECKLIST, MOTION_CHECKLIST, designScene, reviseScene, writeCustomScene } = await import("../src/index");
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
    for (const id of DESIGN_TEMPLATE_IDS.filter((t) => fits(TEMPLATES[t].example))) expect(validate({ template: id, params: TEMPLATES[id].example })).toEqual([]);
    const tc = { ...TEMPLATES["title-card"].example, at: { subtitle: { cue: 5 } } };
    expect(validate({ template: "title-card", params: tc }).some((e) => e.includes("vượt quá số câu (2)"))).toBe(true);
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
