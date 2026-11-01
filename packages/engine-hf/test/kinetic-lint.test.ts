import { describe, expect, it } from "vitest";
import { buildVideo, computeTiming } from "@cvs/core";
import { buildSceneSpec, KINETIC_PRESETS } from "@cvs/engine";
import { compileScene, lintScene } from "../src";

// mỗi preset chữ chuyển động (qua kinetic-statement) biên dịch ra cảnh HyperFrames qua lint, không repeat vô hạn
const v = buildVideo({ title: "K", fileName: "MO1_U1_1", scenes: [{ scriptStart: 0, scriptEnd: 10, title: "Chốt", visual: "Câu chốt", onscreen: ["x"], vo: "Câu một. Câu hai. Câu ba." }] }, { course: "C", level: "L1" }, 0);
const timing = computeTiming(v);

describe("kinetic-statement × preset → lint HyperFrames", () => {
  for (const { id: preset } of KINETIC_PRESETS)
    it(preset, () => {
      const lines = [{ text: "Năm 2024 giảm **25%**" }, { text: "An toàn là **thói quen**", alt: ["thủ tục"] }, { text: "Hệ thống dữ liệu" }];
      const sc = { ...v.scenes[0], design: { template: "kinetic-statement", params: { preset, lines, kicker: "Ghi nhớ" }, by: "user" as const } };
      const html = compileScene(buildSceneSpec({ ...v, scenes: [sc] }, sc), timing.scenes[0], { scene: sc, videoKey: v.key });
      const errs = lintScene(html, "s1").filter((i) => i.severity === "error" || i.rule === "unknown-ease" || i.rule === "repeat");
      expect(errs).toEqual([]);
      expect(html).not.toMatch(/repeat\s*:/);
    });
});
