// Dựng SceneSpec cho một cảnh từ Video JSON: chọn template (thiết kế đã lưu hoặc tự động), thêm dòng nguồn ở cảnh cuối,
// và ghi lại mọi chữ không có trong kịch bản vào assumptions.

import { tierOfLevel, type Scene, type SceneDesign, type Video } from "@cvs/core";
import { getTheme } from "@cvs/themes";
import { autoDesign } from "./design";
import { fade } from "./motion";
import type { SceneSpec } from "./spec";
import { esc, plain } from "./text";
import { TEMPLATES, type TemplateCtx } from "./templates";

export function sceneCtx(video: Video, scene: Scene): TemplateCtx {
  return {
    p: scene.id,
    theme: getTheme(video.style, video.font),
    slow: tierOfLevel(video.level) !== "co-ban",
    sentences: scene.sentences.map((s) => s.text),
    sceneTitle: scene.title,
  };
}

export function effectiveDesign(video: Video, scene: Scene): SceneDesign {
  return scene.design ?? autoDesign(video, scene, video.scenes.indexOf(scene));
}

/** Kiểm tra tham số tối thiểu theo schema.required (đệ quy một cấp). */
export function validateParams(template: string, params: Record<string, unknown>): string[] {
  const def = TEMPLATES[template];
  if (!def) return [`Không có template "${template}"`];
  const errs: string[] = [];
  const req = (def.schema.required as string[] | undefined) ?? [];
  for (const k of req) if (params[k] === undefined || params[k] === null || params[k] === "") errs.push(`Thiếu "${k}"`);
  const props = (def.schema.properties ?? {}) as Record<string, { type?: string; minItems?: number; maxItems?: number }>;
  for (const [k, v] of Object.entries(params)) {
    const p = props[k];
    if (!p || v === undefined || v === null) continue;
    if (p.type === "array") {
      if (!Array.isArray(v)) errs.push(`"${k}" phải là mảng`);
      else {
        if (p.minItems && v.length < p.minItems) errs.push(`"${k}" cần ít nhất ${p.minItems} mục`);
        if (p.maxItems && v.length > p.maxItems) errs.push(`"${k}" tối đa ${p.maxItems} mục`);
      }
    }
    if (p.type === "number" && typeof v !== "number") errs.push(`"${k}" phải là số`);
    if (p.type === "string" && typeof v !== "string") errs.push(`"${k}" phải là chuỗi`);
  }
  return errs;
}

const norm = (s: string) =>
  plain(s)
    .toLowerCase()
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/[“”"«»'’.,:;!?()\-–—→=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Chữ trên màn hình không xuất hiện trong kịch bản (onscreen, lời thoại, tiêu đề, nguồn). */
export function findUnsourcedTexts(video: Video, scene: Scene, texts: string[]): string[] {
  return notIn([...scene.onscreen, ...scene.sentences.map((s) => s.text), scene.title, scene.visual, video.title, `Nguồn: ${video.sources ?? ""}`, video.context ?? ""], texts);
}

/** Kịch bản có sẵn (không do AI viết): chữ trên màn hình chỉ theo kịch bản, chỉ đổi/thêm khi người duyệt yêu cầu. */
export const scriptLocked = (video: Video) => !video.aiWritten;

/** Chữ trên màn hình ngoài cột "chữ trên màn hình" (cùng chữ trích trong ngoặc ở mô tả hình, tên video, dòng nguồn). */
export function findOffScriptTexts(video: Video, scene: Scene, texts: string[]): string[] {
  const quoted = [...scene.visual.matchAll(/[«“"]([^«»“”"]{1,200})[»”"]/g)].map((m) => m[1]);
  return notIn([...scene.onscreen, ...quoted, video.title, `Nguồn: ${video.sources ?? ""}`], texts);
}

function notIn(sources: string[], texts: string[]): string[] {
  const pool = norm(sources.join(" \n "));
  return [...new Set(texts)].filter((t) => {
    const n = norm(t);
    if (!n || /^[\d\s]+$/.test(n)) return false;
    return !pool.includes(n);
  });
}

export function buildSceneSpec(video: Video, scene: Scene, opts: { isLast?: boolean } = {}): SceneSpec & { errors: string[] } {
  const design = effectiveDesign(video, scene);
  const ctx = sceneCtx(video, scene);
  let template = design.template;
  const errors = template === "custom" ? [] : validateParams(template, design.params);
  let spec: Omit<SceneSpec, "template">;
  if (template === "custom" || errors.length) {
    if (errors.length) template = "draft";
    spec = TEMPLATES.draft.build({ note: errors.length ? `Tham số lỗi: ${errors.join("; ")}` : undefined }, ctx);
  } else {
    try {
      spec = TEMPLATES[template].build(design.params, ctx);
    } catch (e) {
      errors.push(`Lỗi dựng template ${template}: ${(e as Error).message}`);
      template = "draft";
      spec = TEMPLATES.draft.build({ note: errors[0] }, ctx);
    }
  }
  // máy quay sống: đẩy chậm cả cảnh theo tỉ lệ 1+k, từ 1/(1+k) lên đúng 1 ở cuối cảnh – nội dung luôn ≤ bố cục gốc nên không
  // bao giờ ra khỏi vùng an toàn (probe đo ở scale 1 = lúc lớn nhất). k mặc định 0,015: chữ 28 px lúc nhỏ nhất vẫn ≥ 27,5 px.
  // Không áp cho cảnh nháp/tùy biến; dòng nguồn ở ngoài lớp quay.
  const k = ctx.theme.motion.camera ?? 0.015;
  if (k > 0 && template !== "draft" && design.template !== "custom") {
    const cam = `${scene.id}-cam`;
    const s0 = Math.round((1 / (1 + k)) * 1e4) / 1e4;
    spec.html = `<div id="${cam}" class="cvs-cam" data-cam-from="${s0}" style="position:absolute;inset:0;transform-origin:50% 50%;">\n${spec.html}\n</div>`;
    spec.anims.unshift({ id: cam, from: { scale: s0 }, to: { scale: 1 }, at: { t: 0 }, until: { end: 0 }, dur: 1, ease: "sine.inOut" });
  }
  if (opts.isLast && video.sources) {
    const id = `${scene.id}-src`;
    const text = `Nguồn: ${video.sources}`;
    spec.html += `\n<div id="${id}" class="src-line t">${esc(text)}</div>`;
    spec.anims.push(fade(ctx, id, { cue: 0, f: 0.2 }, 0.6));
    spec.texts.push(text);
  }
  const unsourced = template === "draft" ? [] : (scriptLocked(video) ? findOffScriptTexts : findUnsourcedTexts)(video, scene, spec.texts);
  const assumptions = [
    ...new Set([...(scene.assumptions ?? []), ...spec.assumptions, ...unsourced.map((t) => `Chữ không có trong kịch bản: «${t}»`)]),
  ];
  return { ...spec, template, assumptions, errors };
}
