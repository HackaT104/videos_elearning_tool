// Đọc số tiếng Việt: số nguyên, thập phân, từng chữ số, chữ cái.

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const SCALES = ["", "nghìn", "triệu", "tỷ"];

export function readDigit(d: string | number): string {
  return DIGITS[Number(d)];
}

/** Đọc từng chữ số: "0047" → "không không bốn bảy". */
export function readDigits(s: string): string {
  return s
    .split("")
    .filter((c) => /\d/.test(c))
    .map(readDigit)
    .join(" ");
}

/**
 * Đọc một nhóm 3 chữ số (0..999).
 * full = true: nhóm không đứng đầu → luôn đọc hàng trăm ("không trăm linh năm").
 */
function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (h > 0 || full) out.push(DIGITS[h], "trăm");
  if (t === 0) {
    if (u > 0) {
      if (h > 0 || full) out.push("linh");
      out.push(DIGITS[u]);
    }
  } else if (t === 1) {
    out.push("mười");
    if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]);
  } else {
    out.push(DIGITS[t], "mươi");
    if (u === 1) out.push("mốt");
    else if (u === 4) out.push("tư");
    else if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]);
  }
  return out.join(" ");
}

/** Đọc số nguyên không âm (chuỗi chữ số, không giới hạn độ dài thực tế tới 10^18). */
export function readInteger(input: string | number): string {
  let s = String(input).replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(s)) throw new Error(`Không phải số nguyên: ${input}`);
  if (/^0+$/.test(s)) return "không";
  // Trên 12 chữ số: tách phần "tỷ" và đọc đệ quy ("nghìn tỷ", "triệu tỷ").
  if (s.length > 12) {
    const hi = s.slice(0, s.length - 9);
    const lo = s.slice(s.length - 9);
    const hiRead = readInteger(hi);
    const loNum = Number(lo);
    if (loNum === 0) return `${hiRead} tỷ`;
    return `${hiRead} tỷ ${readGroups(lo, true)}`;
  }
  return readGroups(s, false);
}

function readGroups(s: string, leadingFull: boolean): string {
  const groups: number[] = [];
  for (let i = s.length; i > 0; i -= 3) groups.unshift(Number(s.slice(Math.max(0, i - 3), i)));
  const parts: string[] = [];
  let first = !leadingFull;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const scale = SCALES[groups.length - 1 - i];
    if (g === 0) continue;
    parts.push(readTriple(g, !first));
    if (scale) parts.push(scale);
    first = false;
  }
  return parts.join(" ");
}

/** Đọc phần sau dấu phẩy/chấm thập phân: "9" → "chín", "43" → "bốn mươi ba", "05" → "không năm". */
export function readFraction(frac: string): string {
  if (frac.length === 0) return "";
  if (frac.startsWith("0") || frac.length > 3) return readDigits(frac);
  return readInteger(frac);
}

/** "423,9" → "bốn trăm hai mươi ba phẩy chín". */
export function readDecimal(intPart: string, frac: string, sep: "phẩy" | "chấm" = "phẩy"): string {
  return `${readInteger(intPart)} ${sep} ${readFraction(frac)}`;
}

const LETTERS: Record<string, string> = {
  a: "a", ă: "á", â: "ớ", b: "bê", c: "xê", d: "đê", đ: "đê", e: "e", ê: "ê", f: "ép", g: "giê", h: "hát",
  i: "i", j: "gi", k: "ca", l: "e lờ", m: "em", n: "en", o: "o", ô: "ô", ơ: "ơ", p: "pê", q: "quy", r: "e rờ",
  s: "ét", t: "tê", u: "u", ư: "ư", v: "vê", w: "vê kép", x: "ích", y: "i", z: "dét",
};

/** Đánh vần theo tên chữ cái tiếng Việt: "VCS" → "vê xê ét". */
export function spellLetters(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((c) => (/\d/.test(c) ? readDigit(c) : LETTERS[c]))
    .filter(Boolean)
    .join(" ");
}

export function letterName(c: string): string {
  return LETTERS[c.toLowerCase()] ?? c;
}
