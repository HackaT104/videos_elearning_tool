import { describe, expect, it } from "vitest";
import { checkThemeFonts, fontFaceCss, fontFaceUrlCss, fontFilePath, FONT_PAIRS, getFontPair, getTheme, themeVars } from "../src";

describe("cặp phông chữ", () => {
  it("mỗi cặp đủ ký tự tiếng Việt ở mọi độ đậm dùng tới", async () => {
    for (const p of FONT_PAIRS) {
      const r = await checkThemeFonts(getTheme("giay-ky-thuat", p.id));
      expect(r.missing, p.id).toEqual([]);
    }
  });
  it("getTheme đè phông, giữ màu; mã lạ hoặc 'theo-phong-cach' giữ phông gốc", () => {
    const base = getTheme("toi-dien-anh");
    const t = getTheme("toi-dien-anh", "playfair");
    expect(t.colors).toEqual(base.colors);
    expect(t.fonts.display.family).toBe("Playfair Display");
    expect(themeVars(t)["--font-display"]).toContain("serif");
    expect(getTheme("toi-dien-anh", "theo-phong-cach").fonts).toEqual(base.fonts);
    expect(getTheme("toi-dien-anh", "khong-co").fonts).toEqual(base.fonts);
    expect(getFontPair(undefined)).toBeUndefined();
  });
  it("nhúng phông theo cặp, không lẫn bộ đệm giữa các cặp cùng phong cách", async () => {
    const a = await fontFaceCss(getTheme("giay-ky-thuat", "lexend"));
    const b = await fontFaceCss(getTheme("giay-ky-thuat", "oswald"));
    expect(a).toContain("font-family:'Lexend'");
    expect(b).toContain("font-family:'Oswald'");
    expect(b).not.toContain("'Lexend'");
  });
  it("CSS xem trước trỏ tới file có thật và chặn đường dẫn lạ", () => {
    const css = fontFaceUrlCss([getFontPair("baloo")!.display], (pkg, file) => `/api/fonts/${pkg}/${file}`);
    const m = css.match(/\/api\/fonts\/([a-z0-9-]+)\/([a-z0-9-]+\.woff2)/)!;
    expect(fontFilePath(m[1], m[2])).toBeTruthy();
    expect(fontFilePath("../x", "a.woff2")).toBeNull();
    expect(fontFilePath("inter", "../../package.json")).toBeNull();
  });
});
