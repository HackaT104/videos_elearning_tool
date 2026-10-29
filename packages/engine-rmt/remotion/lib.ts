// Thư viện nội bộ cho cảnh TSX tùy biến (LLM chỉ được import từ đây và từ "remotion").
// Mọi mốc dùng at(T, i, f); cấm giây cứng (trừ tiêu đề < 1 s); tất định: không Math.random/Date.now/timer.

import { interpolate, Easing } from "remotion";
import type { CSSProperties } from "react";
import { easeFn, formatViNumber, type SceneTimingLike } from "@cvs/engine/browser";

export type T = SceneTimingLike;
export { formatViNumber };

/** at(T, i, f) = cues[i] + f × (ends[i] − cues[i]) */
export function at(T: T, i: number, f = 0): number {
  const k = Math.max(0, Math.min(T.cues.length - 1, i));
  return T.cues.length ? T.cues[k] + Math.max(0, Math.min(1, f)) * (T.ends[k] - T.cues[k]) : 0;
}

const prog = (t: number, start: number, dur: number, ease = "expo.out") => easeFn(ease)(interpolate(t, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

/** Vào: mờ + trượt + blur nhỏ. */
export function enter(t: number, start: number, o: { dur?: number; rise?: number; x?: number; ease?: string } = {}): CSSProperties {
  const p = prog(t, start, o.dur ?? 0.7, o.ease ?? "expo.out");
  return { opacity: p, transform: `translate(${(o.x ?? 0) * (1 - p)}px, ${(o.rise ?? 24) * (1 - p)}px)`, filter: `blur(${6 * (1 - p)}px)` };
}

/** Lùi về 0,35 khi chuyển ý. */
export function dim(t: number, start: number, to = 0.35, dur = 0.6): number {
  return 1 - (1 - to) * prog(t, start, dur, "power2.inOut");
}

/** Đếm số trong 1,2–1,5 s. */
export function count(t: number, start: number, to: number, o: { from?: number; decimals?: number; dur?: number } = {}): string {
  const p = prog(t, start, o.dur ?? 1.3, "power2.out");
  return formatViNumber((o.from ?? 0) + (to - (o.from ?? 0)) * p, o.decimals ?? 0);
}

/** Chuyển động "sống" tất định theo sin(t). */
export const wobble = (t: number, amp = 4, freq = 0.5) => amp * Math.sin(2 * Math.PI * freq * t);

export { Easing, interpolate };
