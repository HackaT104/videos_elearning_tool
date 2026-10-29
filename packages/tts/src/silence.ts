// Cắt im lặng thừa đầu/cuối và giãn nhịp tại chỗ ngắt hơi có sẵn (mục 5.2). Xử lý trực tiếp trên PCM.

import type { SentenceSpan } from "./align";

const FRAME = 0.01; // 10 ms

/** Đường bao RMS (dBFS) theo khung 10 ms. */
export function rmsEnvelope(pcm: Float32Array, sr: number): Float32Array {
  const hop = Math.max(1, Math.round(sr * FRAME));
  const n = Math.ceil(pcm.length / hop);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const a = f * hop;
    const b = Math.min(pcm.length, a + hop);
    for (let i = a; i < b; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / Math.max(1, b - a));
    env[f] = rms > 0 ? 20 * Math.log10(rms) : -120;
  }
  return env;
}

export type Run = { start: number; end: number };

/** Các đoạn có RMS < thresholdDb kéo dài ít nhất minDur giây. */
export function quietRuns(env: Float32Array, thresholdDb: number, minDur: number): Run[] {
  const runs: Run[] = [];
  let s = -1;
  for (let f = 0; f <= env.length; f++) {
    const quiet = f < env.length && env[f] < thresholdDb;
    if (quiet && s < 0) s = f;
    if (!quiet && s >= 0) {
      if ((f - s) * FRAME >= minDur - 1e-9) runs.push({ start: s * FRAME, end: f * FRAME });
      s = -1;
    }
  }
  return runs;
}

export type TrimResult = { pcm: Float32Array; head: number; tail: number };

/**
 * Cắt im lặng đầu/cuối: tương đương silencedetect=noise=-45dB:d=0.15, giữ 0,05 s ở đầu và 0,2 s ở cuối.
 * head/tail = số giây đã cắt.
 */
export function trimSilence(pcm: Float32Array, sr: number, opts = { noiseDb: -45, minDur: 0.15, keepHead: 0.05, keepTail: 0.2 }): TrimResult {
  const env = rmsEnvelope(pcm, sr);
  const runs = quietRuns(env, opts.noiseDb, opts.minDur);
  const dur = pcm.length / sr;
  let head = 0;
  let tail = 0;
  const first = runs[0];
  if (first && first.start <= 1e-9) head = Math.max(0, first.end - opts.keepHead);
  const last = runs.at(-1);
  if (last && last.end >= dur - FRAME - 1e-9 && last !== first) tail = Math.max(0, dur - last.start - opts.keepTail);
  else if (last && last === first && last.end >= dur - FRAME - 1e-9) {
    // toàn file im lặng
    return { pcm: pcm.slice(0, Math.round(sr * 0.1)), head: 0, tail: dur - 0.1 };
  }
  const a = Math.round(head * sr);
  const b = Math.max(a, pcm.length - Math.round(tail * sr));
  return { pcm: pcm.slice(a, b), head: r3(a / sr), tail: r3((pcm.length - b) / sr) };
}

export function shiftSpans(spans: SentenceSpan[], head: number, dur: number): SentenceSpan[] {
  return spans.map((s) => ({ start: r3(clamp(s.start - head, 0, dur)), end: r3(clamp(s.end - head, 0, dur)) }));
}

export type PaceInsert = { at: number; added: number };
export type PaceResult = { pcm: Float32Array; spans: SentenceSpan[]; inserts: PaceInsert[] };

/**
 * Giãn nhịp: với mỗi ranh giới câu, tìm đoạn RMS < −40 dB dài ≥ 0,08 s trong ±1,2 s quanh mốc,
 * kéo dài đoạn đó cho đủ `gap`. Không bao giờ cắt hay chèn giữa từ: không tìm thấy chỗ ngắt → bỏ qua.
 */
export function pace(
  pcm: Float32Array,
  sr: number,
  spans: SentenceSpan[],
  gap: number,
  opts = { quietDb: -40, minDur: 0.08, window: 1.2, maxSilence: 2.4 },
): PaceResult {
  if (spans.length < 2 || gap <= 0) return { pcm, spans, inserts: [] };
  const env = rmsEnvelope(pcm, sr);
  const runs = quietRuns(env, opts.quietDb, opts.minDur);
  const inserts: PaceInsert[] = [];
  for (let i = 0; i < spans.length - 1; i++) {
    const b = (spans[i].end + spans[i + 1].start) / 2;
    const cands = runs.filter((r) => r.end > b - opts.window && r.start < b + opts.window && r.start > 0.02);
    if (cands.length === 0) continue;
    const best = cands
      .map((r) => ({ r, score: Math.abs((r.start + r.end) / 2 - b) - 0.5 * (r.end - r.start) }))
      .sort((x, y) => x.score - y.score)[0].r;
    const existing = best.end - best.start;
    const added = Math.min(Math.max(0, gap - existing), Math.max(0, opts.maxSilence - existing));
    if (added < 0.02) continue;
    if (inserts.some((x) => Math.abs(x.at - (best.start + best.end) / 2) < 1e-6)) continue;
    inserts.push({ at: r3((best.start + best.end) / 2), added: r3(added) });
  }
  if (inserts.length === 0) return { pcm, spans, inserts };
  inserts.sort((a, b) => a.at - b.at);
  // dựng PCM mới
  const extra = inserts.reduce((s, x) => s + Math.round(x.added * sr), 0);
  const out = new Float32Array(pcm.length + extra);
  let src = 0;
  let dst = 0;
  for (const ins of inserts) {
    const cut = Math.round(ins.at * sr);
    out.set(pcm.subarray(src, cut), dst);
    dst += cut - src;
    src = cut;
    dst += Math.round(ins.added * sr); // im lặng (đã là 0)
  }
  out.set(pcm.subarray(src), dst);
  const shift = (t: number) => t + inserts.filter((x) => x.at < t).reduce((s, x) => s + x.added, 0);
  const newSpans = spans.map((s) => ({ start: r3(shift(s.start)), end: r3(shift(s.end)) }));
  // câu kết thúc ngay trước chỗ chèn thì giữ, câu sau bắt đầu sau khoảng lặng
  return { pcm: out, spans: newSpans, inserts };
}

/** Đoạn im lặng dài nhất (giây) – dùng cho QA. */
export function longestSilence(pcm: Float32Array, sr: number, noiseDb = -45): number {
  const runs = quietRuns(rmsEnvelope(pcm, sr), noiseDb, 0.01);
  return runs.reduce((m, r) => Math.max(m, r.end - r.start), 0);
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const r3 = (n: number) => Math.round(n * 1000) / 1000;
