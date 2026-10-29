// Gán mốc cho từng câu từ cues của CIT theo tỉ lệ số ký tự (mục 5.2).

import type { Cue } from "@cvs/core";

/** Số ký tự "có nghĩa" (bỏ khoảng trắng và dấu câu – CIT có thể trả dấu câu khác). */
export function charLen(s: string): number {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").length;
}

export type SentenceSpan = { start: number; end: number };

/**
 * Ghép các cue thành một trục ký tự, nội suy vị trí ký tự đầu/cuối mỗi câu ra giây.
 * Câu đầu bắt đầu ở min(cue0.start, 0.3); câu cuối kết thúc ở cuối file.
 */
export function alignSentences(sentences: string[], cues: Cue[], fileDur: number): SentenceSpan[] {
  const n = sentences.length;
  if (n === 0) return [];
  const usable = cues.filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end >= c.start);
  const lens = usable.map((c) => Math.max(1, charLen(c.text)));
  if (usable.length === 0) {
    // không có cue: chia đều theo số ký tự trên toàn file
    return alignSentences(sentences, [{ start: 0, end: fileDur, text: sentences.join(" ") }], fileDur);
  }
  const offs: number[] = [0];
  for (const l of lens) offs.push(offs.at(-1)! + l);
  const C = offs.at(-1)!;
  const sLens = sentences.map((s) => Math.max(1, charLen(s)));
  const S = sLens.reduce((a, b) => a + b, 0);
  const scale = C / S;

  // x tại ranh giới cue: "start" → đầu cue sau; "end" → cuối cue trước (khoảng lặng thuộc về chỗ ngắt).
  const timeAt = (x: number, side: "start" | "end"): number => {
    x = Math.max(0, Math.min(C, x));
    for (let k = 0; k < usable.length; k++) {
      const a = offs[k];
      const b = offs[k + 1];
      const inside = side === "start" ? x >= a && x < b : x > a && x <= b;
      if (inside || (k === usable.length - 1 && x >= b) || (k === 0 && x <= a)) {
        const c = usable[k];
        const f = (x - a) / (b - a);
        return c.start + Math.max(0, Math.min(1, f)) * (c.end - c.start);
      }
    }
    return usable.at(-1)!.end;
  };

  const spans: SentenceSpan[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = acc * scale;
    acc += sLens[i];
    const b = acc * scale;
    spans.push({ start: timeAt(a, "start"), end: timeAt(b, "end") });
  }
  spans[0].start = Math.min(usable[0].start, 0.3);
  spans[n - 1].end = Math.max(spans[n - 1].end, fileDur);
  // đơn điệu
  for (let i = 1; i < n; i++) {
    if (spans[i].start < spans[i - 1].end) spans[i].start = spans[i - 1].end;
    if (spans[i].end < spans[i].start) spans[i].end = spans[i].start;
  }
  return spans.map((s) => ({ start: r3(s.start), end: r3(s.end) }));
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
