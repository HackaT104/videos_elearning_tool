import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { quizCheck, type QuizCheckParams } from "../src/templates/quiz-check";

const ctx = (sentences = ["Một.", "Hai.", "Ba.", "Bốn."]) => ({ p: "s4", theme: THEMES["giay-ky-thuat"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
const check = (s: ReturnType<typeof quizCheck.build>) => {
  const all = ids(s.html);
  expect(all.every((i) => i.startsWith("s4-"))).toBe(true);
  expect(new Set(all).size).toBe(all.length);
  for (const a of s.anims) expect(all, a.id).toContain(a.id);
  expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
};

describe("template quiz-check", () => {
  it("dựng được với tham số mẫu, schema chấp nhận; đổi màu bằng lớp phủ opacity", () => {
    TEMPLATES[quizCheck.id] = quizCheck;
    expect(validateParams(quizCheck.id, quizCheck.example as Record<string, unknown>)).toEqual([]);
    const s = quizCheck.build(quizCheck.example, ctx());
    check(s);
    expect(s.texts).toContain(quizCheck.example.question);
    for (const o of quizCheck.example.options) expect(s.texts).toContain(o.text);
    expect(s.texts).toContain(quizCheck.example.explain);
    expect(s.assumptions.join()).toContain("A, B, C, D");
    // đếm ngược co scaleX tới mốc đáp án; lớp phủ đúng hiện bằng opacity; phương án sai mờ
    expect(s.anims.some((a) => a.id === "s4-fill" && a.to.scaleX === 0 && a.until)).toBe(true);
    expect(s.anims.some((a) => a.id === "s4-tint" && a.from.opacity === 0)).toBe(true);
    expect(s.anims.filter((a) => /^s4-o\d$/.test(a.id) && a.to.opacity !== undefined && a.to.opacity < 1).length).toBe(3);
  });
  it("2 phương án dài, 1 câu thoại, correct ngoài khoảng → kẹp về phương án cuối", () => {
    const P: QuizCheckParams = { question: "Câu hỏi khá dài ".repeat(8), options: [{ text: "Phương án một rất dài ".repeat(6) }, { text: "Hai" }], correct: 7 };
    const s = quizCheck.build(P, ctx(["Một."]));
    check(s);
    expect(s.html).toMatch(/id="s4-o1"[\s\S]*id="s4-ok"/);
  });
});
