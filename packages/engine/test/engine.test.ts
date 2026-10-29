import { describe, expect, it } from "vitest";
import { buildVideo } from "@cvs/core";
import { THEMES } from "@cvs/themes";
import { THEMES } from "@cvs/themes";
import { autoDesign, buildSceneSpec, easeFn, fitSize, formatViNumber, guessIcon, parseViNumber, resolveTime, rich, TEMPLATES } from "../src";

describe("engine dùng chung", () => {
  it("ease giống GSAP", () => {
    expect(easeFn("power2.out")(0.5)).toBeCloseTo(0.875, 5);
    expect(easeFn("expo.out")(1)).toBe(1);
    expect(easeFn("sine.inOut")(0.5)).toBeCloseTo(0.5, 5);
    expect(easeFn("back.out(1.4)")(1)).toBe(1);
  });
  it("resolveTime theo at(i,f)", () => {
    const T = { dur: 10, cues: [1, 4], ends: [3, 9] };
    expect(resolveTime({ cue: 1, f: 0.4 }, T)).toBeCloseTo(6, 5);
    expect(resolveTime({ end: 0.45 }, T)).toBeCloseTo(9.55, 5);
    expect(resolveTime({ t: 0.3 }, T)).toBe(0.3);
  });
  it("chữ ≥ 28 px khi co cỡ", () => expect(fitSize("x ".repeat(400), 300, 60)).toBe(28));
  it("số kiểu Việt", () => {
    expect(formatViNumber(1234567.8, 1)).toBe("1.234.567,8");
    expect(parseViNumber("423,9 ppm")).toBe(423.9);
    expect(parseViNumber("800.000")).toBe(800000);
  });
  it("chỉ số dưới và nhấn", () => expect(rich("CO₂ **mạnh**")).toBe("CO<sub>2</sub> <mark>mạnh</mark>"));
  it("đoán biểu tượng theo ranh giới từ", () => {
    expect(guessIcon("Giám sát")).toBe("magnifier");
    expect(guessIcon("Giá tín chỉ")).toBe("certificate");
    expect(guessIcon("giá cả")).toBe("coin");
  });
  it("mọi template dựng được với tham số mẫu, id có tiền tố cảnh", () => {
    for (const t of Object.values(TEMPLATES)) {
      const spec = t.build(t.example, { p: "s9", theme: THEMES["giay-ky-thuat"], slow: false, sentences: ["Một.", "Hai.", "Ba."], sceneTitle: "x" });
      for (const m of spec.html.matchAll(/(?<![\w-])id="([^"]+)"/g)) expect(m[1].startsWith("s9-"), `${t.id}: ${m[1]}`).toBe(true);
      for (const a of spec.anims) expect(spec.html.includes(`id="${a.id}"`), `${t.id} anim ${a.id}`).toBe(true);
    }
  });
  it("thiết kế tự động + ghi assumptions cho chữ không có trong kịch bản", () => {
    const v = buildVideo({ title: "Bài 1", fileName: "MO1_U1_1", scenes: [
      { scriptStart: 0, scriptEnd: 10, title: "Mở", visual: "", onscreen: ["Tín chỉ carbon"], vo: "Xin chào." },
      { scriptStart: 10, scriptEnd: 20, title: "So sánh", visual: "So sánh hai bên", onscreen: ["Phát thải", "Hấp thụ"], vo: "Một. Hai." },
    ] }, { course: "CAR", level: "L1" }, 0);
    expect(autoDesign(v, v.scenes[0], 0).template).toBe("title-card");
    expect(autoDesign(v, v.scenes[1], 1).template).toBe("split-compare");
    v.scenes[1].design = { template: "quote-banner", params: { quote: "Một con số bịa 99%" }, by: "ai" };
    const spec = buildSceneSpec(v, v.scenes[1]);
    expect(spec.assumptions.some((a) => a.includes("99%"))).toBe(true);
  });
  it("tham số sai → cảnh nháp + lỗi", () => {
    const v = buildVideo({ title: "B", fileName: "MO1_U1_1", scenes: [{ scriptStart: 0, scriptEnd: 5, title: "a", visual: "", onscreen: [], vo: "Một." }] }, { course: "C", level: "L1" }, 0);
    v.scenes[0].design = { template: "icon-grid", params: { items: [] }, by: "ai" };
    const spec = buildSceneSpec(v, v.scenes[0]);
    expect(spec.template).toBe("draft");
    expect(spec.errors.join()).toContain("ít nhất 2");
  });
});
