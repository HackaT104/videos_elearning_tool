import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { cycleLoop, type CycleLoopParams } from "../src/templates/cycle-loop";

const ctx = (sentences = ["Một.", "Hai.", "Ba.", "Bốn.", "Năm."]) => ({ p: "s4", theme: THEMES["giay-ky-thuat"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
const check = (s: ReturnType<typeof cycleLoop.build>) => {
  const all = ids(s.html);
  expect(all.every((i) => i.startsWith("s4-"))).toBe(true);
  expect(new Set(all).size).toBe(all.length);
  for (const a of s.anims) expect(all, a.id).toContain(a.id);
  expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
};

describe("template cycle-loop", () => {
  it("dựng được với tham số mẫu, schema chấp nhận", () => {
    TEMPLATES[cycleLoop.id] = cycleLoop;
    expect(validateParams(cycleLoop.id, cycleLoop.example as Record<string, unknown>)).toEqual([]);
    const s = cycleLoop.build(cycleLoop.example, ctx());
    check(s);
    for (const st of cycleLoop.example.stages) expect(s.texts).toContain(st.label);
    expect(s.texts).toContain(cycleLoop.example.center!.label);
    // N cung vẽ nét (khép vòng) + chấm chạy bằng xoay lớp bọc HTML, tăng dần tới đủ một vòng
    expect(s.anims.filter((a) => /-arc\d$/.test(a.id)).length).toBe(4);
    const rot = s.anims.filter((a) => a.id === "s4-orb" && a.to.rotate !== undefined).map((a) => a.to.rotate!);
    expect(rot[rot.length - 1] - rot[0]).toBeCloseTo(360, 0);
    expect(s.html).toMatch(/<div id="s4-orb"/);
  });
  it("6 giai đoạn, 1 câu: vẫn dựng được, chữ ≥ 28px", () => {
    const P: CycleLoopParams = { stages: Array.from({ length: 6 }, (_, i) => ({ label: `Giai đoạn ${i + 1}`, text: "Mô tả ngắn hai dòng cho giai đoạn này" })) };
    const s = cycleLoop.build(P, ctx(["Một."]));
    check(s);
    expect(s.anims.filter((a) => /-arc\d$/.test(a.id)).length).toBe(6);
  });
});
