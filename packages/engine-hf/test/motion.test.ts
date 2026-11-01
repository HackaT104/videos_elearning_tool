import { describe, expect, it } from "vitest";
import { gsap } from "gsap";
import { easeFn, type Anim } from "@cvs/engine";
import { compileAnims, wipeCss } from "../src/compile";

describe("ease giống GSAP đã cài", () => {
  const names = ["power2.out", "power3.inOut", "sine.inOut", "expo.out", "expo.inOut", "circ.out", "back.out(1.6)", "back.inOut", "elastic.out", "elastic.out(1, 0.3)", "elastic.out(1.2, 0.4)", "elastic.out(0.7, 0.5)", "elastic.inOut", "elastic.in", "bounce.out", "bounce.in", "bounce.inOut", "circ.inOut", "elastic", "bounce", "expo", "back", "back(2.2)", "power3", "quad.in", "cubic.inOut", "strong.out", "power0", "linear"];
  for (const n of names)
    it(n, () => {
      const g = gsap.parseEase(n);
      const m = easeFn(n);
      for (let i = 0; i <= 50; i++) expect(m(i / 50)).toBeCloseTo(g(i / 50), 9);
    });
});

describe("wipe biên dịch sang biến CSS", () => {
  const T = { dur: 6, cues: [0.5, 3], ends: [2.8, 5.5] };
  const a: Anim = { id: "s1-box", from: { wipe: 0, opacity: 0 }, to: { wipe: 1, opacity: 1 }, at: { cue: 0, f: 0.2 }, dur: 0.8, ease: "power3.inOut" };
  const up: Anim = { id: "s1-col", from: { wipeUp: 0 }, to: { wipeUp: 1 }, at: { cue: 1 }, dur: 0.8, ease: "power3.inOut" };
  it("tl.fromTo tween --cvs-wx / --cvs-wy", () => {
    const lines = compileAnims([a, up], T);
    expect(lines[0]).toBe(`tl.fromTo("#s1-box", { opacity: 0, "--cvs-wx": 0 }, { opacity: 1, "--cvs-wx": 1, duration: 0.8, ease: "power3.inOut" }, at(0, 0.2));`);
    expect(lines[1]).toContain(`{ "--cvs-wy": 0 }`);
  });
  it("dash tắt autoRound (pathLength=1 không bị làm tròn 1 → 0)", () => {
    const d: Anim = { id: "s1-p", from: { dash: 1 }, to: { dash: 0 }, at: { cue: 0 }, dur: 0.8, ease: "power2.out" };
    expect(compileAnims([d, a], T)[0]).toContain("autoRound: false");
    expect(compileAnims([a], T)[0]).not.toContain("autoRound");
  });
  it("luật clip-path chỉ đọc trục đang dùng", () => {
    const css = wipeCss([a, up]);
    expect(css).toContain("#s1-box { clip-path: inset(0% calc((1 - var(--cvs-wx, 1)) * 100%) 0% 0%); }");
    expect(css).toContain("#s1-col { clip-path: inset(calc((1 - var(--cvs-wy, 1)) * 100%) 0% 0% 0%); }");
  });
});
