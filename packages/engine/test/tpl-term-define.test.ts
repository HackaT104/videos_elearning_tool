import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { termDefine } from "../src/templates/term-define";

const ctx = (sentences = ["Một.", "Hai.", "Ba."]) => ({ p: "s2", theme: THEMES["toi-dien-anh"], slow: true, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

describe("template term-define", () => {
  it("dựng được với tham số mẫu, schema chấp nhận", () => {
    TEMPLATES[termDefine.id] = termDefine;
    expect(validateParams(termDefine.id, termDefine.example as Record<string, unknown>)).toEqual([]);
    const s = termDefine.build(termDefine.example, ctx());
    const all = ids(s.html);
    expect(all.every((i) => i.startsWith("s2-"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const a of s.anims) expect(all, a.id).toContain(a.id);
    expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
    expect(s.texts).toEqual(expect.arrayContaining([termDefine.example.term, termDefine.example.definition, termDefine.example.confusable!.term]));
  });
  it("vòng elip vẽ nét + mỗi từ khoá một thanh tô nền scaleX", () => {
    const s = termDefine.build({ term: "CO₂e", definition: "Quy đổi về **CO₂ tương đương** theo **GWP**." }, ctx(["Một."]));
    expect(s.anims.some((a) => a.id === "s2-ring" && a.from.dash === 1)).toBe(true);
    expect(s.anims.filter((a) => /s2-hl\d/.test(a.id) && a.to.scaleX === 1)).toHaveLength(2);
    expect(s.html).toContain("CO<sub>2</sub>");
  });
});
