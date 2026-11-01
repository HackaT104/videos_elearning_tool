// Phát lại rãnh chuyển động SceneSpec theo thời gian – cùng ngữ nghĩa với GSAP fromTo trên timeline:
// trước tween đầu tiên → trạng thái "from" của nó; sau đó → tween bắt đầu gần nhất (theo thời gian) quyết định giá trị.

import { ANIM_KEYS, easeFn, formatViNumber, resolveDur, resolveTime, wipeClip, type Anim, type AnimProps, type CountAnim, type SceneTimingLike } from "@cvs/engine/browser";
import type { CSSProperties } from "react";

type Resolved = { a: Anim; start: number; dur: number };

export function resolveAnims(anims: Anim[], T: SceneTimingLike): Map<string, Resolved[]> {
  const map = new Map<string, Resolved[]>();
  anims.forEach((a) => {
    if (!map.has(a.id)) map.set(a.id, []);
    map.get(a.id)!.push({ a, start: resolveTime(a.at, T), dur: resolveDur(a, T) });
  });
  for (const list of map.values()) list.sort((x, y) => x.start - y.start);
  return map;
}

export function propsAt(list: Resolved[], t: number): AnimProps {
  const out: AnimProps = {};
  for (const k of ANIM_KEYS) {
    const withK = list.filter((r) => r.a.from[k] !== undefined || r.a.to[k] !== undefined);
    if (withK.length === 0) continue;
    if (t < withK[0].start) {
      out[k] = withK[0].a.from[k] ?? withK[0].a.to[k];
      continue;
    }
    let cur = withK[0];
    for (const r of withK) if (r.start <= t) cur = r;
    const p = cur.dur <= 0 ? 1 : Math.max(0, Math.min(1, (t - cur.start) / cur.dur));
    const from = cur.a.from[k] ?? cur.a.to[k]!;
    const to = cur.a.to[k] ?? from;
    out[k] = from + (to - from) * easeFn(cur.a.ease)(p);
  }
  return out;
}

export function styleOf(p: AnimProps): CSSProperties {
  const s: CSSProperties = {};
  if (p.opacity !== undefined) s.opacity = p.opacity;
  const tx = p.x ?? 0;
  const ty = p.y ?? 0;
  const sc = p.scale ?? 1;
  const sx = sc * (p.scaleX ?? 1);
  const sy = sc * (p.scaleY ?? 1);
  if (p.x !== undefined || p.y !== undefined || p.scale !== undefined || p.scaleX !== undefined || p.scaleY !== undefined || p.rotate !== undefined) {
    s.transform = `translate(${tx}px, ${ty}px) rotate(${p.rotate ?? 0}deg) scale(${sx}, ${sy})`;
  }
  if (p.blur !== undefined) s.filter = `blur(${p.blur}px)`;
  if (p.dash !== undefined) s.strokeDashoffset = p.dash;
  if (p.wipe !== undefined || p.wipeUp !== undefined) s.clipPath = wipeClip(p.wipe, p.wipeUp);
  // cùng biến CSS như HyperFrames (luật clip-path riêng của cảnh, vd. chữ lộ chừa đệm dấu, đọc biến này)
  const vars = s as Record<string, unknown>;
  if (p.wipe !== undefined) vars["--cvs-wx"] = p.wipe;
  if (p.wipeUp !== undefined) vars["--cvs-wy"] = p.wipeUp;
  return s;
}

export function countText(c: CountAnim, T: SceneTimingLike, t: number): string {
  const start = resolveTime(c.at, T);
  const p = Math.max(0, Math.min(1, (t - start) / c.dur));
  const v = c.from + (c.to - c.from) * easeFn(c.ease)(p);
  return `${c.prefix ?? ""}${formatViNumber(v, c.decimals)}${c.suffix ?? ""}`;
}
