import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { uiWalkthrough } from "../src/templates/ui-walkthrough";

const ctx = (n = 4) => ({ p: "s5", theme: THEMES["giay-ky-thuat"], slow: false, sentences: Array.from({ length: n }, (_, i) => `Câu ${i + 1}.`), sceneTitle: "x" });

describe("template ui-walkthrough", () => {
  it("dựng được với tham số mẫu, id có tiền tố và không trùng, chữ ≥ 28 px", () => {
    const spec = uiWalkthrough.build(uiWalkthrough.example, ctx());
    const ids = [...spec.html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(id.startsWith("s5-")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of spec.anims) expect(ids).toContain(a.id);
    for (const m of spec.html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(28);
    expect(spec.texts).toEqual(expect.arrayContaining(["Hệ thống quản lý an toàn", "Báo cáo sự cố", "Khu vực", "Xưởng ép nhựa", "Gửi báo cáo", "Khai báo sự cố mới"]));
  });
  it("con trỏ di chuyển x/y tới từng bước, gợn sóng và phóng to ở bước cuối", () => {
    const spec = uiWalkthrough.build(uiWalkthrough.example, ctx());
    const moves = spec.anims.filter((a) => a.id === "s5-cur" && a.to.x !== undefined);
    expect(moves.length).toBe(4);
    for (let i = 1; i < moves.length; i++) expect(moves[i].from).toEqual({ x: moves[i - 1].to.x, y: moves[i - 1].to.y });
    expect(spec.anims.filter((a) => a.id.startsWith("s5-rip")).length).toBe(8);
    const z = spec.anims.find((a) => a.id === "s5-zoom")!;
    expect(z.to.scale).toBeGreaterThan(1.1);
    expect(spec.html).toMatch(/id="s5-zoom" class="abs cvs-cam"/);
    const noZoom = uiWalkthrough.build({ ...uiWalkthrough.example, zoom: false }, ctx());
    expect(noZoom.anims.some((a) => a.id === "s5-zoom")).toBe(false);
  });
  it("validateParams chấp nhận ví dụ; tham số tối thiểu dựng được", () => {
    TEMPLATES[uiWalkthrough.id] ??= uiWalkthrough;
    expect(validateParams(uiWalkthrough.id, uiWalkthrough.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams(uiWalkthrough.id, { window: { title: "A" }, steps: [{ label: "x", text: "y" }] })).not.toEqual([]);
    const spec = uiWalkthrough.build({ window: { title: "Phiếu HACCP" }, steps: [{ label: "Nhiệt độ", value: "3,8 °C", text: "Nhập" }, { label: "Lưu", text: "Bấm Lưu" }] }, ctx(1));
    expect(spec.html).toContain('id="s5-btn1"');
    expect(spec.html).toContain('id="s5-val0"');
  });
});
