// Phông chữ (mục 6.4): chỉ dùng phông đủ tiếng Việt, đã thu gọn (Latin + Latin-ext + Vietnamese),
// nhúng base64 – không tải từ Google Fonts khi render.
// Ký hiệu (mũi tên, chỉ số dưới, ✓ ✗ ≈ ≤ ≥ …) lấy từ DejaVu Sans đã thu gọn → họ "CVS Symbols" đặt cuối mọi font stack.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as fontkit from "fontkit";
import type { FontRef, Theme } from "./tokens";

const require = createRequire(import.meta.url);
const SUBSETS = ["latin", "latin-ext", "vietnamese"] as const;
export const SYMBOL_FAMILY = "CVS Symbols";
/** Ký tự bắt buộc khi cài theme (mục 6.4). */
export const REQUIRED_VI = "ệữởẳỹđƯơẫÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐĨĩŨũƠƯưẠạẢảẤấẦầẨẩẪẬậẮắẰằẲẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞỠỡỢợỤụỦủỨứỪừỬửỮỰựỲỳỴỵỶỷỸ";
export const REQUIRED_SYMBOLS = "₂₃₄→←↑↓✓✗≈≤≥×−•";
const SYMBOL_RANGES = "U+00D7,U+2022,U+2070-209F,U+2190-21FF,U+2212,U+2248,U+2260-2265,U+2713-2717,U+25B2-25BC,U+25CF";

export type FontFaceData = { family: string; weight: number; style: "normal"; unicodeRange: string; format: "woff2" | "woff"; base64: string; file?: string };

function pkgDir(pkg: string): string {
  return dirname(require.resolve(`@fontsource/${pkg}/package.json`));
}

function readRanges(pkg: string, weight: number): Map<string, string> {
  const css = readFileSync(join(pkgDir(pkg), `${weight}.css`), "utf8");
  const map = new Map<string, string>();
  for (const block of css.split("@font-face")) {
    const sub = block.match(/files\/[a-z0-9-]+?-((?:latin-ext)|latin|vietnamese)-\d+-normal\.woff2/);
    const range = block.match(/unicode-range:\s*([^;]+);/);
    if (sub && range) map.set(sub[1], range[1].trim());
  }
  return map;
}

function faceFiles(f: FontRef): { file: string; range: string }[] {
  const ranges = readRanges(f.pkg, f.weight);
  return SUBSETS.map((s) => ({ file: join(pkgDir(f.pkg), "files", `${f.pkg}-${s}-${f.weight}-normal.woff2`), range: ranges.get(s) ?? "" })).filter((x) =>
    existsSync(x.file),
  );
}

const cacheDir = () => join(dirname(require.resolve("../package.json")), ".cache");

/** Phông ký hiệu thu gọn từ DejaVu Sans (tạo một lần, lưu đệm). */
export async function symbolFont(bold = false): Promise<Buffer> {
  const out = join(cacheDir(), `cvs-symbols${bold ? "-bold" : ""}.woff2`);
  if (existsSync(out)) return readFileSync(out);
  const subsetFont = (await import("subset-font")).default as (b: Buffer, text: string, o: { targetFormat: string }) => Promise<Buffer>;
  const src = readFileSync(join(dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf", bold ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf"));
  const chars = expandRanges(SYMBOL_RANGES);
  const buf = await subsetFont(src, chars, { targetFormat: "woff2" });
  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(out, buf);
  return buf;
}

function expandRanges(r: string): string {
  let s = "";
  for (const part of r.split(",")) {
    const [a, b] = part.replace("U+", "").split("-");
    const lo = parseInt(a, 16);
    const hi = b ? parseInt(b, 16) : lo;
    for (let c = lo; c <= hi; c++) s += String.fromCodePoint(c);
  }
  return s;
}

const memo = new Map<string, FontFaceData[]>();

export function themeFontRefs(theme: Theme): FontRef[] {
  const seen = new Set<string>();
  return [theme.fonts.display, theme.fonts.body, theme.fonts.bodyBold].filter((f) => {
    const k = `${f.pkg}:${f.weight}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function fontFaces(theme: Theme): Promise<FontFaceData[]> {
  if (memo.has(theme.id)) return memo.get(theme.id)!;
  const faces: FontFaceData[] = [];
  for (const f of themeFontRefs(theme)) {
    for (const { file, range } of faceFiles(f)) {
      faces.push({ family: f.family, weight: f.weight, style: "normal", unicodeRange: range, format: "woff2", base64: readFileSync(file).toString("base64"), file });
    }
  }
  faces.push({ family: SYMBOL_FAMILY, weight: 400, style: "normal", unicodeRange: SYMBOL_RANGES, format: "woff2", base64: (await symbolFont(false)).toString("base64") });
  faces.push({ family: SYMBOL_FAMILY, weight: 700, style: "normal", unicodeRange: SYMBOL_RANGES, format: "woff2", base64: (await symbolFont(true)).toString("base64") });
  memo.set(theme.id, faces);
  return faces;
}

export async function fontFaceCss(theme: Theme): Promise<string> {
  return (await fontFaces(theme))
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(data:font/${f.format};base64,${f.base64}) format('${f.format}');unicode-range:${f.unicodeRange};}`,
    )
    .join("\n");
}

export function fontStack(f: FontRef, generic: "sans-serif" | "serif" | "cursive" = "sans-serif"): string {
  return `'${f.family}', '${SYMBOL_FAMILY}', ${generic}`;
}

export type CoverageReport = { ok: boolean; missing: { family: string; weight: number; chars: string }[] };

/** Kiểm tra cmap có đủ ký tự tiếng Việt (và ký hiệu qua phông dự phòng) khi cài theme. */
export async function checkThemeFonts(theme: Theme): Promise<CoverageReport> {
  const missing: CoverageReport["missing"] = [];
  for (const f of themeFontRefs(theme)) {
    const fonts = faceFiles(f).map((x) => fontkit.openSync(x.file) as unknown as { hasGlyphForCodePoint(c: number): boolean });
    const lack = [...REQUIRED_VI].filter((ch) => !fonts.some((ft) => ft.hasGlyphForCodePoint(ch.codePointAt(0)!)));
    if (lack.length) missing.push({ family: f.family, weight: f.weight, chars: lack.join("") });
  }
  const sym = fontkit.create(await symbolFont(false)) as unknown as { hasGlyphForCodePoint(c: number): boolean };
  const lackSym = [...REQUIRED_SYMBOLS].filter((ch) => !sym.hasGlyphForCodePoint(ch.codePointAt(0)!));
  if (lackSym.length) missing.push({ family: SYMBOL_FAMILY, weight: 400, chars: lackSym.join("") });
  return { ok: missing.length === 0, missing };
}
