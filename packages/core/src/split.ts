// Tách câu (mục 3.5): theo . ? ! nhưng không tách ở số thập phân/phiên bản, viết tắt, hay dấu ":" giữa câu.
// Mỗi câu là một nhịp hình.

const ABBREVIATIONS = [
  "TP", "Th.S", "ThS", "PGS", "GS", "TS", "BS", "KS", "Dr", "Mr", "Mrs", "Ms", "St", "No", "Tr", "tr", "v.v", "vv",
  "e.g", "i.e", "etc", "vs", "approx", "Fig", "Ref", "Vol", "Ed", "Inc", "Ltd", "Co", "Corp", "Q", "Đ", "K", "Art",
];

export function splitSentences(input: string): string[] {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== "." && c !== "?" && c !== "!" && c !== "…") continue;
    // gộp chuỗi dấu kết câu và dấu đóng ngoặc/ngoặc kép theo sau: "...", "?!", ".”"
    let j = i;
    while (j + 1 < text.length && /[.?!…"”’)\]]/.test(text[j + 1])) j++;
    const next = text[j + 1];
    if (next !== undefined && next !== " ") {
      i = j;
      continue; // "5.0", "423.9", "v.v.", "QA/QC." giữa từ
    }
    if (c === "." && j === i) {
      // dấu chấm đơn: kiểm tra viết tắt
      const before = text.slice(start, i);
      const word = before.match(/([\p{L}.]+)$/u)?.[1] ?? "";
      if (ABBREVIATIONS.includes(word) || /^\p{Lu}$/u.test(word)) {
        i = j;
        continue;
      }
    }
    if (next !== undefined) {
      // chỉ tách khi câu sau bắt đầu bằng chữ hoa, chữ số hoặc ngoặc kép mở
      const after = text.slice(j + 2);
      if (!/^["“‘(\[]?[\p{Lu}\d]/u.test(after)) {
        i = j;
        continue;
      }
    }
    out.push(text.slice(start, j + 1).trim());
    start = j + 1;
    i = j;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}
