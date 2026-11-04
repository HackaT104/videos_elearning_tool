// Nhật ký quyết định ("Vì sao AI chọn") + quy tắc đa dạng trong prompt chọn template – không gọi mạng.
import { describe, expect, it, vi } from "vitest";

let reply: any = null;
const calls: any[] = [];
vi.mock("../src/client", () => ({ askJson: vi.fn(async (opts: any) => (calls.push(opts), reply)), ask: vi.fn() }));
const { decisionFrom, designScene, designPrompt } = await import("../src/index");
const { TEMPLATES } = await import("@cvs/engine");

const scene: any = { id: "s2", title: "Hai", scriptStart: 0, scriptEnd: 20, visual: "", onscreen: [], sentences: [{ text: "Câu một." }] };
const video: any = { key: "V1", title: "T", level: "L1", scenes: [{ id: "s1", design: { template: "title-card" } }, scene, { id: "s3" }] };

describe("nhật ký quyết định", () => {
  it("chuẩn hoá: lọc template lạ/trùng, tối đa 3, độ tin 0..1 (nhận cả 0–100), thiếu lý do → bỏ", () => {
    expect(decisionFrom({ template: "stat-hero", alternatives: ["bar-compare", "khong-co", "stat-hero", "bar-compare", "icon-grid", "flow-chain", "checklist"], reason: "  Một con số lớn  ", confidence: 85 }, "ai")).toEqual({
      template: "stat-hero", alternatives: ["bar-compare", "icon-grid", "flow-chain"], reason: "Một con số lớn", confidence: 0.85, by: "ai",
    });
    expect(decisionFrom({ template: "stat-hero", reason: "x", confidence: "abc" }, "claude-code")).toMatchObject({ alternatives: [], confidence: 0.5, by: "claude-code" });
    expect(decisionFrom({ template: "stat-hero", alternatives: ["bar-compare"] }, "ai")).toBeUndefined();
  });

  it("designScene lưu decision vào design (tuỳ chọn – trả lời cũ vẫn chạy)", async () => {
    const id = "title-card";
    reply = { template: id, params: TEMPLATES[id].example, assumptions: [], alternatives: ["kinetic-statement"], reason: "Cảnh mở đầu", confidence: 0.9 };
    expect((await designScene(video, { ...scene, sentences: [{ text: "a" }, { text: "b" }] })).design.decision).toEqual({ template: id, alternatives: ["kinetic-statement"], reason: "Cảnh mở đầu", confidence: 0.9, by: "ai" });
    reply = { template: id, params: TEMPLATES[id].example, assumptions: [] };
    expect((await designScene(video, { ...scene, sentences: [{ text: "a" }, { text: "b" }] })).design).not.toHaveProperty("decision");
  });

  it("prompt có quy tắc đa dạng + template các cảnh khác", () => {
    const p = designPrompt(video, scene);
    expect(p.content).toContain("không chọn trùng template với cảnh liền trước/liền sau");
    expect(p.content).toContain("không quá 40% số cảnh");
    expect(p.content).toContain("s1: title-card, s2: (cảnh này), s3: chưa thiết kế");
    expect(p.content).toContain('"alternatives": string[], "reason": string, "confidence": number');
  });
});
