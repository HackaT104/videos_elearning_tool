import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { donutShare } from "../src/templates/donut-share";

const ctx = (n = 4) => ({ p: "s7", theme: THEMES["giay-ky-thuat"], slow: false, sentences: Array.from({ length: n }, (_, i) => `Câu ${i + 1}.`), sceneTitle: "x" });

describe("template donut-share", () => {
  it("dựng được với tham số mẫu, id có tiền tố và không trùng", () => {
    const spec = donutShare.build(donutShare.example, ctx());
    const ids = [...spec.html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(id.startsWith("s7-")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of spec.anims) expect(ids).toContain(a.id);
    for (const c of spec.counts) expect(ids).toContain(c.id);
    for (const m of spec.html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(28);
    expect(spec.texts).toContain("Phạm vi 3 – chuỗi cung ứng");
    expect(spec.texts).toContain("70%");
    expect(spec.texts.some((t) => t.includes("nhà cung cấp"))).toBe(true);
    // vòng vẽ bằng dash 1 → 1−p
    const seg = spec.anims.find((a) => a.id === "s7-seg0")!;
    expect(seg.from.dash).toBe(1);
    expect(seg.to.dash).toBeCloseTo(1 - (0.7 - 0.006), 5);
    expect(spec.counts[0]).toMatchObject({ id: "s7-num", to: 70, suffix: "%" });
  });
  it("validateParams chấp nhận ví dụ", () => {
    TEMPLATES[donutShare.id] ??= donutShare;
    expect(validateParams(donutShare.id, donutShare.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams(donutShare.id, { segments: [] })).not.toEqual([]);
  });
  it("một đoạn, một câu; tổng > 100 thì ghi giả định", () => {
    const one = donutShare.build({ segments: [{ label: "Đạt", value: 95 }] }, ctx(1));
    expect(one.texts).toContain("95%");
    const over = donutShare.build({ segments: [{ label: "A", value: 80 }, { label: "B", value: 40 }] }, ctx(2));
    expect(over.assumptions.length).toBe(1);
  });
});
