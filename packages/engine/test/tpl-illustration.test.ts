import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { buildSceneSpec, TEMPLATES, validateParams } from "../src";
import { illustration } from "../src/templates/illustration";

const ctx = (n = 4) => ({ p: "s2", theme: THEMES["giay-ky-thuat"], slow: false, sentences: Array.from({ length: n }, (_, i) => `Câu ${i + 1}.`), sceneTitle: "x" });

export const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
<g id="part-2"><circle cx="400" cy="200" r="70" fill="var(--card)" stroke="var(--ink)" stroke-width="6"/><path class="draw" pathLength="1" d="M330 200 Q400 110 470 200" fill="none" stroke="var(--accent)" stroke-width="6"/></g>
<g id="part-1"><rect x="80" y="480" width="640" height="40" rx="10" fill="var(--bg2)"/><path class="draw" d="M80 480 H720" stroke="var(--ink)"/></g>
<g id="part-3"><rect x="340" y="280" width="120" height="180" rx="20" fill="var(--accent)" onclick="alert(1)"/></g>
<script>alert(1)</script>
</svg>`;

const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);

describe("template illustration", () => {
  it("SVG đã lọc nằm trong div HTML; mọi id có tiền tố cảnh, không trùng; nhóm hiện dần theo part-N; nét draw có pathLength", () => {
    const spec = illustration.build({ ...illustration.example, svg: SAMPLE_SVG }, ctx());
    const all = ids(spec.html);
    for (const id of all) expect(id.startsWith("s2-")).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const a of spec.anims) expect(all).toContain(a.id);
    expect(spec.html).not.toMatch(/<script|onclick/);
    // part-1 trước part-2 trước part-3 (sắp theo N, không theo thứ tự trong file)
    const parts = spec.anims.filter((a) => /-i-cvsp\d$/.test(a.id));
    expect(parts.length).toBe(3);
    const order = parts.map((a) => ("cue" in a.at ? a.at.cue + (a.at.f ?? 0) : 0));
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(spec.html.indexOf('id="s2-i-cvsp1"')).toBeLessThan(spec.html.indexOf('id="s2-i-cvsp0"')); // thứ tự vẽ giữ nguyên
    // con SVG chỉ tween opacity/dash; scale chỉ trên div bọc
    for (const a of spec.anims.filter((a) => a.id.includes("-i-"))) for (const k of Object.keys({ ...a.from, ...a.to })) expect(["opacity", "dash"]).toContain(k);
    const draws = spec.anims.filter((a) => a.from.dash === 1);
    expect(draws.length).toBe(2);
    expect(spec.html.match(/<path[^>]*class="draw"[^>]*pathLength="1"/g)!.length).toBe(2);
    const wrap = spec.anims.find((a) => a.id === "s2-ill")!;
    expect(wrap.from.scale).toBeLessThan(1);
    // ý chính hiện ở các câu cuối
    expect(spec.anims.filter((a) => /s2-pt\d/.test(a.id) && a.to.opacity === 1).length).toBe(3);
    expect(spec.texts).toEqual(expect.arrayContaining(["Mũ bảo hộ cài quai", "Găng tay chống cắt"]));
    for (const m of spec.html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(28);
    expect(spec.assumptions.some((x) => x.includes("AI vẽ"))).toBe(true);
  });

  it("không có SVG (chưa đăng nhập Claude) → khung giữ chỗ + ghi chú, không lỗi; SVG hỏng → giữ chỗ", () => {
    const spec = illustration.build(illustration.example, ctx());
    expect(spec.html).toContain("dashed");
    expect(spec.html).toContain("<svg viewBox=\"0 0 24 24\""); // biểu tượng ảnh
    expect(spec.assumptions.some((x) => x.includes("Chưa có hình minh hoạ"))).toBe(true);
    const bad = illustration.build({ svg: "<svg><g></svg>", layout: "full" }, ctx(2));
    expect(bad.assumptions.some((x) => x.includes("bị từ chối"))).toBe(true);
  });

  it("bố cục left/right/full + caption; SVG không có part → gom con cấp 1", () => {
    const flat = `<svg viewBox="0 0 400 400">${Array.from({ length: 9 }, (_, i) => `<circle cx="${i * 40 + 20}" cy="200" r="15" fill="var(--alt)"/>`).join("")}</svg>`;
    for (const layout of ["left", "right", "full"] as const) {
      const spec = illustration.build({ svg: flat, caption: "Mỗi vòng là một **bước**", points: [{ text: "Một" }, { text: "Hai" }], layout }, ctx(3));
      expect(spec.anims.filter((a) => /-i-cvsp\d$/.test(a.id)).length).toBe(5); // 9 con → 5 nhóm (2 mỗi nhóm)
      expect(spec.html).toContain('id="s2-cap"');
      const left = Number(/id="s2-ill" class="abs" style="left:(\d+)px/.exec(spec.html)![1]);
      if (layout === "right") expect(left).toBeGreaterThan(600);
      if (layout === "left") expect(left).toBeLessThan(400);
    }
  });

  it("đăng ký trong TEMPLATES; validateParams nhận ví dụ; dựng qua buildSceneSpec không lỗi", () => {
    expect(TEMPLATES.illustration).toBe(illustration);
    expect(validateParams("illustration", illustration.example as Record<string, unknown>)).toEqual([]);
    expect(validateParams("illustration", { points: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] })).not.toEqual([]);
    const video: any = { key: "V", title: "T", level: "L1", style: "giay-ky-thuat", scenes: [] };
    const scene: any = { id: "s1", title: "x", visual: "", onscreen: [], scriptStart: 0, scriptEnd: 10, sentences: [{ text: "A." }, { text: "B." }], design: { template: "illustration", params: { svg: SAMPLE_SVG, layout: "full" }, by: "ai" } };
    video.scenes = [scene];
    const spec = buildSceneSpec(video, scene);
    expect(spec.errors).toEqual([]);
    expect(spec.template).toBe("illustration");
  });
});
