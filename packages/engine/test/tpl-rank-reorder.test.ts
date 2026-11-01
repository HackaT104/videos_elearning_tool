import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { rankReorder, ranks } from "../src/templates/rank-reorder";

const ctx = (n = 3) => ({ p: "s2", theme: THEMES["bang-trang"], slow: true, sentences: Array.from({ length: n }, (_, i) => `Câu ${i + 1}.`), sceneTitle: "x" });

describe("template rank-reorder", () => {
  it("dựng được với tham số mẫu, id có tiền tố và không trùng, chữ ≥ 28 px", () => {
    const spec = rankReorder.build(rankReorder.example, ctx());
    const ids = [...spec.html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(id.startsWith("s2-")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of spec.anims) expect(ids).toContain(a.id);
    for (const c of spec.counts) expect(ids).toContain(c.id);
    for (const m of spec.html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(28);
    expect(spec.texts).toEqual(expect.arrayContaining(["Trượt ngã", "Vật rơi", "2023", "2024", "42", "20"]));
  });
  it("hàng đổi chỗ bằng tween y tính sẵn; thanh co giãn cũ → mới", () => {
    expect(ranks([42, 31, 17, 9, 5])).toEqual([0, 1, 2, 3, 4]);
    expect(ranks([18, 12, 20, 6, 2])).toEqual([1, 2, 0, 3, 4]);
    const spec = rankReorder.build(rankReorder.example, ctx());
    const ys = spec.anims.filter((a) => /^s2-r\d$/.test(a.id) && !!a.to.y);
    expect(ys.map((a) => a.id).sort()).toEqual(["s2-r0", "s2-r1", "s2-r2"]);
    const up = ys.find((a) => a.id === "s2-r2")!;
    const down = ys.find((a) => a.id === "s2-r0")!;
    expect(up.to.y).toBeLessThan(0);
    expect(down.to.y! + up.to.y! / 2).toBeCloseTo(0, 5); // hạng 3 → 1 đi 2 ô, hạng 1 → 2 đi 1 ô
    const bar = spec.anims.filter((a) => a.id === "s2-bar0");
    expect(bar[0].from.scaleX).toBe(0);
    expect(bar[1].from.scaleX).toBeCloseTo(1, 5);
    expect(bar[1].to.scaleX).toBeCloseTo(18 / 42, 5);
    expect(spec.counts.find((c) => c.id === "s2-vn0")).toMatchObject({ from: 42, to: 18 });
  });
  it("validateParams chấp nhận ví dụ", () => {
    TEMPLATES[rankReorder.id] ??= rankReorder;
    expect(validateParams(rankReorder.id, rankReorder.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams(rankReorder.id, { items: [{ label: "a", from: 1, to: 2 }] })).not.toEqual([]);
  });
});
