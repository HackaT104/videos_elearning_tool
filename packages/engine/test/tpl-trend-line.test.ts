import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { niceScale, trendLine } from "../src/templates/trend-line";

const ctx = (n = 3) => ({ p: "s4", theme: THEMES["toi-dien-anh"], slow: false, sentences: Array.from({ length: n }, (_, i) => `Câu ${i + 1}.`), sceneTitle: "x" });

describe("template trend-line", () => {
  it("dựng được với tham số mẫu, id có tiền tố và không trùng, chữ ≥ 28 px", () => {
    const spec = trendLine.build(trendLine.example, ctx());
    const ids = [...spec.html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(id.startsWith("s4-")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of spec.anims) expect(ids).toContain(a.id);
    for (const c of spec.counts) expect(ids).toContain(c.id);
    for (const m of spec.html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(28);
    expect(spec.texts).toEqual(expect.arrayContaining(["2019", "2024", "Năm cơ sở 2019", "32,6", "Năm 2024: giảm 32% so với năm cơ sở"]));
    expect(spec.counts[0]).toMatchObject({ to: 32.6, decimals: 1 });
    expect(spec.anims.some((a) => a.id === "s4-line" && a.from.dash === 1 && a.to.dash === 0)).toBe(true);
  });
  it("validateParams chấp nhận ví dụ", () => {
    TEMPLATES[trendLine.id] ??= trendLine;
    expect(validateParams(trendLine.id, trendLine.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams(trendLine.id, { points: [{ label: "a", value: 1 }] })).not.toEqual([]);
  });
  it("thang đẹp và nhãn trục hoành ≤ 8", () => {
    expect(niceScale(32.6, 48)).toEqual({ lo: 30, hi: 50, step: 5 });
    const pts = Array.from({ length: 12 }, (_, i) => ({ label: String(2014 + i), value: 12 - i }));
    const spec = trendLine.build({ points: pts }, ctx(1));
    const xl = [...spec.html.matchAll(/id="s4-xl\d+"/g)].length;
    expect(xl).toBeLessThanOrEqual(8);
    expect(spec.html).toContain('id="s4-xl11"');
  });
});
