import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { kineticStatement } from "../src/templates/kinetic-statement";

const ctx = (sentences = ["Một.", "Hai."]) => ({ p: "s7", theme: THEMES["bang-trang"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

describe("template kinetic-statement", () => {
  it("dựng được với tham số mẫu, schema chấp nhận", () => {
    TEMPLATES[kineticStatement.id] = kineticStatement;
    expect(validateParams(kineticStatement.id, kineticStatement.example as Record<string, unknown>)).toEqual([]);
    const s = kineticStatement.build(kineticStatement.example, ctx());
    const all = ids(s.html);
    expect(all.every((i) => i.startsWith("s7-"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const a of s.anims) expect(all, a.id).toContain(a.id);
    expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
    for (const l of kineticStatement.example.lines) expect(s.texts).toContain(l.text);
    expect(s.texts).toContain(kineticStatement.example.source);
  });
  it("mỗi từ (tách theo khoảng trắng) một rãnh; cỡ chữ khác nhau theo dòng; câu 1 → các dòng rải trong câu", () => {
    const s = kineticStatement.build({ lines: [{ text: "Không đo được" }, { text: "thì **không quản lý được**" }] }, ctx(["Một."]));
    const words = s.anims.filter((a) => /-w\d+$/.test(a.id));
    expect(words).toHaveLength(8);
    const [a, b] = sizes(s.html);
    expect(b).toBeGreaterThan(a);
    const lineAt = s.anims.filter((x) => /^s7-l\d$/.test(x.id)).map((x) => x.at as { cue: number; f: number });
    expect(lineAt[1].f).toBeGreaterThan(lineAt[0].f);
  });
});
