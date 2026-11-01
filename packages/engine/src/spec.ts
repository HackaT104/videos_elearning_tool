// SceneSpec: mô tả cảnh trung lập với bộ dựng (markup + CSS + rãnh chuyển động theo mốc câu).
// HyperFrames biên dịch thành HTML + GSAP fromTo; Remotion phát lại bằng interpolate.

/** Mốc thời gian trong cảnh. cue/f → at(cue, f) + d; t → giây cứng (chỉ cho tiêu đề < 1 s); end → T.dur − end. */
export type TimeRef = { cue: number; f?: number; d?: number } | { t: number } | { end: number; d?: number };

export type AnimProps = {
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  /** filter: blur(px) */
  blur?: number;
  /** stroke-dashoffset (đường có pathLength=1) */
  dash?: number;
  /** Lộ dần trái → phải 0..1: clip-path inset(0 calc((1−v)·100%) 0 0). */
  wipe?: number;
  /** Lộ dần dưới → trên 0..1: clip-path inset(calc((1−v)·100%) 0 0 0). */
  wipeUp?: number;
};

export const ANIM_KEYS: (keyof AnimProps)[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "blur", "dash", "wipe", "wipeUp"];

/** clip-path cho wipe/wipeUp (dùng chung HyperFrames CSS và Remotion style). */
export function wipeClip(wx: number | undefined, wy: number | undefined): string {
  const pc = (v: number | undefined) => `${Math.round((1 - (v ?? 1)) * 1e5) / 1e3}%`;
  return `inset(${pc(wy)} ${pc(wx)} 0% 0%)`;
}

export type Anim = {
  /** id đầy đủ của phần tử (đã có tiền tố sN-). */
  id: string;
  from: AnimProps;
  to: AnimProps;
  at: TimeRef;
  dur: number;
  /** Nếu có: thời lượng = until − at (tối thiểu 0,05 s), thay cho dur. */
  until?: TimeRef;
  ease: string;
};

export type CountAnim = {
  id: string;
  from: number;
  to: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
  at: TimeRef;
  dur: number;
  ease: string;
};

export type SceneSpec = {
  /** Markup bên trong stage (id có tiền tố sN-). */
  html: string;
  /** CSS riêng của cảnh (chỉ dùng #sN-… hoặc lớp chung). */
  css: string;
  anims: Anim[];
  counts: CountAnim[];
  /** Mọi chuỗi chữ hiển thị (cho QA nội dung). */
  texts: string[];
  /** Những chữ/nhãn template tự thêm (không có trong kịch bản). */
  assumptions: string[];
  template: string;
};

export type SceneTimingLike = { dur: number; cues: number[]; ends: number[] };

export function resolveTime(ref: TimeRef, T: SceneTimingLike): number {
  if ("t" in ref) return ref.t;
  if ("end" in ref) return Math.max(0, T.dur - ref.end + (ref.d ?? 0));
  const n = T.cues.length;
  if (n === 0) return ref.d ?? 0;
  const i = Math.max(0, Math.min(n - 1, ref.cue));
  const f = Math.max(0, Math.min(1, ref.f ?? 0));
  return Math.max(0, T.cues[i] + f * (T.ends[i] - T.cues[i]) + (ref.d ?? 0));
}

/** Biểu thức JS dùng at() cho HyperFrames (để build tự cập nhật khối TIMING mà không sửa cảnh). */
export function timeExpr(ref: TimeRef): string {
  const num = (n: number) => String(Math.round(n * 1000) / 1000);
  if ("t" in ref) return num(ref.t);
  if ("end" in ref) return `Math.max(0, T.dur - ${num(ref.end)}${ref.d ? ` + ${num(ref.d)}` : ""})`;
  const base = `at(${ref.cue}, ${num(ref.f ?? 0)})`;
  return ref.d ? `Math.max(0, ${base} + ${num(ref.d)})` : base;
}

/** Thời lượng ra cảnh: blur 8 px + mờ 0,3 s power3.in tại T.dur − 0.45. */
export const EXIT = { at: { end: 0.45 } as TimeRef, dur: 0.3, ease: "power3.in", to: { opacity: 0, blur: 8 } };

export function resolveDur(a: { at: TimeRef; dur: number; until?: TimeRef }, T: SceneTimingLike): number {
  if (!a.until) return a.dur;
  return Math.max(0.05, resolveTime(a.until, T) - resolveTime(a.at, T));
}

export function durExpr(a: { at: TimeRef; dur: number; until?: TimeRef }): string {
  if (!a.until) return String(Math.round(a.dur * 1000) / 1000);
  return `Math.max(0.05, (${timeExpr(a.until)}) - (${timeExpr(a.at)}))`;
}
