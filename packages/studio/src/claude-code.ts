// Cầu nối Claude Code: khi không có Claude API, Claude Code (gói đã đăng ký) làm phần AI qua lệnh `pnpm cvs`.
// Prompt lấy đúng từ @cvs/ai (cùng quy tắc với đường API); kết quả ghi vào cảnh qua cùng bộ kiểm như AI trong app.

import { checkTts, type Scene, type SceneDesign } from "@cvs/core";
import { cartoonPrompt, checkIllustration, customScenePrompt, decisionFrom, designErrors, designPrompt, illustrationPrompt, readingsPrompt, reviewReadingsPrompt, translateSubsPrompt, type Prompt } from "@cvs/ai";
import { getProject, getVideo, setVideoFlags, upsertVideo } from "@cvs/db";
import { illustrationStyleHints } from "@cvs/engine";
import { getTheme } from "@cvs/themes";
import { illustrationKey } from "./assets";
import { docPlanPrompt, rewritePrompt } from "./docplan";
import { currentTiming, customLint, customSceneInput, readingIssues } from "./pipeline";
import { translateInput } from "./subs";
import { styleGenPromptFor } from "./style-gen";
import { cartoonPolicy, testCartoon, withCartoonPolicy } from "./cartoon";

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
  withCartoonPolicy(video, getProject(projectId)?.settings);
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
      // AI ghi thiết kế: kịch bản có sẵn thì chữ chỉ theo kịch bản (trừ khi ghi chú sửa yêu cầu); người dùng sửa tay thì không chặn
      errors.push(...designErrors(scene, { template: d.template, params }, by === "ai" ? { video, note: e.note } : undefined));
      if (d.template === "illustration" && !errors.length) params = illustrationParams(video.style, video.font, scene, params, errors);
      // cartoon: mã cảnh chỉ ghi qua set-cartoon (có vẽ thử); đổi tham số mà giữ brief → giữ mã, đổi brief → viết lại
      if (d.template === "cartoon") {
        const old = scene.design?.template === "cartoon" ? scene.design.params : null;
        delete params.code;
        delete params.clip;
        if (old && String(old.brief ?? "").trim() === String(params.brief ?? "").trim() && old.code) params = { ...params, code: old.code };
      }
      const decision = isObj(d.decision) ? decisionFrom({ ...d.decision, template: d.template }, d.decision.by === "ai" ? "ai" : "claude-code") : undefined;
      design = { template: d.template, params, by, ...(decision ? { decision } : {}) };
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

/**
 * Ghi mã cảnh hoạt hình (Claude Code: `pnpm cvs set-cartoon`): lint + vẽ thử vài khung (ảnh trả về để Claude Code tự soát),
 * đạt → lưu params.code, bỏ clip cũ (bước dựng vẽ lại), thiết kế cũ vào history, bỏ duyệt video.
 */
export async function applyCartoonCode(projectId: string, key: string, sceneId: string, b: { code?: unknown; assumptions?: unknown; note?: unknown }) {
  const row = getVideo(projectId, key);
  if (!row) return { ok: false, errors: ["Không tìm thấy video"], frames: [] };
  const video = row.data;
  const i = video.scenes.findIndex((s) => s.id === sceneId);
  const scene = video.scenes[i];
  if (!scene) return { ok: false, errors: [`Không có cảnh ${sceneId}`], frames: [] };
  if (scene.design?.template !== "cartoon") return { ok: false, errors: ["Cảnh chưa là cartoon – set-design template cartoon (có brief) trước"], frames: [] };
  if (typeof b.code !== "string" || !b.code.trim()) return { ok: false, errors: ['Cần "code" (mã cảnh: function scene(t) {...})'], frames: [] };
  const settings = getProject(projectId)?.settings;
  const T = currentTiming(projectId, video).scenes[i];
  const r = await testCartoon(projectId, video, scene, T, cartoonPolicy(settings), b.code);
  if (r.errors.length) return { ok: false, errors: r.errors, frames: r.frames };
  const d = scene.design;
  scene.history = [...(scene.history ?? []), d].slice(-5);
  scene.design = { ...d, by: "ai", params: { ...d.params, code: b.code, clip: undefined } };
  if (Array.isArray(b.assumptions)) scene.assumptions = [...new Set([...(scene.assumptions ?? []).filter((a) => !a.startsWith("AI:")), "AI: Cảnh hoạt hình vẽ tay do AI viết mã – cần duyệt hình", ...b.assumptions.map((a) => `AI: ${String(a)}`)])];
  if (typeof b.note === "string" && b.note.trim()) scene.notes = [...(scene.notes ?? []), b.note.trim()];
  upsertVideo(projectId, video);
  setVideoFlags(projectId, key, { approved: false });
  return { ok: true, errors: [], frames: r.frames, msPerFrame: r.msPerFrame, gpu: r.gpu, estimateSeconds: r.estimate };
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

export type PromptKind = "design" | "illustration" | "cartoon" | "custom" | "readings" | "review-readings" | "analyze-doc" | "write-script" | "translate-subs" | "style-gen";

/** Prompt mà Claude API sẽ nhận cho việc này – Claude Code làm theo đúng prompt đó để chất lượng như đường API. "analyze-doc": key = mã tài liệu. */
export async function claudeCodePrompt(projectId: string, key: string, kind: PromptKind, sceneId?: string, note?: string): Promise<Prompt> {
  if (kind === "analyze-doc") return docPlanPrompt(projectId, key);
  if (kind === "style-gen") return styleGenPromptFor(projectId);
  if (kind === "write-script") return rewritePrompt(projectId, key);
  // dịch phụ đề: note = mã ngôn ngữ đích ("en", hoặc "en all" để dịch lại mọi câu)
  if (kind === "translate-subs") {
    const [lang, all] = (note ?? "").trim().split(/\s+/);
    const i = translateInput(projectId, key, lang, all === "all");
    if (!i.items.length) throw new Error(`Mọi câu của ${key} đã có phụ đề ${lang} – thêm "all" để dịch lại`);
    return translateSubsPrompt(i.items, lang, i.context, i.memory);
  }
  const row = getVideo(projectId, key);
  if (!row) throw new Error("Không tìm thấy video");
  const settings = getProject(projectId)?.settings;
  const video = withCartoonPolicy(row.data, settings);
  if (kind === "readings") {
    const items = readingIssues(video).filter((i) => !i.suggested).map((i) => ({ id: `${i.scene}#${i.idx}`, text: i.text, tts: i.tts, warnings: i.warnings }));
    return readingsPrompt(items, `${video.title}. ${video.context ?? ""}`);
  }
  if (kind === "review-readings") {
    // shortcut: một prompt cho cả video (đường API chia lượt ≤ REVIEW_BATCH câu) – Claude Code đọc được prompt dài
    const items = video.scenes.flatMap((s) => s.sentences.map((x, idx) => ({ id: `${s.id}#${idx}`, text: x.text, tts: x.tts, warnings: checkTts(x.tts) })));
    return reviewReadingsPrompt(items, `${video.title}. ${video.context ?? ""}`);
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
  if (kind === "cartoon") {
    const d = scene.design;
    if (d?.template !== "cartoon" || !String(d.params.brief ?? "").trim()) throw new Error("Cảnh chưa là cartoon có brief – set-design template cartoon với params.brief trước");
    const pol = cartoonPolicy(settings);
    const code = typeof d.params.code === "string" && d.params.code ? d.params.code : undefined;
    return cartoonPrompt(video, scene, currentTiming(projectId, video).scenes[i], { brief: String(d.params.brief), clawd: pol.clawd, fast: pol.fast, layout: d.params.layout as never, note, current: note ? code : undefined });
  }
  if (kind === "custom") {
    const p = getProject(projectId);
    if (!p) throw new Error("Không tìm thấy dự án");
    const { opts } = await customSceneInput(projectId, video, p.settings, scene.id, note);
    return customScenePrompt(video, scene, opts);
  }
  throw new Error(`Không có loại prompt "${kind}"`);
}
