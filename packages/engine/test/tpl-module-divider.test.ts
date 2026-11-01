import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { moduleDivider } from "../src/templates/module-divider";

const ctx = (sentences = ["Một.", "Hai.", "Ba.", "Bốn."]) => ({ p: "s1", theme: THEMES["giay-ky-thuat"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

describe("template module-divider", () => {
  it("dựng được với tham số mẫu, schema chấp nhận", () => {
    TEMPLATES[moduleDivider.id] = moduleDivider;
    expect(validateParams(moduleDivider.id, moduleDivider.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams(moduleDivider.id, { title: "x" })).toEqual(expect.arrayContaining(['Thiếu "number"', 'Thiếu "total"']));
    const s = moduleDivider.build(moduleDivider.example, ctx());
    const all = ids(s.html);
    expect(all.every((i) => i.startsWith("s1-"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const a of s.anims) expect(all, a.id).toContain(a.id);
    expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
    expect(s.texts).toEqual(expect.arrayContaining(["02", moduleDivider.example.title, ...moduleDivider.example.goals!.map((g) => g.text)]));
  });
  it("N đoạn; đoạn đã học tô scaleX, đoạn hiện tại nhấp opacity; số kẹp trong 1..total", () => {
    const s = moduleDivider.build({ number: 3, total: 6, title: "Học phần ba" }, ctx(["Một."]));
    expect(s.html.match(/id="s1-tr\d+"/g)).toHaveLength(6);
    expect(s.anims.filter((a) => /^s1-fl\d$/.test(a.id) && a.to.scaleX === 1).map((a) => a.id)).toEqual(["s1-fl0", "s1-fl1"]);
    expect(s.anims.filter((a) => a.id === "s1-fl2" && a.to.opacity !== undefined).length).toBeGreaterThanOrEqual(3);
    const big = moduleDivider.build({ number: 9, total: 4, title: "x" }, ctx());
    expect(big.texts).toContain("04");
  });
});
