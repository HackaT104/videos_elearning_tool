import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeTiming, parseInputFile, type Video } from "@cvs/core";
import { autoDesign } from "@cvs/engine";
import { sceneShapes, varietyQa } from "../src/variety";

const load = async () => {
  const r = await parseInputFile("Kich_ban_L1.docx", readFileSync(new URL("../../../fixtures/Kich_ban_L1.docx", import.meta.url)), { course: "ISO", level: "L1" } as never);
  const v = r.videos[0] as Video;
  v.scenes.forEach((s, i) => (s.design = autoDesign(v, s, i)));
  return v;
};

describe("nguy cơ giống trình chiếu", () => {
  it("video đa dạng → không cảnh báo", async () => {
    const v = await load();
    expect(sceneShapes(v).map((s) => s.template)).toEqual(["title-card", "split-compare", "quote-banner"]);
    expect(varietyQa(v, computeTiming(v, null))).toEqual([]);
  });

  it("cùng template > 40%, liền nhau, nhiều cảnh chỉ chữ, cảnh dài ít chuyển động", async () => {
    const v = await load();
    const base = v.scenes[2];
    v.scenes = [v.scenes[0], v.scenes[1], ...[3, 4, 5].map((n) => ({ ...base, id: `s${n}` }))];
    const t = computeTiming(v, null);
    t.scenes[1] = { ...t.scenes[1], dur: 25 }; // split-compare: 3 phần tử chuyển động
    const msgs = varietyQa(v, t).map((i) => `${i.scene ?? "-"} ${i.message}`);
    expect(msgs.some((m) => /«quote-banner» dùng cho 3\/5 cảnh \(60% > 40%\)/.test(m))).toBe(true);
    expect(msgs.some((m) => /4\/5 cảnh chỉ có chữ/.test(m))).toBe(true);
    expect(msgs.filter((m) => /Hai cảnh liền nhau/.test(m)).map((m) => m.split(" ")[0])).toEqual(["s4", "s5"]);
    expect(msgs.some((m) => /^s2 Cảnh dài 25 s nhưng chỉ có 3 phần tử chuyển động/.test(m))).toBe(true);
    expect(varietyQa(v, t).every((i) => i.kind === "variety" && i.severity === "warning")).toBe(true);
  });
});
