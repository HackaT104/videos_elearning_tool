// Hàm ease giống công thức GSAP 3 – Remotion dùng để khớp hình với HyperFrames.

export type EaseFn = (t: number) => number;

const powOut = (p: number): EaseFn => (t) => 1 - Math.pow(1 - t, p);
const powIn = (p: number): EaseFn => (t) => Math.pow(t, p);
const powInOut = (p: number): EaseFn => (t) => (t < 0.5 ? Math.pow(2 * t, p) / 2 : 1 - Math.pow(2 * (1 - t), p) / 2);

const expoIn: EaseFn = (t) => Math.pow(2, 10 * (t - 1)) * t + Math.pow(t, 6) * (1 - t);

const BASE: Record<string, EaseFn> = {
  none: (t) => t,
  linear: (t) => t,
  "power1.in": powIn(2),
  "power1.out": powOut(2),
  "power1.inOut": powInOut(2),
  "power2.in": powIn(3),
  "power2.out": powOut(3),
  "power2.inOut": powInOut(3),
  "power3.in": powIn(4),
  "power3.out": powOut(4),
  "power3.inOut": powInOut(4),
  "power4.in": powIn(5),
  "power4.out": powOut(5),
  "power4.inOut": powInOut(5),
  "sine.in": (t) => 1 - Math.cos((t * Math.PI) / 2),
  "sine.out": (t) => Math.sin((t * Math.PI) / 2),
  "sine.inOut": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  // GSAP ≥ 3.13: expo pha trộn để chạm đúng 0/1 – in(p) = 2^(10(p−1))·p + p⁶(1−p)
  "expo.in": expoIn,
  "expo.out": (t) => 1 - expoIn(1 - t),
  "expo.inOut": (t) => (t < 0.5 ? expoIn(t * 2) / 2 : 1 - expoIn((1 - t) * 2) / 2),
  "circ.in": (t) => 1 - Math.sqrt(1 - t * t),
  "circ.out": (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
};
BASE["circ.inOut"] = (t) => (t < 0.5 ? BASE["circ.in"](t * 2) / 2 : 1 - BASE["circ.in"]((1 - t) * 2) / 2);

const inOutFromOut = (out: EaseFn): EaseFn => (t) => (t < 0.5 ? (1 - out(1 - t * 2)) / 2 : 0.5 + out((t - 0.5) * 2) / 2);

/** elastic (GSAP 3 _configElastic): mặc định out/in (1, 0.3), inOut (1, 0.45). */
function elastic(type: "in" | "out" | "inOut", amplitude = 1, period?: number): EaseFn {
  const p1 = amplitude >= 1 ? amplitude : 1;
  let p2 = (period || (type === "inOut" ? 0.45 : 0.3)) / (amplitude < 1 ? amplitude : 1);
  const p3 = (p2 / (Math.PI * 2)) * (Math.asin(1 / p1) || 0);
  p2 = (Math.PI * 2) / p2;
  const out: EaseFn = (t) => (t === 1 ? 1 : p1 * Math.pow(2, -10 * t) * Math.sin((t - p3) * p2) + 1);
  return type === "out" ? out : type === "in" ? (t) => 1 - out(1 - t) : inOutFromOut(out);
}

/** bounce (GSAP 3, n1 = 7.5625, c = 2.75). */
const bounceOut: EaseFn = (t) =>
  t < 1 / 2.75 ? 7.5625 * t * t : t < 0.7272727272727273 ? 7.5625 * Math.pow(t - 1.5 / 2.75, 2) + 0.75 : t < 0.9090909090909092 ? 7.5625 * Math.pow(t - 2.25 / 2.75, 2) + 0.9375 : 7.5625 * Math.pow(t - 2.625 / 2.75, 2) + 0.984375;
BASE["bounce.out"] = bounceOut;
BASE["bounce.in"] = (t) => 1 - bounceOut(1 - t);
BASE["bounce.inOut"] = inOutFromOut(bounceOut);

// tên khác của GSAP: quad = power1 … quint/strong = power4; power0 = linear
const ALIAS: Record<string, string> = { quad: "power1", cubic: "power2", quart: "power3", quint: "power4", strong: "power4" };

/** Chuẩn hoá tên ease như GSAP: thiếu đuôi → .out ("elastic" = elastic.out, "back(2)" = back.out(2)), tên khác → powerN. */
function normEase(name: string): string {
  const m = name.trim().match(/^(\w+)(?:\.(in|out|inOut))?(\(.*\))?$/);
  if (!m) return name.trim();
  const fam = ALIAS[m[1]] ?? m[1];
  if (fam === "none" || fam === "linear" || fam === "power0") return "none";
  return `${fam}.${m[2] ?? "out"}${m[3] ?? ""}`;
}

/** Ease Remotion khớp GSAP; undefined nếu tên không được hỗ trợ (GSAP vẫn chạy → hai bộ dựng sẽ lệch). */
export function easeOf(name: string): EaseFn | undefined {
  const n = normEase(name);
  if (BASE[n]) return BASE[n];
  const back = n.match(/^back\.(in|out|inOut)(?:\(\s*([\d.]+)?\s*\))?$/);
  if (back) {
    const s = Number(back[2] ?? 1.70158);
    const out: EaseFn = (t) => (t === 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2));
    if (back[1] === "out") return out;
    if (back[1] === "in") return (t) => (s + 1) * t * t * t - s * t * t;
    return inOutFromOut(out);
  }
  const el = n.match(/^elastic\.(in|out|inOut)(?:\(\s*([\d.]+)?\s*(?:,\s*([\d.]+)\s*)?\))?$/);
  if (el) return elastic(el[1] as "in" | "out" | "inOut", el[2] !== undefined ? Number(el[2]) : 1, el[3] !== undefined ? Number(el[3]) : undefined);
  return undefined;
}

export const isKnownEase = (name: string) => easeOf(name) !== undefined;

export function easeFn(name: string): EaseFn {
  return easeOf(name) ?? BASE["power2.out"];
}
