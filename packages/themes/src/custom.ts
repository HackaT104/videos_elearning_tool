// Phong cách tuỳ chỉnh: kiểm chặt bản nháp (AI hoặc người dùng) rồi dựng thành Theme cùng dạng với phong cách sẵn có.
// Chỉ nhận màu hex, phông đã cài (FONT_PAIRS hoặc bộ phông của một phong cách sẵn có), các giá trị liệt kê và số trong khoảng –
// không bao giờ nhận CSS/HTML thô. Màu chữ chưa đạt tương phản WCAG 4,5:1 trên nền/thẻ được tự chỉnh độ sáng và báo lại.

import { FONT_PAIR_IDS, getFontPair } from "./fontpairs";
import { CUSTOM_THEME_PREFIX, THEME_IDS, THEMES, type CustomThemeId, type GroundSpec, type Theme, type ThemeId } from "./tokens";

export const CARD_STYLES = ["outline", "glow", "solid-shadow", "rule", "sketch", "bar", "riso", "tech", "block"] as const;
export const GROUND_STYLES = ["grid", "radial", "cream", "paper", "whiteboard", "plain", "blueprint", "forest", "pastel", "hazard", "riso", "dots", "grain", "blocks", "atlas", "custom"] as const;
export const GROUND_PATTERNS = ["none", "dots", "grid", "lines", "diagonal"] as const;
/** Ease dùng được ở cả GSAP (HyperFrames) lẫn Remotion (easeOf trong @cvs/engine). */
export const THEME_EASES = ["power2.out", "power3.out", "power4.out", "expo.out", "sine.out", "back.out(1.3)", "back.out(1.6)", "power2.inOut", "power3.inOut", "sine.inOut"] as const;
export const COLOR_ROLES = ["bg", "bg2", "bg3", "grid", "ink", "inkSoft", "accent", "alt", "money", "warn", "card", "cardBorder", "line", "highlight"] as const;
/** Vai trò làm màu chữ – phải đạt ≥ 4,5:1 trên nền và trên thẻ. */
export const TEXT_ROLES = ["ink", "inkSoft", "accent", "alt", "money", "warn"] as const;
export const MIN_CONTRAST = 4.5;

type ColorRole = (typeof COLOR_ROLES)[number];

/** Bản nháp phong cách – đúng dạng JSON AI trả về trong "theme". */
export type ThemeDraft = {
  name: string;
  description: string;
  colors: Record<ColorRole, string>;
  /** Mã cặp phông (FONT_PAIRS) hoặc mã phong cách sẵn có (dùng bộ phông của phong cách đó). */
  fontPair: string;
  card: (typeof CARD_STYLES)[number];
  ground: (typeof GROUND_STYLES)[number];
  groundSpec?: GroundSpec;
  radius: number;
  stroke: number;
  motion: { enterEase: string; enterDur: number; moveEase: string; moveDur: number; slowEnterEase: string; slowEnterDur: number; rise: number; camera: number };
  kickerUpper: boolean;
};

export type ThemeAdjustment = { field: string; from: string | number; to: string | number; reason: string };
export type ThemeBuild = { theme: Theme | null; draft: ThemeDraft | null; errors: string[]; adjustments: ThemeAdjustment[] };

const RANGES = {
  radius: [0, 40],
  stroke: [1, 6],
  "motion.enterDur": [0.3, 1.5],
  "motion.moveDur": [0.4, 1.8],
  "motion.slowEnterDur": [0.6, 2.0],
  "motion.rise": [0, 60],
  "motion.camera": [0, 0.04],
  "groundSpec.gradient.angle": [0, 360],
  "groundSpec.patternOpacity": [0.03, 0.25],
  "groundSpec.patternSize": [16, 120],
  "groundSpec.noise": [0, 0.3],
} as const;

// ---------- màu ----------

type RGB = [number, number, number];
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normHex(v: unknown): string | null {
  if (typeof v !== "string" || !HEX_RE.test(v.trim())) return null;
  let h = v.trim().slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return `#${h.toUpperCase()}`;
}
const rgbOf = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const lum = ([r, g, b]: RGB) => {
  const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
/** Tỉ lệ tương phản WCAG 2.x giữa hai màu hex. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(rgbOf(a)), lum(rgbOf(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const minRatio = (c: string, surfaces: string[]) => Math.min(...surfaces.map((s) => contrastRatio(c, s)));
const fmtRatio = (r: number) => `${r.toFixed(1).replace(".", ",")}:1`;

/** Màu gần nhất (chỉ đổi độ sáng HSL, giữ sắc độ) đạt ≥ min trên mọi nền; null nếu không có. */
export function fixLightness(hex: string, surfaces: string[], min = MIN_CONTRAST): string | null {
  if (minRatio(hex, surfaces) >= min) return hex;
  const [h, s, l] = toHsl(rgbOf(hex));
  for (let d = 0.01; d <= 1.001; d += 0.01) {
    for (const nl of [l - d, l + d]) {
      if (nl < 0 || nl > 1) continue;
      const c = hexOf(fromHsl(h, s, nl));
      if (minRatio(c, surfaces) >= min) return c;
    }
  }
  return null;
}

// ---------- tên, mã ----------

/** "Đỏ gạch Hội An" → "do-gach-hoi-an". */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
}
export function makeCustomThemeId(name: string, rand: string): CustomThemeId {
  return `${CUSTOM_THEME_PREFIX}${slugify(name) || "phong-cach"}-${rand.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "0"}` as CustomThemeId;
}
const cleanText = (v: string, max: number) => v.replace(/[\u0000-\u001f\u007f<>`{}]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// ---------- kiểm + dựng ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const DRAFT_KEYS = ["name", "description", "colors", "fontPair", "card", "ground", "groundSpec", "radius", "stroke", "motion", "kickerUpper"];
const MOTION_KEYS = ["enterEase", "enterDur", "moveEase", "moveDur", "slowEnterEase", "slowEnterDur", "rise", "camera"];
const GROUND_KEYS = ["gradient", "pattern", "patternOpacity", "patternSize", "noise"];

/** Các lựa chọn phông hợp lệ (cho prompt và giao diện). */
export const THEME_FONT_CHOICES = [...FONT_PAIR_IDS, ...THEME_IDS];

/**
 * Kiểm bản nháp và dựng Theme. Lỗi cứng (sai kiểu, màu không phải hex, giá trị ngoài danh sách, khoá lạ như "css") → errors.
 * Số ngoài khoảng bị kẹp, màu chữ thiếu tương phản được chỉnh độ sáng – cả hai ghi vào adjustments.
 */
export function buildCustomTheme(input: unknown, id: CustomThemeId): ThemeBuild {
  const errors: string[] = [];
  const adjustments: ThemeAdjustment[] = [];
  const fail = (): ThemeBuild => ({ theme: null, draft: null, errors, adjustments });
  if (!isObj(input)) return (errors.push("Phong cách phải là một đối tượng JSON"), fail());
  for (const k of Object.keys(input)) if (!DRAFT_KEYS.includes(k)) errors.push(`Khoá "${k}" không được nhận (chỉ ${DRAFT_KEYS.join(", ")})`);

  const name = typeof input.name === "string" ? cleanText(input.name, 40) : "";
  if (name.length < 2) errors.push('"name" cần 2–40 ký tự');
  const description = typeof input.description === "string" ? cleanText(input.description, 240) : "";
  if (!description) errors.push('"description" cần một câu mô tả');

  const colors = {} as Record<ColorRole, string>;
  if (!isObj(input.colors)) errors.push('"colors" phải là đối tượng màu');
  else {
    for (const k of Object.keys(input.colors)) if (!(COLOR_ROLES as readonly string[]).includes(k)) errors.push(`colors.${k}: vai trò màu lạ (chỉ ${COLOR_ROLES.join(", ")})`);
    for (const r of COLOR_ROLES) {
      const h = normHex(input.colors[r]);
      if (!h) errors.push(`colors.${r} phải là mã hex #RRGGBB (nhận ${JSON.stringify(input.colors[r] ?? null)})`);
      else colors[r] = h;
    }
  }

  const fontPair = typeof input.fontPair === "string" ? input.fontPair : "";
  if (!THEME_FONT_CHOICES.includes(fontPair)) errors.push(`"fontPair" phải là một trong: ${THEME_FONT_CHOICES.join(", ")}`);
  if (!(CARD_STYLES as readonly unknown[]).includes(input.card)) errors.push(`"card" phải là ${CARD_STYLES.join(" | ")}`);
  if (!(GROUND_STYLES as readonly unknown[]).includes(input.ground)) errors.push(`"ground" phải là ${GROUND_STYLES.join(" | ")}`);
  if (typeof input.kickerUpper !== "boolean") errors.push('"kickerUpper" phải là true | false');

  const num = (path: keyof typeof RANGES, v: unknown, dflt?: number): number => {
    const [lo, hi] = RANGES[path];
    if (v === undefined && dflt !== undefined) return dflt;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${path} phải là số (${lo}–${hi})`);
      return lo;
    }
    const c = Math.min(hi, Math.max(lo, v));
    if (c !== v) adjustments.push({ field: path, from: v, to: c, reason: `ngoài khoảng ${lo}–${hi} – đã kẹp` });
    return Math.round(c * 1000) / 1000;
  };
  const radius = Math.round(num("radius", input.radius));
  const stroke = num("stroke", input.stroke);

  const m = isObj(input.motion) ? input.motion : null;
  if (!m) errors.push('"motion" phải là đối tượng');
  else for (const k of Object.keys(m)) if (!MOTION_KEYS.includes(k)) errors.push(`motion.${k}: khoá lạ (chỉ ${MOTION_KEYS.join(", ")})`);
  const ease = (k: string) => {
    const v = m?.[k];
    if (!(THEME_EASES as readonly unknown[]).includes(v)) errors.push(`motion.${k} phải là ${THEME_EASES.join(" | ")}`);
    return String(v);
  };
  const motion = {
    enterEase: ease("enterEase"),
    enterDur: num("motion.enterDur", m?.enterDur),
    moveEase: ease("moveEase"),
    moveDur: num("motion.moveDur", m?.moveDur),
    slowEnterEase: ease("slowEnterEase"),
    slowEnterDur: num("motion.slowEnterDur", m?.slowEnterDur),
    rise: Math.round(num("motion.rise", m?.rise)),
    camera: num("motion.camera", m?.camera, 0.015),
  };

  let groundSpec: GroundSpec | undefined;
  if (input.groundSpec !== undefined && input.groundSpec !== null) {
    const g = input.groundSpec;
    if (!isObj(g)) errors.push('"groundSpec" phải là đối tượng');
    else {
      for (const k of Object.keys(g)) if (!GROUND_KEYS.includes(k)) errors.push(`groundSpec.${k}: khoá lạ (chỉ ${GROUND_KEYS.join(", ")})`);
      groundSpec = {};
      if (g.gradient !== undefined && g.gradient !== null) {
        const gr = g.gradient;
        const from = isObj(gr) ? normHex(gr.from) : null;
        const to = isObj(gr) ? normHex(gr.to) : null;
        if (!isObj(gr) || !from || !to) errors.push("groundSpec.gradient cần {angle: số, from: #hex, to: #hex}");
        else groundSpec.gradient = { angle: Math.round(num("groundSpec.gradient.angle", gr.angle)), from, to };
      }
      const pattern = g.pattern ?? "none";
      if (!(GROUND_PATTERNS as readonly unknown[]).includes(pattern)) errors.push(`groundSpec.pattern phải là ${GROUND_PATTERNS.join(" | ")}`);
      else groundSpec.pattern = pattern as GroundSpec["pattern"];
      if (groundSpec.pattern !== "none") {
        groundSpec.patternOpacity = num("groundSpec.patternOpacity", g.patternOpacity, 0.08);
        groundSpec.patternSize = Math.round(num("groundSpec.patternSize", g.patternSize, 48));
      }
      groundSpec.noise = num("groundSpec.noise", g.noise, 0);
    }
  }
  if (input.ground === "custom" && !groundSpec) errors.push('ground "custom" cần "groundSpec"');
  if (errors.length) return fail();
  if (input.ground !== "custom") groundSpec = undefined;

  // tương phản: chữ trên nền, trên thẻ và trên hai đầu dải màu nền
  const surfaces = () => [colors.bg, colors.card, ...(groundSpec?.gradient ? [groundSpec.gradient.from, groundSpec.gradient.to] : [])];
  const fixAll = (): boolean => {
    const next: Partial<Record<ColorRole, string>> = {};
    for (const r of TEXT_ROLES) {
      const f = fixLightness(colors[r], surfaces());
      if (!f) return false;
      next[r] = f;
    }
    for (const r of TEXT_ROLES)
      if (next[r] !== colors[r]) {
        adjustments.push({ field: `colors.${r}`, from: colors[r], to: next[r]!, reason: `tương phản ${fmtRatio(minRatio(colors[r], surfaces()))} < 4,5:1 trên nền/thẻ – chỉnh độ sáng (${fmtRatio(minRatio(next[r]!, surfaces()))})` });
        colors[r] = next[r]!;
      }
    return true;
  };
  if (!fixAll() && groundSpec?.gradient) {
    adjustments.push({ field: "groundSpec.gradient", from: `${groundSpec.gradient.from} → ${groundSpec.gradient.to}`, to: "bỏ", reason: "dải màu nền quá khác nền chính – chữ không đọc được trên cả hai đầu" });
    delete groundSpec.gradient;
  }
  if (!fixAll()) {
    adjustments.push({ field: "colors.card", from: colors.card, to: colors.bg, reason: "thẻ quá khác nền – không có màu chữ nào đọc được trên cả hai; thẻ lấy màu nền" });
    colors.card = colors.bg;
    fixAll(); // một nền: luôn có đen/trắng đạt
  }

  const draft: ThemeDraft = { name, description, colors: { ...colors }, fontPair, card: input.card as ThemeDraft["card"], ground: input.ground as ThemeDraft["ground"], ...(groundSpec ? { groundSpec } : {}), radius, stroke, motion, kickerUpper: input.kickerUpper as boolean };
  const pair = getFontPair(fontPair);
  const fonts = pair ? { display: pair.display, body: pair.body, bodyBold: pair.bodyBold } : THEMES[fontPair as ThemeId].fonts;
  const dark = contrastRatio(colors.bg, "#FFFFFF") > contrastRatio(colors.bg, "#000000");
  const theme: Theme = { id, name, description, dark, colors: { ...colors }, fonts, stroke, radius, card: draft.card, ground: draft.ground, ...(groundSpec ? { groundSpec } : {}), motion, kickerUpper: draft.kickerUpper };
  return { theme, draft, errors: [], adjustments };
}

/** Bản nháp từ một Theme (sẵn có hoặc tuỳ chỉnh) – làm gốc khi "chỉnh tiếp bằng lời" hoặc chỉnh tay. */
export function themeToDraft(theme: Theme, fontPair?: string): ThemeDraft {
  const hex = (v: string, fb: string) => normHex(v) ?? fb;
  const c = theme.colors;
  return {
    name: theme.name,
    description: theme.description,
    // màu rgba của phong cách sẵn có → thay bằng màu gần đúng (nền/thẻ)
    colors: Object.fromEntries(COLOR_ROLES.map((r) => [r, hex(c[r], r === "card" || r === "highlight" || r === "grid" ? hex(c.bg2, "#FFFFFF") : r === "cardBorder" ? hex(c.inkSoft, "#888888") : hex(c.ink, "#111111"))])) as ThemeDraft["colors"],
    fontPair: fontPair ?? (THEME_IDS.includes(theme.id as ThemeId) ? theme.id : "be-vietnam"),
    card: theme.card,
    ground: theme.ground,
    ...(theme.groundSpec ? { groundSpec: theme.groundSpec } : {}),
    radius: theme.radius,
    stroke: theme.stroke,
    motion: { ...theme.motion, camera: theme.motion.camera ?? 0.015 },
    kickerUpper: theme.kickerUpper,
  };
}
