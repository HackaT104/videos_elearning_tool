// Hàm ease giống công thức GSAP 3 – Remotion dùng để khớp hình với HyperFrames.

export type EaseFn = (t: number) => number;

const powOut = (p: number): EaseFn => (t) => 1 - Math.pow(1 - t, p);
const powIn = (p: number): EaseFn => (t) => Math.pow(t, p);
const powInOut = (p: number): EaseFn => (t) => (t < 0.5 ? Math.pow(2 * t, p) / 2 : 1 - Math.pow(2 * (1 - t), p) / 2);

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
  "expo.in": (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  "expo.out": (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  "expo.inOut": (t) => (t === 0 || t === 1 ? t : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  "circ.out": (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
};

export function easeFn(name: string): EaseFn {
  if (BASE[name]) return BASE[name];
  const back = name.match(/^back\.(in|out|inOut)(?:\(([\d.]+)\))?$/);
  if (back) {
    const s = Number(back[2] ?? 1.70158);
    if (back[1] === "out") return (t) => (t === 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2));
    if (back[1] === "in") return (t) => (s + 1) * t * t * t - s * t * t;
    return (t) => (t < 0.5 ? (Math.pow(2 * t, 2) * ((s * 1.525 + 1) * 2 * t - s * 1.525)) / 2 : (Math.pow(2 * t - 2, 2) * ((s * 1.525 + 1) * (t * 2 - 2) + s * 1.525) + 2) / 2);
  }
  return BASE["power2.out"];
}
