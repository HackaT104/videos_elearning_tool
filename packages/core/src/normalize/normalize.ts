// Chuẩn hóa cách đọc tiếng Việt (mục 4). Kết quả lưu vào sentence.tts, giữ nguyên sentence.text.

import type { GlossaryEntry } from "../types";
import { DEFAULT_GLOSSARY, mergeGlossary } from "./glossary";
import { letterName, readDecimal, readDigits, readInteger, spellLetters } from "./numbers";

export type NormalizeOptions = {
  /** Bảng thuật ngữ bổ sung (dùng chung + dự án); ghi đè mặc định khi trùng term. */
  glossary?: GlossaryEntry[];
  /** Bỏ bảng mặc định (chỉ dùng glossary truyền vào). */
  noDefaults?: boolean;
};

export type NormalizeResult = {
  text: string;
  tts: string;
  changed: boolean;
  /** Các quy tắc đã áp dụng (để hiển thị ở màn hình "Soát cách đọc"). */
  rules: string[];
  /** Cảnh báo: còn chữ số hoặc cụm viết hoa ≥ 2 ký tự sau chuẩn hóa. */
  warnings: string[];
};

const B = "(?<![\\p{L}\\p{N}_])"; // ranh giới trái (hỗ trợ chữ có dấu)
const E = "(?![\\p{L}\\p{N}_])"; // ranh giới phải
const NUM = "\\d(?:[\\d.,]*\\d)?";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

type Rule = { name: string; apply: (s: string) => string };

function glossaryRule(entries: GlossaryEntry[]): Rule {
  // Thay cụm dài trước: sắp xếp theo độ dài giảm dần, một lượt duy nhất để kết quả không bị thay lại.
  const sorted = [...entries].sort((a, b) => b.term.length - a.term.length);
  if (sorted.length === 0) return { name: "glossary", apply: (s) => s };
  const re = new RegExp(`${B}(?:${sorted.map((e) => escapeRe(e.term)).join("|")})${E}`, "giu");
  return {
    name: "thuật ngữ",
    apply: (s) =>
      s.replace(re, (m) => {
        const hit = sorted.find((e) => (e.caseSensitive ? e.term === m : e.term.toLowerCase() === m.toLowerCase()));
        if (hit) return ` ${hit.reading} `;
        // Trùng không phân biệt hoa thường nhưng mục phân biệt hoa thường: thử mục ngắn hơn bên trong.
        return m;
      }),
  };
}

const UNIT_AFTER_NUMBER: [string, string][] = [
  ["kWh", "ki lô oát giờ"],
  ["MWh", "mê ga oát giờ"],
  ["MW", "mê ga oát"],
  ["GW", "gi ga oát"],
  ["kW", "ki lô oát"],
  ["km²", "ki lô mét vuông"],
  ["km2", "ki lô mét vuông"],
  ["km", "ki lô mét"],
  ["kg", "ki lô gam"],
  ["m²", "mét vuông"],
  ["m2", "mét vuông"],
  ["m³", "mét khối"],
  ["m3", "mét khối"],
  ["ha", "héc ta"],
];

function buildRules(glossary: GlossaryEntry[]): Rule[] {
  return [
    {
      name: "bỏ chú thích tiếng Anh",
      // (grace period), (revision) → bỏ. Giữ ngoặc chứa viết tắt in hoa hoặc tiếng Việt.
      apply: (s) =>
        s.replace(/\s*\(([^()]*)\)/g, (m, inner: string) =>
          /^[A-Za-z][A-Za-z\s'\-]*$/.test(inner.trim()) && /[a-z]/.test(inner) ? "" : m,
        ),
    },
    {
      name: "mã phương pháp luận",
      apply: (s) =>
        s.replace(
          new RegExp(`${B}(VMR|VMD|VM|AMS|AM|ACM)[- ]?(\\d{4})(?!\\p{N})`, "gu"),
          (_, p: string, d: string) => ` ${spellLetters(p)} ${readDigits(d)} `,
        ),
    },
    {
      name: "ngày tháng",
      apply: (s) =>
        s
          .replace(
            new RegExp(`(${B}ngày\\s+)?${B}(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})${E}`, "giu"),
            (_, pre: string | undefined, d: string, m: string, y: string) =>
              `${pre ?? "ngày "}${readInteger(d)} tháng ${readMonth(m)} năm ${readInteger(y)}`,
          )
          .replace(
            new RegExp(`(${B}tháng\\s+)?${B}(\\d{1,2})\\/(\\d{4})${E}`, "giu"),
            (_, pre: string | undefined, m: string, y: string) => `${pre ?? "tháng "}${readMonth(m)} năm ${readInteger(y)}`,
          ),
    },
    {
      name: "giờ",
      apply: (s) =>
        s.replace(new RegExp(`${B}([01]?\\d|2[0-3]):([0-5]\\d)${E}`, "gu"), (_, h: string, m: string) =>
          Number(m) === 0 ? `${readInteger(h)} giờ` : `${readInteger(h)} giờ ${readInteger(m)} phút`,
        ),
    },
    glossaryRule(glossary),
    {
      name: "đơn vị",
      apply: (s) => {
        let out = s;
        for (const [u, r] of UNIT_AFTER_NUMBER) {
          // "/ha" → "trên héc ta"; "20 ha" → "20 héc ta"
          out = out.replace(new RegExp(`\\s*\\/\\s*${escapeRe(u)}${E}`, "gu"), ` trên ${r} `);
          out = out.replace(new RegExp(`(\\d)\\s*${escapeRe(u)}${E}`, "gu"), `$1 ${r} `);
        }
        return out;
      },
    },
    {
      name: "ký hiệu",
      apply: (s) =>
        s
          .replace(/\$\s*(\d(?:[\d.,]*\d)?)/g, "$1 đô la Mỹ")
          .replace(/\s*%/g, " phần trăm")
          .replace(/\s*°\s*C\b/g, " độ C")
          .replace(/\s*&\s*/g, " và "),
    },
    {
      name: "khoảng số",
      apply: (s) =>
        s.replace(
          new RegExp(`(?<![\\p{L}\\p{N}.,])(${NUM})\\s*[-–—]\\s*(${NUM})(?![\\p{L}\\p{N}])`, "gu"),
          "$1 đến $2",
        ),
    },
    {
      name: "phân nghìn",
      // 800.000 → 800000 (dấu chấm phân nghìn kiểu Việt)
      apply: (s) =>
        s.replace(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+)(?![\d]|[.,]\d)(?![A-Za-z])/g, (m) => m.replace(/\./g, "")),
    },
    {
      name: "phiên bản / điều khoản",
      // 5.0 → năm chấm không; 5.0A → năm chấm không a; 3.8.2 → ba chấm tám chấm hai
      apply: (s) =>
        s.replace(
          new RegExp(`(?<![\\p{L}\\p{N}.,])(\\d+(?:\\.\\d+)+)([A-Za-z])?(?![\\p{L}\\p{N}])`, "gu"),
          (_, v: string, suf: string | undefined) =>
            ` ${v.split(".").map(readInteger).join(" chấm ")}${suf ? " " + letterName(suf) : ""} `,
        ),
    },
    {
      name: "số thập phân",
      apply: (s) =>
        s.replace(/(?<![\d,.])(\d+),(\d+)(?![\d]|,\d)/g, (_, i: string, f: string) => ` ${readDecimal(i, f)} `),
    },
    {
      name: "số nguyên",
      apply: (s) => s.replace(/\d+/g, (m) => ` ${readInteger(m)} `),
    },
    {
      name: "dấu ngoặc",
      apply: (s) => s.replace(/\s*\(\s*/g, ", ").replace(/\s*\)\s*/g, ", ").replace(/[“”"]/g, ""),
    },
  ];
}

function readMonth(m: string) {
  return Number(m) === 4 ? "tư" : readInteger(m);
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.;:!?])/g, "$1")
    .replace(/^[\s,]+/, "")
    .replace(/[\s,]+$/, "")
    .trim();
}

function capitalizeFirst(s: string): string {
  const i = s.search(/\p{L}/u);
  if (i < 0) return s;
  return s.slice(0, i) + s[i].toLocaleUpperCase("vi") + s.slice(i + 1);
}

export function checkTts(tts: string): string[] {
  const w: string[] = [];
  const digits = tts.match(/\d+/g);
  if (digits) w.push(`Còn chữ số: ${[...new Set(digits)].join(", ")}`);
  const caps = tts.match(/(?<![\p{L}])\p{Lu}{2,}\p{Ll}?(?![\p{L}])/gu);
  if (caps) w.push(`Còn cụm viết hoa (có thể đọc sai): ${[...new Set(caps)].join(", ")}`);
  return w;
}

export function createNormalizer(opts: NormalizeOptions = {}) {
  const glossary = opts.noDefaults ? mergeGlossary(opts.glossary) : mergeGlossary(DEFAULT_GLOSSARY, opts.glossary);
  const rules = buildRules(glossary);
  return function normalize(text: string): NormalizeResult {
    let s = text;
    const applied: string[] = [];
    for (const r of rules) {
      const next = r.apply(s);
      if (next !== s) applied.push(r.name);
      s = next;
    }
    s = capitalizeFirst(tidy(s));
    const changed = s !== text.trim();
    return { text, tts: s, changed, rules: applied, warnings: checkTts(s) };
  };
}

/** Chuẩn hóa nhanh với bảng mặc định. */
export function normalizeVi(text: string, opts?: NormalizeOptions): string {
  return createNormalizer(opts)(text).tts;
}
