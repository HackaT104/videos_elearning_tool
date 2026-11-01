import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { decisionTree, type DecisionTreeParams } from "../src/templates/decision-tree";

const ctx = (sentences = ["Một.", "Hai.", "Ba.", "Bốn.", "Năm."]) => ({ p: "s4", theme: THEMES["giay-ky-thuat"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
const check = (s: ReturnType<typeof decisionTree.build>) => {
  const all = ids(s.html);
  expect(all.every((i) => i.startsWith("s4-"))).toBe(true);
  expect(new Set(all).size).toBe(all.length);
  for (const a of s.anims) expect(all, a.id).toContain(a.id);
  expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
};

describe("template decision-tree", () => {
  it("dựng được với tham số mẫu, schema chấp nhận; nhánh chọn phủ màu nhấn", () => {
    TEMPLATES[decisionTree.id] = decisionTree;
    expect(validateParams(decisionTree.id, decisionTree.example as Record<string, unknown>)).toEqual([]);
    const s = decisionTree.build(decisionTree.example, ctx());
    check(s);
    expect(s.texts).toContain(decisionTree.example.question);
    expect(s.texts).toContain("Là điểm kiểm soát tới hạn (CCP)");
    expect(s.texts).toContain("Không");
    // đường tới lá 1 = 2 cạnh phủ màu; lá khác mờ
    expect(s.anims.filter((a) => /-hl\d$/.test(a.id)).length).toBe(2);
    expect(s.anims.some((a) => a.id === "s4-leaf0" && a.to.opacity !== undefined && a.to.opacity < 1)).toBe(true);
    expect(s.assumptions).toEqual([]);
  });
  it("không ghi nhãn 2 nhánh → tự thêm Có/Không và ghi assumptions; tối đa 4 lá", () => {
    const P: DecisionTreeParams = {
      question: "Câu hỏi?",
      branches: [
        { question: "Phụ 1?", branches: [{ outcome: { text: "L1" } }, { outcome: { text: "L2" } }] },
        { question: "Phụ 2?", branches: [{ outcome: { text: "L3" } }, { outcome: { text: "L4" } }, { outcome: { text: "L5" } }] },
      ],
      chosen: 3,
    };
    const s = decisionTree.build(P, ctx(["Một."]));
    check(s);
    expect(s.texts).toContain("Có");
    expect(s.assumptions.length).toBeGreaterThan(0);
    expect(s.html).toContain("s4-leaf3");
    expect(s.html).not.toContain("s4-leaf4");
    expect(s.texts).not.toContain("L5");
  });
});
