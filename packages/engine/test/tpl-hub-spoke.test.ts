import { describe, expect, it } from "vitest";
import { THEMES } from "@cvs/themes";
import { TEMPLATES, validateParams } from "../src";
import { hubSpoke, type HubSpokeParams } from "../src/templates/hub-spoke";

const ctx = (sentences = ["Một.", "Hai.", "Ba.", "Bốn."]) => ({ p: "s4", theme: THEMES["giay-ky-thuat"], slow: false, sentences, sceneTitle: "x" });
const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
const sizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
const check = (s: ReturnType<typeof hubSpoke.build>) => {
  const all = ids(s.html);
  expect(all.every((i) => i.startsWith("s4-"))).toBe(true);
  expect(new Set(all).size).toBe(all.length);
  for (const a of s.anims) expect(all, a.id).toContain(a.id);
  expect(Math.min(...sizes(s.html))).toBeGreaterThanOrEqual(28);
};

describe("template hub-spoke", () => {
  it("dựng được với tham số mẫu, schema chấp nhận", () => {
    TEMPLATES[hubSpoke.id] = hubSpoke;
    expect(validateParams(hubSpoke.id, hubSpoke.example as Record<string, unknown>)).toEqual([]);
    const s = hubSpoke.build(hubSpoke.example, ctx());
    check(s);
    expect(s.texts).toContain(hubSpoke.example.hub.label);
    for (const sp of hubSpoke.example.spokes) expect(s.texts).toContain(sp.label);
    // mỗi vệ tinh: một đường nối vẽ nét + thẻ bật lên
    expect(s.anims.filter((a) => a.to.dash === 0).length).toBe(hubSpoke.example.spokes.length);
  });
  it("6 vệ tinh có chữ phụ, 1 câu thoại: thẻ trong vùng an toàn, không trùng mốc", () => {
    const P: HubSpokeParams = {
      hub: { label: "Hệ thống quản lý môi trường doanh nghiệp" },
      spokes: Array.from({ length: 7 }, (_, i) => ({ label: `Bên liên quan số ${i + 1} rất dài`, text: "Dòng phụ ngắn gọn" })),
    };
    const s = hubSpoke.build(P, ctx(["Một."]));
    check(s);
    expect(s.html).not.toContain("s4-sp6");
    for (const m of s.html.matchAll(/id="s4-sp\d" class="card[^"]*" style="left:(-?\d+)px;top:(-?\d+)px;width:(\d+)px;height:(\d+)px/g)) {
      const [x, y, w, h] = m.slice(1).map(Number);
      expect(x).toBeGreaterThanOrEqual(96);
      expect(x + w).toBeLessThanOrEqual(1824);
      expect(y).toBeGreaterThanOrEqual(54);
      expect(y + h).toBeLessThanOrEqual(1026);
    }
    const starts = s.anims.filter((a) => a.to.dash === 0).map((a) => JSON.stringify(a.at));
    expect(new Set(starts).size).toBe(starts.length);
  });
});
