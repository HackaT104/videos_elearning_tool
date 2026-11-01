import { describe, expect, it } from "vitest";
import { checkThemeFonts, THEME_IDS, THEMES } from "../src";

type RGB = [number, number, number];

/** "#RRGGBB" hoặc "rgba(r,g,b,a)" → RGB, màu trong suốt trộn lên nền `under`. */
function rgb(color: string, under: RGB = [255, 255, 255]): RGB {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`màu lạ: ${color}`);
  const [r, g, b, a = 1] = m[1].split(",").map(Number);
  return [r, g, b].map((v, i) => v * a + under[i] * (1 - a)) as RGB;
}

const lum = ([r, g, b]: RGB) => {
  const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

/** Tỉ lệ tương phản WCAG 2.x. */
function contrast(a: RGB, b: RGB): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Cặp chưa đạt 4,5:1 ở các theme cũ (màu nhận diện – đổi là đổi hẳn phong cách nên chưa sửa).
 * Không thêm theme mới vào đây: theme mới phải đạt đủ.
 */
const KNOWN_LOW: Partial<Record<string, string[]>> = {
  "giay-ky-thuat": ["accent", "money", "warn"],
  "toi-dien-anh": ["warn"],
  "phang-tuoi-sang": ["accent", "money", "warn"],
  "doanh-nghiep-xanh": ["money", "warn"],
  "pastel-hoc-duong": ["alt", "money", "warn"],
};

describe("tương phản màu theo WCAG (≥ 4,5:1 trên nền và trên thẻ)", () => {
  for (const id of THEME_IDS) {
    it(id, () => {
      const c = THEMES[id].colors;
      const bg = rgb(c.bg);
      const card = rgb(c.card, bg);
      for (const role of ["ink", "inkSoft", "accent", "alt", "money", "warn"] as const) {
        if (KNOWN_LOW[id]?.includes(role)) continue;
        for (const [where, under] of [["bg", bg], ["card", card]] as const) {
          expect(contrast(rgb(c[role], under), under), `${id}.${role} trên ${where}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
  it("chữ chính (ink, inkSoft) của mọi theme luôn đạt", () => {
    expect(Object.values(KNOWN_LOW).flat()).not.toContain("ink");
    expect(Object.values(KNOWN_LOW).flat()).not.toContain("inkSoft");
  });
});

describe("phông của mọi phong cách", () => {
  it("đủ ký tự tiếng Việt", async () => {
    for (const id of THEME_IDS) expect((await checkThemeFonts(THEMES[id])).missing, id).toEqual([]);
  });
});
