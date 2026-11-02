// Phụ đề và logo phủ lên video (cài đặt dự án, có thể ghi đè từng video): kiểm/kẹp giá trị, chia dòng phụ đề,
// vị trí logo + khối phụ đề trên khung 1920×1080, cue WebVTT. Thuần (không module Node) – dùng chung bộ dựng, worker, test.

import type { Timing, Video } from "./types";

export type SubtitleMode = "off" | "player" | "burn";
export type SubtitleSettings = {
  /** off: không hiện (vẫn xuất .vtt khi chọn) · player: phụ đề bật/tắt trong trình phát · burn: gắn cứng vào hình. */
  mode: SubtitleMode;
  /** Cỡ chữ (px ở 1080p). */
  size: number;
  position: "bottom" | "top";
  /** Khoảng cách từ mép (% chiều cao). */
  offset: number;
  /** Độ đậm nền hộp chữ 0–1. */
  background: number;
  /** Rộng tối đa (% chiều rộng). */
  maxWidth: number;
  maxLines: 1 | 2;
  /** Ngôn ngữ phụ đề (vi = lời thoại hiển thị gốc). */
  languages: string[];
  /** Ngôn ngữ gắn cứng khi mode = burn. */
  burnLanguage: string;
};
export const LOGO_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];
export type LogoSettings = {
  /** Mã ảnh của dự án (<hash16>-<w>x<h>.<đuôi>); trống = không có logo. */
  assetId?: string;
  position: LogoPosition;
  /** Rộng logo (% chiều rộng video). */
  size: number;
  /** Cách mép (px). */
  margin: number;
  opacity: number;
  scenes: "all" | "skip-first";
};
export type OverlaySettings = { subtitle: SubtitleSettings; logo: LogoSettings };

/** Ngôn ngữ phụ đề hỗ trợ (dịch bằng Claude). */
export const SUB_LANGS: { code: string; name: string; native: string }[] = [
  { code: "vi", name: "Tiếng Việt", native: "Tiếng Việt" },
  { code: "en", name: "Tiếng Anh", native: "English" },
  { code: "ja", name: "Tiếng Nhật", native: "日本語" },
  { code: "ko", name: "Tiếng Hàn", native: "한국어" },
  { code: "zh", name: "Tiếng Trung", native: "中文" },
  { code: "fr", name: "Tiếng Pháp", native: "Français" },
  { code: "de", name: "Tiếng Đức", native: "Deutsch" },
  { code: "es", name: "Tiếng Tây Ban Nha", native: "Español" },
  { code: "th", name: "Tiếng Thái", native: "ไทย" },
];
export const isSubLang = (c: unknown): c is string => typeof c === "string" && SUB_LANGS.some((l) => l.code === c);

export const DEFAULT_SUBTITLE: SubtitleSettings = { mode: "player", size: 40, position: "bottom", offset: 6, background: 0.55, maxWidth: 80, maxLines: 2, languages: ["vi"], burnLanguage: "vi" };
export const DEFAULT_LOGO: LogoSettings = { position: "top-right", size: 10, margin: 40, opacity: 1, scenes: "all" };

const W = 1920;
const H = 1080;
const ASSET_RE = /^[a-f0-9]{16}-(\d{1,5})x(\d{1,5})\.(png|jpg|webp|svg)$/;

const num = (v: unknown, def: number, lo: number, hi: number, step = 0) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  const c = Math.max(lo, Math.min(hi, n));
  return step ? Math.round(c / step) * step : c;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Cài đặt phụ đề hợp lệ: thiếu → mặc định, ngoài khoảng → kẹp, ngôn ngữ lạ bị bỏ (luôn có vi). */
export function normalizeSubtitle(input: unknown, base: SubtitleSettings = DEFAULT_SUBTITLE): SubtitleSettings {
  const o = obj(input);
  const langs = Array.isArray(o.languages) ? o.languages.filter(isSubLang) : base.languages;
  const languages = ["vi", ...SUB_LANGS.map((l) => l.code).filter((c) => c !== "vi" && langs.includes(c))];
  return {
    mode: oneOf(o.mode, ["off", "player", "burn"] as const, base.mode),
    size: num(o.size, base.size, 24, 72, 1),
    position: oneOf(o.position, ["bottom", "top"] as const, base.position),
    offset: num(o.offset, base.offset, 0, 30, 0.5),
    background: num(o.background, base.background, 0, 1, 0.05),
    maxWidth: num(o.maxWidth, base.maxWidth, 40, 95, 1),
    maxLines: o.maxLines === 1 || o.maxLines === "1" ? 1 : o.maxLines === 2 || o.maxLines === "2" ? 2 : base.maxLines,
    languages,
    burnLanguage: isSubLang(o.burnLanguage) && languages.includes(o.burnLanguage) ? o.burnLanguage : languages.includes(base.burnLanguage) ? base.burnLanguage : "vi",
  };
}

export function normalizeLogo(input: unknown, base: LogoSettings = DEFAULT_LOGO): LogoSettings {
  const o = obj(input);
  const id = "assetId" in o ? o.assetId : base.assetId;
  return {
    ...(typeof id === "string" && ASSET_RE.test(id) ? { assetId: id } : {}),
    position: oneOf(o.position, LOGO_POSITIONS, base.position),
    size: num(o.size, base.size, 3, 30, 0.5),
    margin: num(o.margin, base.margin, 0, 200, 1),
    opacity: num(o.opacity, base.opacity, 0.2, 1, 0.05),
    scenes: oneOf(o.scenes, ["all", "skip-first"] as const, base.scenes),
  };
}

/** Cài đặt hiệu lực của một video: dự án, rồi phần ghi đè riêng của video. */
export function resolveOverlay(project: { subtitle?: unknown; logo?: unknown } | null | undefined, video?: Pick<Video, "overlay"> | null): OverlaySettings {
  const sub = normalizeSubtitle(project?.subtitle);
  const logo = normalizeLogo(project?.logo);
  return { subtitle: normalizeSubtitle(video?.overlay?.subtitle, sub), logo: normalizeLogo(video?.overlay?.logo, logo) };
}

/** Khoá thay đổi khi cài đặt ảnh hưởng tới hình (phụ đề gắn cứng, logo) – lưu cùng bản render để biết bản nào cũ. */
export function overlayKey(o: OverlaySettings): string {
  const s = o.subtitle;
  const burn = s.mode === "burn" ? [s.size, s.position, s.offset, s.background, s.maxWidth, s.maxLines, s.burnLanguage] : [];
  const l = o.logo.assetId ? [o.logo.assetId, o.logo.position, o.logo.size, o.logo.margin, o.logo.opacity, o.logo.scenes] : [];
  return JSON.stringify([burn, l]);
}

// ---------- chữ phụ đề ----------

/** Chữ phụ đề của câu theo ngôn ngữ: vi = lời thoại hiển thị; ngôn ngữ khác = bản dịch ("" nếu chưa dịch). */
export function subText(s: { text: string; subs?: Record<string, string> }, lang: string): string {
  return lang === "vi" ? s.text.trim() : (s.subs?.[lang] ?? "").trim();
}

const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;
/** Bề rộng ước tính (đơn vị em) của chữ đậm – đủ để chia dòng tất định cho cả hai bộ dựng. */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 1 : ch === " " ? 0.3 : ch !== ch.toLowerCase() || /\d/.test(ch) ? 0.66 : /[.,:;'!|il]/.test(ch) ? 0.3 : 0.56;
  return w;
}

/** Chia chữ thành các dòng ≤ maxEm (ngắt ở dấu cách; chữ CJK ngắt từng ký tự). */
export function wrapLines(text: string, maxEm: number): string[] {
  const tokens: string[] = [];
  for (const w of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (!w) continue;
    if (textEm(w) <= maxEm || !WIDE.test(w)) tokens.push(w);
    else tokens.push(...[...w].map((c, i) => (i ? `\u0000${c}` : c)));
  }
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    const glue = t.startsWith("\u0000");
    const word = glue ? t.slice(1) : t;
    const next = cur ? cur + (glue ? "" : " ") + word : word;
    if (cur && textEm(next) > maxEm) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export type CaptionChunk = { lines: string[]; size: number; share: number };

/**
 * Một câu → các khối phụ đề ≤ maxLines dòng: thử cỡ chữ đặt sẵn, thu nhỏ dần (tối thiểu 28 px, hoặc cỡ đặt nếu nhỏ hơn);
 * vẫn dài → tách thành nhiều khối nối tiếp (share = phần thời gian theo độ dài chữ).
 */
export function chunkCaption(text: string, size: number, maxWidthPx: number, maxLines: number): CaptionChunk[] {
  const min = Math.min(size, Math.max(28, Math.round(size * 0.8)));
  let s = size;
  let lines = wrapLines(text, maxWidthPx / s);
  while (lines.length > maxLines && s > min) {
    s = Math.max(min, s - 2);
    lines = wrapLines(text, maxWidthPx / s);
  }
  if (lines.length <= maxLines) return lines.length ? [{ lines, size: s, share: 1 }] : [];
  const groups: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLines) groups.push(lines.slice(i, i + maxLines));
  const total = lines.reduce((a, l) => a + textEm(l), 0) || 1;
  return groups.map((g) => ({ lines: g, size: s, share: g.reduce((a, l) => a + textEm(l), 0) / total }));
}

export type Caption = { start: number; end: number; lines: string[]; size: number };

/** Khối phụ đề gắn cứng theo mốc câu (giây, toàn video). Thiếu bản dịch → dùng lời thoại tiếng Việt, báo trong missing. */
export function captionBlocks(video: Video, timing: Timing, sub: SubtitleSettings): { captions: Caption[]; missing: number } {
  const out: Caption[] = [];
  let missing = 0;
  const maxW = (W * sub.maxWidth) / 100 - sub.size * 1.1; // trừ đệm hai bên hộp
  video.scenes.forEach((scene, i) => {
    const T = timing.scenes[i];
    if (!T) return;
    scene.sentences.forEach((x, k) => {
      let text = subText(x, sub.burnLanguage);
      if (!text) {
        if (sub.burnLanguage !== "vi" && x.text.trim()) missing++;
        text = x.text.trim();
      }
      if (!text || T.cues[k] === undefined) return;
      const start = T.start + T.cues[k];
      const end = T.start + (T.ends[k] ?? T.dur);
      let t = start;
      for (const c of chunkCaption(text, sub.size, maxW, sub.maxLines)) {
        const e = t + (end - start) * c.share;
        out.push({ start: r3(t), end: r3(e), lines: c.lines, size: c.size });
        t = e;
      }
    });
  });
  return { captions: out, missing };
}

// ---------- vị trí ----------

export type Box = { x: number; y: number; w: number; h: number };
export type OverlayLayout = {
  logo: Box | null;
  /** Khoảng từ mép (trên/dưới) tới hộp phụ đề, px. */
  caption: { edge: "bottom" | "top"; offset: number; maxWidth: number; boxHeight: number };
  /** Dòng "Nguồn" của cảnh (mặc định cách đáy 58 px) cần nâng lên tới đây; null = giữ nguyên. */
  srcBottom: number | null;
};

const GAP = 16;
const overlapX = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0;

/** Chiều cao hộp phụ đề (đệm 0,2 em trên/dưới, giãn dòng 1,3). */
export const captionBoxHeight = (size: number, lines: number) => Math.round(size * (lines * 1.3 + 0.4));

/**
 * Vị trí logo (giữ tỉ lệ từ mã ảnh, cao tối đa 25 % khung) và hộp phụ đề. Logo cùng mép và chồng ngang với vùng phụ đề →
 * đẩy phụ đề ra xa mép hơn logo (xếp tầng), để phụ đề không che logo.
 */
export function overlayLayout(o: OverlaySettings, burn = o.subtitle.mode === "burn"): OverlayLayout {
  const s = o.subtitle;
  const lg = o.logo;
  let logo: Box | null = null;
  const m = lg.assetId ? ASSET_RE.exec(lg.assetId) : null;
  if (m) {
    const ar = Number(m[1]) / Number(m[2]);
    let w = (W * lg.size) / 100;
    let h = w / ar;
    if (h > H * 0.25) [h, w] = [H * 0.25, H * 0.25 * ar];
    const x = lg.position.endsWith("left") ? lg.margin : lg.position.endsWith("right") ? W - lg.margin - w : (W - w) / 2;
    const y = lg.position.startsWith("top") ? lg.margin : H - lg.margin - h;
    logo = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }
  const maxWidth = Math.round((W * s.maxWidth) / 100);
  const cx0 = (W - maxWidth) / 2;
  let offset = Math.round((H * s.offset) / 100);
  const sameEdge = logo && lg.position.startsWith(s.position === "bottom" ? "bottom" : "top");
  if (logo && sameEdge && overlapX(logo.x, logo.x + logo.w, cx0, cx0 + maxWidth)) offset = Math.max(offset, lg.margin + logo.h + GAP);
  const boxHeight = captionBoxHeight(s.size, s.maxLines);
  // dòng "Nguồn" (trái 96 px, rộng ≤ 1500 px, cách đáy 58 px): nâng lên trên phụ đề gắn cứng / logo ở đáy
  let src = 58;
  if (burn && s.position === "bottom") src = Math.max(src, offset + boxHeight + 12);
  if (logo && lg.position.startsWith("bottom") && overlapX(logo.x, logo.x + logo.w, 96, 1596)) src = Math.max(src, H - logo.y + 12);
  return { logo, caption: { edge: s.position, offset, maxWidth, boxHeight }, srcBottom: src > 58 ? src : null };
}

// ---------- WebVTT ----------

/** Thiết lập cue WebVTT theo vị trí phụ đề (trình phát LMS tôn trọng line/position/size). */
export function vttCueSettings(s: SubtitleSettings): string {
  const line = s.position === "bottom" ? `line:${r1(100 - s.offset)}%,end` : `line:${r1(s.offset)}%,start`;
  return `${line} position:50%,center size:${s.maxWidth}% align:center`;
}

/** Phụ đề WebVTT của một ngôn ngữ (một cue mỗi câu; câu chưa dịch bị bỏ). */
export function buildVtt(video: Video, timing: Timing, lang: string, s: SubtitleSettings): string {
  const ts = (x: number) => {
    const ms = Math.round(Math.max(0, x) * 1000);
    const p = (n: number, d = 2) => String(n).padStart(d, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
  };
  const cue = vttCueSettings(s);
  const lines = ["WEBVTT", ""];
  video.scenes.forEach((sc, i) => {
    const st = timing.scenes[i];
    if (!st) return;
    sc.sentences.forEach((x, k) => {
      const text = subText(x, lang);
      if (!text || st.cues[k] === undefined) return;
      lines.push(`${ts(st.start + st.cues[k])} --> ${ts(st.start + (st.ends[k] ?? st.dur))} ${cue}`, text.replace(/-->/g, "→"), "");
    });
  });
  return lines.join("\n");
}

// ---------- bản dịch ----------

/** Các nhóm chữ số (bỏ dấu phân cách . , ) – bản dịch phải giữ đúng số như lời thoại gốc. */
export const digitRuns = (s: string) => (s.match(/\d+/g) ?? []).join(" ").replace(/\b0+(\d)/g, "$1");
export const numbersMatch = (src: string, tr: string) => [...digitRuns(src).split(" ")].sort().join(" ") === [...digitRuns(tr).split(" ")].sort().join(" ");

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
