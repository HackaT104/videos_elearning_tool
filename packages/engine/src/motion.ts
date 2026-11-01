// Helper chuyển động dùng chung cho mọi template: enter (mờ + trượt + blur nhỏ), dim (lùi về 0,35), count, draw, pop.

import type { Theme } from "@cvs/themes";
import type { Anim, CountAnim, TimeRef } from "./spec";

export type MotionCtx = { theme: Theme; slow: boolean };

export function enterDur(m: MotionCtx) {
  return m.slow ? m.theme.motion.slowEnterDur : m.theme.motion.enterDur;
}
export function enterEase(m: MotionCtx) {
  return m.slow ? m.theme.motion.slowEnterEase : m.theme.motion.enterEase;
}

export function enter(m: MotionCtx, id: string, at: TimeRef, o: { rise?: number; x?: number; scale?: number; blur?: number; dur?: number } = {}): Anim {
  const rise = o.rise ?? m.theme.motion.rise;
  const from: Anim["from"] = { opacity: 0, y: rise, blur: o.blur ?? 6 };
  const to: Anim["to"] = { opacity: 1, y: 0, blur: 0 };
  if (o.x) {
    from.x = o.x;
    to.x = 0;
  }
  if (o.scale !== undefined) {
    from.scale = o.scale;
    to.scale = 1;
  }
  return { id, from, to, at, dur: o.dur ?? enterDur(m), ease: enterEase(m) };
}

/** Chỉ hiện mờ dần (không trượt) – dùng cho phần tử nền/khung. */
export function fade(m: MotionCtx, id: string, at: TimeRef, dur?: number): Anim {
  return { id, from: { opacity: 0 }, to: { opacity: 1 }, at, dur: dur ?? enterDur(m), ease: "power2.out" };
}

export function dim(m: MotionCtx, id: string, at: TimeRef, to = 0.35): Anim {
  return { id, from: { opacity: 1 }, to: { opacity: to }, at, dur: m.slow ? 0.9 : 0.6, ease: "power2.inOut" };
}

export function undim(m: MotionCtx, id: string, at: TimeRef, from = 0.35): Anim {
  return { id, from: { opacity: from }, to: { opacity: 1 }, at, dur: m.slow ? 0.9 : 0.6, ease: "power2.inOut" };
}

export function pop(m: MotionCtx, id: string, at: TimeRef, from = 0.6): Anim {
  return { id, from: { opacity: 0, scale: from }, to: { opacity: 1, scale: 1 }, at, dur: m.slow ? 0.9 : 0.6, ease: "back.out(1.6)" };
}

/** Vẽ nét (stroke-dashoffset 1 → 0, phần tử có pathLength="1" và lớp .draw). */
export function draw(m: MotionCtx, id: string, at: TimeRef, dur?: number, ease = "power2.inOut"): Anim {
  return { id, from: { dash: 1 }, to: { dash: 0 }, at, dur: dur ?? (m.slow ? 1.3 : 0.9), ease };
}

export function grow(m: MotionCtx, id: string, at: TimeRef, axis: "x" | "y", dur?: number): Anim {
  const k = axis === "x" ? "scaleX" : "scaleY";
  return { id, from: { [k]: 0 }, to: { [k]: 1 }, at, dur: dur ?? (m.slow ? 1.4 : 1.1), ease: m.theme.motion.moveEase };
}

export function move(m: MotionCtx, id: string, at: TimeRef, from: Anim["from"], to: Anim["to"], dur?: number): Anim {
  return { id, from, to, at, dur: dur ?? m.theme.motion.moveDur, ease: m.theme.motion.moveEase };
}

/** Lộ dần bằng clip-path: "right" trái → phải (wipe), "up" dưới → trên (wipeUp). */
export function wipeIn(m: MotionCtx, id: string, at: TimeRef, dir: "right" | "up" = "right", dur?: number): Anim {
  const k = dir === "up" ? "wipeUp" : "wipe";
  return { id, from: { [k]: 0 }, to: { [k]: 1 }, at, dur: dur ?? (m.slow ? 1.1 : 0.8), ease: "power3.inOut" };
}

/** Bật vào có nảy đàn hồi nhẹ (elastic.out) – cho biểu tượng/huy hiệu, không dùng cho chữ dài. */
export function springIn(m: MotionCtx, id: string, at: TimeRef, from = 0.4): Anim {
  return { id, from: { opacity: 0, scale: from }, to: { opacity: 1, scale: 1 }, at, dur: m.slow ? 1.3 : 1.0, ease: "elastic.out(1, 0.5)" };
}

/** Đếm số 1,2–1,5 s. */
export function count(m: MotionCtx, id: string, at: TimeRef, to: number, o: { from?: number; decimals?: number; prefix?: string; suffix?: string } = {}): CountAnim {
  return { id, from: o.from ?? 0, to, decimals: o.decimals ?? 0, prefix: o.prefix, suffix: o.suffix, at, dur: m.slow ? 1.5 : 1.2, ease: "power2.out" };
}

/** Lệch nhẹ một mốc: +d giây. */
export function shift(ref: TimeRef, d: number): TimeRef {
  if ("t" in ref) return { t: ref.t + d };
  return { ...ref, d: (ref.d ?? 0) + d };
}
