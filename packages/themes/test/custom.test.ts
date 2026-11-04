// Phong cách tuỳ chỉnh: kiểm chặt, kẹp số, tự chỉnh tương phản, getTheme tra được, nền tham số.
import { describe, expect, it } from "vitest";
import { baseCss, buildCustomTheme, contrastRatio, fixLightness, forgetCustomTheme, getTheme, groundHtml, makeCustomThemeId, registerCustomTheme, setCustomThemeResolver, TEXT_ROLES, themeToDraft, THEMES, type ThemeDraft } from "../src";

const ID = "tuy-chinh-thu-abc123" as const;
const draft = (): ThemeDraft => ({
  name: "Gạch nung ấm",
  description: "Nền kem, đỏ gạch.",
  colors: { bg: "#F7F1E8", bg2: "#EFE4D3", bg3: "#FFFDF8", grid: "#E6D9C4", ink: "#2B2420", inkSoft: "#665A50", accent: "#A6402A", alt: "#2F5F7A", money: "#7A5A12", warn: "#B03A2E", card: "#FFFDF8", cardBorder: "#D9C8AE", line: "#2B2420", highlight: "#F3D9B8" },
  fontPair: "be-vietnam",
  card: "outline",
  ground: "custom",
  groundSpec: { gradient: { angle: 160, from: "#F7F1E8", to: "#EFE4D3" }, pattern: "dots", patternOpacity: 0.08, patternSize: 40, noise: 0.12 },
  radius: 14,
  stroke: 3,
  motion: { enterEase: "power3.out", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.9, slowEnterEase: "sine.out", slowEnterDur: 1.1, rise: 24, camera: 0.012 },
  kickerUpper: true,
});
const allPass = (t: { colors: Record<string, string>; groundSpec?: { gradient?: { from: string; to: string } } }) => {
  const s = [t.colors.bg, t.colors.card, ...(t.groundSpec?.gradient ? [t.groundSpec.gradient.from, t.groundSpec.gradient.to] : [])];
  for (const r of TEXT_ROLES) for (const x of s) expect(contrastRatio(t.colors[r], x), `${r} trên ${x}`).toBeGreaterThanOrEqual(4.5);
};

describe("buildCustomTheme", () => {
  it("bản nháp hợp lệ → Theme cùng dạng, phông từ cặp phông, không chỉnh gì", () => {
    const r = buildCustomTheme(draft(), ID);
    expect(r.errors).toEqual([]);
    expect(r.adjustments).toEqual([]);
    expect(r.theme).toMatchObject({ id: ID, name: "Gạch nung ấm", dark: false, card: "outline", ground: "custom", radius: 14, kickerUpper: true });
    expect(r.theme!.fonts.display.family).toBe("Be Vietnam Pro");
    allPass(r.theme!);
  });

  it("phông của một phong cách sẵn có; #abc mở rộng, chữ hoa", () => {
    const d: any = { ...draft(), fontPair: "bang-trang", colors: { ...draft().colors, bg3: "#fff" } };
    const r = buildCustomTheme(d, ID);
    expect(r.theme!.fonts).toEqual(THEMES["bang-trang"].fonts);
    expect(r.theme!.colors.bg3).toBe("#FFFFFF");
  });

  it("từ chối: khoá lạ (css/html), màu không phải hex, phông/kiểu/ease ngoài danh sách, thiếu tên", () => {
    const d: any = { ...draft(), css: "body{}", name: "", fontPair: "comic-sans", card: "neon", ground: "space", colors: { ...draft().colors, accent: "red", bg: "rgba(0,0,0,1)", extra: "#000000" }, motion: { ...draft().motion, enterEase: "cubic-bezier(1,2,3,4)", script: 1 } };
    const r = buildCustomTheme(d, ID);
    expect(r.theme).toBeNull();
    const e = r.errors.join("\n");
    for (const k of ['Khoá "css"', '"name"', "fontPair", '"card"', '"ground"', "colors.accent", "colors.bg", "colors.extra", "motion.enterEase", "motion.script"]) expect(e).toContain(k);
    expect(buildCustomTheme("<style>", ID).errors[0]).toMatch(/đối tượng/);
    expect(buildCustomTheme({ ...draft(), groundSpec: { pattern: "stars" } }, ID).errors.join()).toMatch(/pattern/);
    expect(buildCustomTheme({ ...draft(), groundSpec: undefined }, ID).errors.join()).toMatch(/cần "groundSpec"/);
  });

  it("tên/mô tả bỏ ký tự HTML", () => {
    const r = buildCustomTheme({ ...draft(), name: "<b>Đỏ</b> gạch", description: "a <script>x</script>" }, ID);
    expect(r.theme!.name).toBe("bĐỏ/b gạch");
    expect(r.theme!.description).not.toMatch(/[<>]/);
  });

  it("kẹp số ngoài khoảng và báo lại", () => {
    const r = buildCustomTheme({ ...draft(), radius: 400, stroke: -2, motion: { ...draft().motion, enterDur: 9, camera: 1 } }, ID);
    expect(r.theme).toMatchObject({ radius: 40, stroke: 1 });
    expect(r.theme!.motion).toMatchObject({ enterDur: 1.5, camera: 0.04 });
    expect(r.adjustments.map((a) => a.field).sort()).toEqual(["motion.camera", "motion.enterDur", "radius", "stroke"]);
  });

  it("tự chỉnh độ sáng màu chữ thiếu tương phản (giữ sắc độ), báo từng vai trò", () => {
    const d = draft();
    d.colors.accent = "#F4A38E"; // hồng nhạt trên nền kem: ~2:1
    d.colors.inkSoft = "#C8BBAF";
    const r = buildCustomTheme(d, ID);
    expect(r.errors).toEqual([]);
    const fields = r.adjustments.map((a) => a.field);
    expect(fields).toEqual(expect.arrayContaining(["colors.accent", "colors.inkSoft"]));
    expect(r.adjustments.find((a) => a.field === "colors.accent")!.reason).toMatch(/4,5:1/);
    allPass(r.theme!);
    expect(r.draft!.colors.accent).toBe(r.theme!.colors.accent); // bản nháp lưu màu đã chỉnh
  });

  it("nền tối: chữ tối được làm sáng lên; dark tự suy ra từ nền", () => {
    const d = draft();
    Object.assign(d.colors, { bg: "#101418", card: "#151B21", ink: "#333333", accent: "#1F3A80" });
    d.ground = "dots";
    const r = buildCustomTheme(d, ID);
    expect(r.theme!.dark).toBe(true);
    expect(r.theme!.groundSpec).toBeUndefined();
    allPass(r.theme!);
  });

  it("thẻ quá khác nền: bỏ dải màu rồi cho thẻ lấy màu nền", () => {
    const d = draft();
    Object.assign(d.colors, { bg: "#777777", card: "#000000" });
    d.groundSpec = { gradient: { angle: 0, from: "#000000", to: "#FFFFFF" }, pattern: "none" };
    const r = buildCustomTheme(d, ID);
    expect(r.adjustments.map((a) => a.field)).toEqual(expect.arrayContaining(["groundSpec.gradient", "colors.card"]));
    expect(r.theme!.colors.card).toBe("#777777");
    allPass(r.theme!);
  });

  it("fixLightness: một nền luôn tìm được màu đạt", () => {
    for (const bg of ["#777777", "#808080", "#FFFFFF", "#000000", "#FF00FF"]) expect(contrastRatio(fixLightness("#7F7F7F", [bg])!, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("mã: tuy-chinh-<slug>-<hậu tố>", () => {
    expect(makeCustomThemeId("Đỏ gạch Hội An!", "A1b2C3")).toBe("tuy-chinh-do-gach-hoi-an-a1b2c3");
    expect(makeCustomThemeId("***", "x")).toBe("tuy-chinh-phong-cach-x");
  });
});

describe("getTheme với phong cách tuỳ chỉnh", () => {
  it("đăng ký → tra được, đè phông theo cặp; quên → bộ tra cứu; không có → mặc định", () => {
    const t = buildCustomTheme(draft(), ID).theme!;
    registerCustomTheme(t);
    expect(getTheme(ID)).toBe(t);
    expect(getTheme(ID, "lexend").fonts.display.family).toBe("Lexend");
    expect(getTheme(ID, "lexend").colors).toEqual(t.colors);
    forgetCustomTheme(ID);
    setCustomThemeResolver((id) => (id === ID ? { ...t, name: "Từ đĩa" } : undefined));
    expect(getTheme(ID).name).toBe("Từ đĩa");
    setCustomThemeResolver(null);
    forgetCustomTheme(ID);
    expect(getTheme(ID).id).toBe("giay-ky-thuat");
    expect(getTheme("tuy-chinh-../../etc").id).toBe("giay-ky-thuat");
  });

  it("nền tham số + CSS: chỉ giá trị đã kiểm, không tràn thẻ HTML", () => {
    const t = buildCustomTheme(draft(), ID).theme!;
    const g = groundHtml(t);
    expect(g).toContain("linear-gradient(160deg, #F7F1E8, #EFE4D3)");
    expect(g).toContain("radial-gradient(circle");
    expect(g).toContain("cvs-noise");
    for (const p of ["grid", "lines", "diagonal", "none"] as const) expect(groundHtml({ ...t, groundSpec: { ...t.groundSpec, pattern: p, noise: 0 } })).toMatch(/^<div id="ground"[^]*<\/div>$/);
    expect(baseCss(t)).toContain("--accent:#A6402A");
  });

  it("themeToDraft của phong cách sẵn có (màu rgba → hex) dựng lại được", () => {
    for (const id of ["ban-thiet-ke", "toi-dien-anh", "giay-ky-thuat"] as const) {
      const r = buildCustomTheme(themeToDraft(THEMES[id]), ID);
      expect(r.errors, id).toEqual([]);
      expect(r.theme!.fonts).toEqual(THEMES[id].fonts);
    }
  });
});
