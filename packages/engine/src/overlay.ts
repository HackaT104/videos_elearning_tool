// Lớp phủ toàn video (logo + phụ đề gắn cứng) dưới dạng SceneSpec của "cảnh" overlay: HyperFrames biên dịch như một cảnh
// (compositions/overlay.html, cùng lint), Remotion phát lại bằng SpecScene – hai bộ dựng cùng mốc, cùng ease.
// Khối TIMING của overlay: cues/ends = mốc từng khối phụ đề (+ mốc hiện logo ở cuối khi bỏ cảnh đầu).

import { captionBlocks, overlayLayout, type OverlaySettings, type Scene, type Timing, type Video } from "@cvs/core";
import { IMG_DIR } from "./assets";
import type { Anim, SceneSpec, SceneTimingLike } from "./spec";

export const OVERLAY_ID = "overlay";

export type OverlayBuild = {
  spec: SceneSpec;
  T: SceneTimingLike;
  /** CSS toàn trang (nâng dòng "Nguồn" của cảnh lên trên phụ đề/logo ở đáy). */
  globalCss: string;
  /** Cảnh giả để biên dịch (chú thích đầu file HyperFrames). */
  scene: Scene;
  warnings: string[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** null khi không có gì để vẽ (phụ đề không gắn cứng và không có logo / thiếu ảnh logo – xem overlayWarnings). */
export function overlaySpec(video: Video, timing: Timing, o: OverlaySettings, hasAsset: (id: string) => boolean): OverlayBuild | null {
  const warnings: string[] = [];
  const s = o.subtitle;
  const burn = s.mode === "burn";
  const logoOk = !!o.logo.assetId && hasAsset(o.logo.assetId);
  const eff: OverlaySettings = logoOk ? o : { ...o, logo: { ...o.logo, assetId: undefined } };
  const L = overlayLayout(eff, burn);
  const { captions, missing } = burn ? captionBlocks(video, timing, s) : { captions: [], missing: 0 };
  if (missing) warnings.push(`${missing} câu chưa có phụ đề ${s.burnLanguage} – dùng lời thoại tiếng Việt`);
  if (!L.logo && !captions.length) return null;

  const id = (x: string) => `${OVERLAY_ID}-${x}`;
  const html: string[] = [];
  const css: string[] = [];
  const anims: Anim[] = [];
  const cues = captions.map((c) => c.start);
  const ends = captions.map((c) => c.end);
  if (L.logo) {
    const b = L.logo;
    html.push(`<img id="${id("logo")}" class="cvs-ov-logo" src="${IMG_DIR}${o.logo.assetId}" alt="">`);
    css.push(`#${id("logo")}{position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;object-fit:contain;}`);
    const skip = o.logo.scenes === "skip-first" && timing.scenes.length > 1;
    if (skip) {
      cues.push(timing.scenes[1].start);
      ends.push(timing.scenes[1].start);
    }
    // hiện nhẹ 0,4 s ở đầu video (hoặc đầu cảnh 2 khi bỏ cảnh đầu)
    anims.push({ id: id("logo"), from: { opacity: 0 }, to: { opacity: o.logo.opacity }, at: skip ? { cue: cues.length - 1 } : { t: 0 }, dur: 0.4, ease: "power1.out" });
  }
  if (captions.length) {
    const c = L.caption;
    const shadow = s.background < 0.35 ? "text-shadow:0 2px 8px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.9);" : "";
    css.push(
      `.cvs-cap{position:absolute;left:0;right:0;${c.edge}:${c.offset}px;display:flex;justify-content:center;align-items:${c.edge === "bottom" ? "flex-end" : "flex-start"};}`,
      `.cvs-cap-box{display:inline-block;box-sizing:border-box;background:rgba(0,0,0,${s.background});color:#fff;font-family:var(--font-body);font-weight:var(--w-bold);font-size:${s.size}px;line-height:1.3;padding:.2em .55em;border-radius:${Math.round(s.size * 0.3)}px;text-align:center;${shadow}}`,
      `.cvs-cap-l{display:block;white-space:nowrap;}`,
    );
    captions.forEach((cap, i) => {
      const size = cap.size !== s.size ? ` style="font-size:${cap.size}px"` : "";
      html.push(`<div id="${id(`c${i}`)}" class="cvs-cap"><span class="cvs-cap-box"${size}>${cap.lines.map((l) => `<span class="cvs-cap-l">${esc(l)}</span>`).join("")}</span></div>`);
      anims.push(
        { id: id(`c${i}`), from: { opacity: 0 }, to: { opacity: 1 }, at: { cue: i, f: 0 }, dur: 0.15, ease: "power1.out" },
        { id: id(`c${i}`), from: { opacity: 1 }, to: { opacity: 0 }, at: { cue: i, f: 1 }, dur: 0.15, ease: "power1.in" },
      );
    });
  }
  const total = timing.total;
  return {
    spec: { html: html.join("\n"), css: css.join("\n"), anims, counts: [], texts: [], assumptions: [], template: OVERLAY_ID },
    T: { dur: total, cues, ends },
    globalCss: L.srcBottom ? `.src-line{bottom:${L.srcBottom}px !important;}` : "",
    scene: { id: OVERLAY_ID, scriptStart: 0, scriptEnd: total, title: "Phụ đề và logo", visual: "Lớp phủ toàn video: logo và phụ đề gắn cứng", onscreen: [], sentences: [] },
    warnings,
  };
}

/** Cảnh báo chung của lớp phủ cho bước build (thiếu file logo). */
export function overlayWarnings(o: OverlaySettings | undefined, hasAsset: (id: string) => boolean): string[] {
  return o?.logo.assetId && !hasAsset(o.logo.assetId) ? [`Thiếu ảnh logo ${o.logo.assetId} trong thư mục ảnh của dự án – video không có logo`] : [];
}
