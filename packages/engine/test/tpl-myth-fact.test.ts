import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { mythFact, type MythFactParams } from "../src/templates/myth-fact";

const ctx = (sentences = ["Một.", "Hai.", "Ba.", "Bốn."]) => ({ p: "s4", theme: THEMES["giay-ky-thuat"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

describe("template myth-fact", () => {
  it("dựng được với tham số mẫu, schema chấp nhận", () => {
    TEMPLATES[mythFact.id] = mythFact;
    expect(validateParams(mythFact.id, mythFact.example as Record<string, unknown>)).toEqual([]);
    const s = mythFact.build(mythFact.example, ctx());
    const all = ids(s.html);
    expect(all.every((i) => i.startsWith("s4-"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const a of s.anims) expect(all, a.id).toContain(a.id);
    expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
    for (const p of mythFact.example.pairs) {
      expect(s.texts).toContain(p.myth);
      expect(s.texts).toContain(p.fact);
    }
    expect(s.assumptions.length).toBeGreaterThan(0);
  });
  it("mỗi dòng hiểu lầm một thanh gạch scaleX, chữ hiểu lầm ≥ 40px; tối đa 2 cặp", () => {
    const P: MythFactParams = { mythLabel: "Sai", factLabel: "Đúng", pairs: [{ myth: "Ngắn", fact: "Đúng" }, { myth: "Một câu hiểu lầm khá dài cần hai dòng để hiển thị đủ", fact: "Sự thật" }, { myth: "x", fact: "y" }] };
    const s = mythFact.build(P, ctx(["Một."]));
    const strikes = s.anims.filter((a) => a.to.scaleX === 1);
    expect(strikes.length).toBeGreaterThanOrEqual(2);
    expect(s.html).not.toContain("s4-m2");
    const myth = [...s.html.matchAll(/id="s4-mt\d" class="abs b t" style="[^"]*font-size:(\d+)px/g)].map((m) => Number(m[1]));
    expect(myth.every((v) => v >= 40)).toBe(true);
    expect(s.assumptions).toEqual([]);
  });
});
