import type { GlossaryEntry, TermRule } from "../types";

/**
 * Bảng thuật ngữ mặc định (mục 4). Người dùng sửa/thêm theo dự án; mục của dự án được ưu tiên.
 * Thứ tự không quan trọng: bộ chuẩn hóa luôn thay cụm dài trước.
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  // Ký hiệu hóa học
  { term: "tCO₂e", reading: "tấn xê ô hai tương đương", caseSensitive: true },
  { term: "tCO2e", reading: "tấn xê ô hai tương đương", caseSensitive: true },
  { term: "tCO₂", reading: "tấn xê ô hai", caseSensitive: true },
  { term: "tCO2", reading: "tấn xê ô hai", caseSensitive: true },
  { term: "CO₂e", reading: "xê ô hai tương đương", caseSensitive: true },
  { term: "CO2e", reading: "xê ô hai tương đương", caseSensitive: true },
  { term: "CO₂", reading: "xê ô hai", caseSensitive: true },
  { term: "CO2", reading: "xê ô hai", caseSensitive: true },
  { term: "CH₄", reading: "mê tan", caseSensitive: true },
  { term: "CH4", reading: "mê tan", caseSensitive: true },
  { term: "N₂O", reading: "ni tơ ô xít", caseSensitive: true },
  { term: "N2O", reading: "ni tơ ô xít", caseSensitive: true },
  { term: "methane", reading: "mê tan" },
  { term: "nitrous oxide", reading: "ni tơ ô xít" },
  // Viết tắt
  { term: "VCS", reading: "vê xê ét", caseSensitive: true },
  { term: "VCU", reading: "vê xê u", caseSensitive: true },
  { term: "VCUs", reading: "vê xê u", caseSensitive: true },
  { term: "VVB", reading: "vê vê bê", caseSensitive: true },
  { term: "VVBs", reading: "vê vê bê", caseSensitive: true },
  { term: "PD", reading: "pê đê", caseSensitive: true },
  { term: "AFOLU", reading: "a phô lu", caseSensitive: true },
  { term: "CORSIA", reading: "co si a", caseSensitive: true },
  { term: "GHG", reading: "khí nhà kính", caseSensitive: true },
  { term: "E&I", reading: "năng lượng và công nghiệp", caseSensitive: true },
  { term: "USD", reading: "đô la Mỹ", caseSensitive: true },
  { term: "QA/QC", reading: "đảm bảo và kiểm soát chất lượng", caseSensitive: true },
  // Tên riêng, từ ngoại
  { term: "Verra", reading: "Ve ra" },
  { term: "Paris", reading: "Pa ri" },
  { term: "carbon", reading: "các bon" },
  { term: "Version", reading: "phiên bản" },
];

/** Thuật ngữ bắt buộc trên màn hình (QA nội dung). */
export const DEFAULT_TERM_RULES: TermRule[] = [
  { wrong: ["xác minh", "kiểm chứng"], right: "thẩm tra", note: "verification = thẩm tra" },
  { wrong: ["xác nhận giá trị", "phê chuẩn"], right: "thẩm định", note: "validation = thẩm định" },
  { wrong: ["TÜV NORD", "TUV Nord", "Tuv Nord", "TÜV Nord"], right: "TUV NORD" },
];

/** Gộp bảng: mục sau (dự án) ghi đè mục trước (mặc định/dùng chung) khi trùng term. */
export function mergeGlossary(...lists: (GlossaryEntry[] | undefined)[]): GlossaryEntry[] {
  const map = new Map<string, GlossaryEntry>();
  for (const list of lists) for (const e of list ?? []) if (e.term.trim()) map.set(keyOf(e), e);
  return [...map.values()];
}

function keyOf(e: GlossaryEntry) {
  return e.caseSensitive ? e.term : e.term.toLowerCase();
}
