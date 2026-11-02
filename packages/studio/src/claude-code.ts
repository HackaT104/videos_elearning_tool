// Cầu nối Claude Code: khi không có Claude API, Claude Code (gói đã đăng ký) làm phần AI qua lệnh `pnpm cvs`.
// Prompt lấy đúng từ @cvs/ai (cùng quy tắc với đường API); kết quả ghi vào cảnh qua cùng bộ kiểm như AI trong app.

import type { Scene, SceneDesign } from "@cvs/core";
import { checkIllustration, customScenePrompt, designErrors, designPrompt, illustrationPrompt, readingsPrompt, type Prompt } from "@cvs/ai";
import { getProject, getVideo, setVideoFlags, upsertVideo } from "@cvs/db";
import { illustrationStyleHints } from "@cvs/engine";
import { getTheme } from "@cvs/themes";
import { illustrationKey } from "./assets";
import { currentTiming, customLint, customSceneInput, readingIssues } from "./pipeline";

export type SceneEdit = { design?: Partial<SceneDesign>; assumptions?: string[]; note?: string; by?: SceneDesign["by"] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hintsFor = (style: string, font?: string) => illustrationStyleHints(getTheme(style as never, font));

/**
 * Ghi thiết kế cảnh (template + tham số, hoặc mã cảnh tùy biến) sau khi kiểm như AI trong app:
 * validateParams/cue/brief, SVG minh hoạ lọc an toàn, mã tùy biến qua lint của engine. Thiết kế cũ vào history (tối đa 5), bỏ duyệt video.
 */
export function applySceneEdit(projectId: string, key: string, sceneId: string, e: SceneEdit): { ok: boolean; errors: string[] } {
  const row = getVideo(projectId, key);
  if (!row) return { ok: false, errors: ["Không tìm thấy video"] };
  const video = row.data;
  const scene = video.scenes.find((s) => s.id === sceneId);
  if (!scene) return { ok: false, errors: [`Không có cảnh ${sceneId}`] };
  const by = e.by ?? e.design?.by ?? "user";
  const errors: string[] = [];
  if (!["ai", "user", "auto"].includes(by)) errors.push(`"by" phải là ai | user | auto`);
  if (e.assumptions !== undefined && !(Array.isArray(e.assumptions) && e.assumptions.every((a) => typeof a === "string"))) errors.push('"assumptions" phải là mảng chuỗi');
  if (e.note !== undefined && typeof e.note !== "string") errors.push('"note" phải là chuỗi');
  let design: SceneDesign | undefined;
  if (e.design !== undefined) {
    const d = e.design;
    if (!isObj(d) || typeof d.template !== "string") errors.push('Thiết kế cần "template" (chuỗi)');
    else if (d.template === "custom") {
      const code = d.customCode?.[video.engine];
      if (typeof code !== "string" || !code.trim()) errors.push(`Cảnh tùy biến cần "customCode.${video.engine}"`);
      else errors.push(...customLint(video.engine, sceneId)(code));
      design = { template: "custom", params: {}, by, customCode: { ...(scene.design?.customCode ?? {}), [video.engine]: code } };
    } else {
      let params = isObj(d.params) ? { ...d.params } : {};
      errors.push(...designErrors(scene, { template: d.template, params }));
      if (d.template === "illustration" && !errors.length) params = illustrationParams(video.style, video.font, scene, params, errors);
      design = { template: d.template, params, by };
    }
  }
  if (errors.length) return { ok: false, errors };
  if (design) {
    if (scene.design) scene.history = [...(scene.history ?? []), scene.design].slice(-5);
    scene.design = design;
  }
  // chỗ AI tự quyết của thiết kế cũ hết hiệu lực → thay bằng danh sách mới (giữ ghi chú khác)
  if (e.assumptions) scene.assumptions = [...new Set([...(scene.assumptions ?? []).filter((a) => !a.startsWith("AI:")), ...e.assumptions.map((a) => (a.startsWith("AI:") ? a : `AI: ${a}`))])];
  if (e.note?.trim()) scene.notes = [...(scene.notes ?? []), e.note.trim()];
  upsertVideo(projectId, video);
  setVideoFlags(projectId, key, { approved: false });
  return { ok: true, errors: [] };
}

/** SVG mới → lọc + kiểm; không gửi SVG mà brief giữ nguyên → giữ hình cũ. svgKey khớp brief để bước dựng không vẽ lại. */
function illustrationParams(style: string, font: string | undefined, scene: Scene, params: Record<string, unknown>, errors: string[]) {
  const brief = String(params.brief).trim();
  const h = hintsFor(style, font);
  const svgKey = illustrationKey(brief, style, h.strokeWidth, h.dark);
  const old = scene.design?.template === "illustration" ? scene.design.params : null;
  delete params.svgKey;
  if (typeof params.svg === "string" && params.svg.trim()) {
    const r = checkIllustration(params.svg);
    if (!r.svg) errors.push(...r.errors.map((x) => `SVG: ${x}`));
    return { ...params, svg: r.svg ?? undefined, svgKey };
  }
  delete params.svg;
  if (old && typeof old.svg === "string" && String(old.brief ?? "").trim() === brief) return { ...params, svg: old.svg, svgKey: old.svgKey };
  return params;
}

export type PromptKind = "design" | "illustration" | "custom" | "readings";

/** Prompt mà Claude API sẽ nhận cho việc này – Claude Code làm theo đúng prompt đó để chất lượng như đường API. */
export async function claudeCodePrompt(projectId: string, key: string, kind: PromptKind, sceneId?: string, note?: string): Promise<Prompt> {
  const row = getVideo(projectId, key);
  if (!row) throw new Error("Không tìm thấy video");
  const video = row.data;
  if (kind === "readings") {
    const items = readingIssues(video).map((i) => ({ id: `${i.scene}#${i.idx}`, text: i.text, tts: i.tts, warnings: i.warnings }));
    return readingsPrompt(items, `${video.title}. ${video.context ?? ""}`);
  }
  const i = video.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new Error(`Không có cảnh ${sceneId ?? "(thiếu mã cảnh)"}`);
  const scene = video.scenes[i];
  if (kind === "design") return designPrompt(video, scene, currentTiming(projectId, video).scenes[i], note);
  if (kind === "illustration") {
    const brief = note?.trim() || (scene.design?.template === "illustration" ? String(scene.design.params.brief ?? "") : "");
    if (!brief.trim()) throw new Error("Cần mô tả hình (brief) – truyền --note hoặc đặt params.brief của cảnh illustration");
    return illustrationPrompt(brief, hintsFor(video.style, video.font));
  }
  if (kind === "custom") {
    const p = getProject(projectId);
    if (!p) throw new Error("Không tìm thấy dự án");
    const { opts } = await customSceneInput(projectId, video, p.settings, scene.id, note);
    return customScenePrompt(video, scene, opts);
  }
  throw new Error(`Không có loại prompt "${kind}"`);
}
