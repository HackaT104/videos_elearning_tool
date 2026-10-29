// Chữ trên màn hình: escape, nhấn **…**, chỉ số dưới; ước lượng cỡ chữ vừa khung (tất định, ≥ 28 px).

export const MIN_FONT = 28;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

/** "CO₂ **tương đương**" → "CO<sub>2</sub> <mark>tương đương</mark>" (an toàn HTML). */
export function rich(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>")
    .replace(/[₀-₉]+/g, (m) => `<sub>${[...m].map((c) => SUB[c]).join("")}</sub>`);
}

/** Bỏ đánh dấu để so sánh nội dung. */
export function plain(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** Độ rộng trung bình một ký tự theo em. */
export type FontKind = "display" | "body";
const CW: Record<FontKind, number> = { display: 0.6, body: 0.53 };

/** Số dòng khi ngắt theo từ ở cỡ chữ size. */
export function estimateLines(text: string, size: number, maxWidth: number, kind: FontKind = "body"): number {
  const words = plain(text).split(/\s+/).filter(Boolean);
  const cw = CW[kind] * size;
  let lines = 1;
  let w = 0;
  for (const word of words) {
    const ww = word.length * cw;
    const add = w === 0 ? ww : w + cw * 0.5 + ww;
    if (add > maxWidth && w > 0) {
      lines++;
      w = ww;
    } else w = add;
    while (w > maxWidth) {
      lines++;
      w -= maxWidth;
    }
  }
  return lines;
}

/** Cỡ chữ lớn nhất ≤ max sao cho vừa maxLines dòng trong maxWidth; không nhỏ hơn min (≥ 28). */
export function fitSize(text: string, maxWidth: number, max: number, opts: { maxLines?: number; min?: number; kind?: FontKind } = {}): number {
  const min = Math.max(MIN_FONT, opts.min ?? MIN_FONT);
  const maxLines = opts.maxLines ?? 2;
  for (let s = max; s > min; s -= 2) if (estimateLines(text, s, maxWidth, opts.kind) <= maxLines) return s;
  return min;
}

/** Chiều cao khối chữ (px) với line-height. */
export function blockHeight(text: string, size: number, maxWidth: number, kind: FontKind = "body", lh = kind === "display" ? 1.12 : 1.35): number {
  return Math.ceil(estimateLines(text, size, maxWidth, kind) * size * lh);
}

/** Định dạng số kiểu Việt: 1.234.567,8 */
export function formatViNumber(v: number, decimals = 0): string {
  const fixed = Math.abs(v).toFixed(decimals);
  const [i, f] = fixed.split(".");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "−" : ""}${int}${f ? "," + f : ""}`;
}

/** Bóc số từ chuỗi kiểu Việt: "423,9" → 423.9; "800.000" → 800000; "1.5" → 1.5 */
export function parseViNumber(s: string): number | null {
  const m = s.match(/-?\d[\d.,]*/);
  if (!m) return null;
  let t = m[0];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
