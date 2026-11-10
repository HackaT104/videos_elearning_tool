// Biên dịch SceneSpec → compositions/sN.html theo hợp đồng mục 6A.3.

import { formatClock, type Scene, type SceneTiming } from "@cvs/core";
import { ANIM_KEYS, durExpr, EXIT, resolveTime, timeExpr, type Anim, type AnimProps, type SceneSpec, type SceneTimingLike } from "@cvs/engine";

const TIMING_RE = /\/\*TIMING\*\/[\s\S]*?\/\*\/TIMING\*\//;

export function timingBlock(t: SceneTimingLike): string {
  return `/*TIMING*/${JSON.stringify({ dur: t.dur, cues: t.cues, ends: t.ends })}/*/TIMING*/`;
}

/** Thay khối /*TIMING*\/…/*\/TIMING*\/ theo giọng thật, không đụng phần còn lại của cảnh. */
export function replaceTimingBlock(html: string, t: SceneTimingLike): string {
  if (!TIMING_RE.test(html)) throw new Error("Cảnh thiếu khối /*TIMING*/…/*/TIMING*/");
  return html.replace(TIMING_RE, timingBlock(t));
}

export function readTimingBlock(html: string): SceneTimingLike | null {
  const m = html.match(/\/\*TIMING\*\/([\s\S]*?)\/\*\/TIMING\*\//);
  return m ? JSON.parse(m[1]) : null;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

function gsapVars(p: AnimProps): string {
  const parts: string[] = [];
  for (const k of ANIM_KEYS) {
    const v = p[k];
    if (v === undefined) continue;
    if (k === "blur") parts.push(`filter: "blur(${r(v)}px)"`);
    else if (k === "dash") parts.push(`strokeDashoffset: ${r(v)}`);
    else if (k === "rotate") parts.push(`rotation: ${r(v)}`);
    else if (k === "wipe" || k === "wipeUp") parts.push(`"${WIPE_VAR[k]}": ${r(v)}`);
    else parts.push(`${k}: ${r(v)}`);
  }
  return parts.join(", ");
}

/** wipe/wipeUp: GSAP tween biến CSS (số thuần, tất định); clip-path đọc biến qua luật CSS riêng của phần tử. */
const WIPE_VAR = { wipe: "--cvs-wx", wipeUp: "--cvs-wy" } as const;

export function wipeCss(anims: Anim[]): string {
  const axes = new Map<string, Set<"wipe" | "wipeUp">>();
  for (const a of anims)
    for (const k of ["wipe", "wipeUp"] as const)
      if (a.from[k] !== undefined || a.to[k] !== undefined) {
        if (!axes.has(a.id)) axes.set(a.id, new Set());
        axes.get(a.id)!.add(k);
      }
  const pc = (on: boolean, v: string) => (on ? `calc((1 - var(${v}, 1)) * 100%)` : "0%");
  return [...axes].map(([id, s]) => `#${id} { clip-path: inset(${pc(s.has("wipeUp"), WIPE_VAR.wipeUp)} ${pc(s.has("wipe"), WIPE_VAR.wipe)} 0% 0%); }`).join("\n");
}

function pick(p: AnimProps, keys: (keyof AnimProps)[]): AnimProps {
  const o: AnimProps = {};
  for (const k of keys) if (p[k] !== undefined) o[k] = p[k];
  return o;
}

/**
 * Sinh các lệnh tl.fromTo. Mỗi phần tử: sắp theo thời gian; thuộc tính xuất hiện lần đầu → immediateRender (trạng thái đầu đúng
 * khi tua ngược); thuộc tính đã có tween trước đó → immediateRender:false (tránh ghi đè trạng thái đầu).
 */
export function compileAnims(anims: Anim[], T: SceneTimingLike): string[] {
  const byEl = new Map<string, Anim[]>();
  for (const a of anims) {
    if (!byEl.has(a.id)) byEl.set(a.id, []);
    byEl.get(a.id)!.push(a);
  }
  const lines: string[] = [];
  for (const [id, list] of byEl) {
    const sorted = [...list].map((a, i) => ({ a, i, t: resolveTime(a.at, T) })).sort((x, y) => x.t - y.t || x.i - y.i);
    const seen = new Set<keyof AnimProps>();
    for (const { a } of sorted) {
      const keys = ANIM_KEYS.filter((k) => a.from[k] !== undefined || a.to[k] !== undefined);
      const first = keys.filter((k) => !seen.has(k));
      const later = keys.filter((k) => seen.has(k));
      keys.forEach((k) => seen.add(k));
      for (const [group, imm] of [[first, true], [later, false]] as const) {
        if (group.length === 0) continue;
        const from = gsapVars(pick(a.from, group));
        const to = gsapVars(pick(a.to, group));
        // máy quay (-cam): giữ transform 2D như Remotion (không tách lớp GPU làm mờ chữ khi phóng)
        const f3d = id.endsWith("-cam") ? ", force3D: false" : "";
        // strokeDashoffset là px: GSAP mặc định làm tròn (autoRound) → pathLength=1 nhảy 1 → 0, lệch Remotion
        const ar = group.includes("dash") ? ", autoRound: false" : "";
        lines.push(`tl.fromTo("#${id}", { ${from} }, { ${to}, duration: ${durExpr(a)}, ease: "${a.ease}"${f3d}${ar}${imm ? "" : ", immediateRender: false"} }, ${timeExpr(a.at)});`);
      }
    }
  }
  return lines;
}

export type CompileMeta = { scene: Scene; videoKey: string; summary?: string };

export function compileScene(spec: SceneSpec, T: SceneTiming | SceneTimingLike, meta: CompileMeta): string {
  const sid = meta.scene.id;
  const stage = `${sid}-stage`;
  const exitAnim: Anim = { id: stage, from: { opacity: 1, blur: 0 }, to: EXIT.to, at: EXIT.at, dur: EXIT.dur, ease: EXIT.ease };
  const lines = compileAnims([...spec.anims, exitAnim], T);
  const counts = spec.counts.map(
    (c) =>
      `tl.fromTo("#${c.id}", { textContent: ${c.from} }, { textContent: ${c.to}, duration: ${r(c.dur)}, ease: "${c.ease}", immediateRender: false, modifiers: { textContent: (v) => ${JSON.stringify(c.prefix ?? "")} + fmt(Number(v), ${c.decimals}) + ${JSON.stringify(c.suffix ?? "")} } }, ${timeExpr(c.at)});`,
  );
  // clip hoạt hình vẽ tay: media có thời gian của cảnh (tính từ đầu cảnh), tắt tiếng – runtime HyperFrames tua theo khung
  let clipN = 0;
  const html = spec.html.replace(/<video class="cartoon-clip" data-cvs-clip="1"/g, () => `<video id="${sid}-clip${clipN++}" class="clip cartoon-clip" data-cvs-clip="1" data-start="0" data-duration="${r(T.dur)}" data-track-index="0"`);
  const visual = (meta.summary ?? meta.scene.visual).replace(/--/g, "–").replace(/\s+/g, " ").slice(0, 220);
  return `<!-- ${sid} · ${meta.scene.title.replace(/--/g, "–")} (kịch bản ${formatClock(meta.scene.scriptStart)}–${formatClock(meta.scene.scriptEnd)}) · template ${spec.template} · ${visual} -->
<!-- TỰ SINH từ JSON kịch bản (${meta.videoKey}). Sửa thiết kế trong ứng dụng; khối TIMING được build cập nhật theo giọng thật. -->
<template>
<style>
#root { position: absolute; inset: 0; }
${spec.css}
${wipeCss(spec.anims)}
</style>
<div id="root" data-composition-id="${sid}" data-width="1920" data-height="1080">
<div id="${stage}" class="cvs-scene">
${html}
</div>
</div>
<script>
(function () {
const T = ${timingBlock(T)};
const at = (i, f) => { const k = Math.max(0, Math.min(T.cues.length - 1, i)); return T.cues.length ? T.cues[k] + f * (T.ends[k] - T.cues[k]) : 0; };
const fmt = (v, d) => { const s = Math.abs(v).toFixed(d).split("."); return (v < 0 ? "−" : "") + s[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".") + (s[1] ? "," + s[1] : ""); };
const tl = gsap.timeline({ paused: true });
${[...lines, ...counts].join("\n")}
window.__timelines = window.__timelines || {};
window.__timelines["${sid}"] = tl;
})();
</script>
</template>
`;
}
