// Claude đọc và phân tích tài liệu đã tải: phần nào cần video, kịch bản trong tài liệu có đủ không, làm theo script hay viết lại.
// Kế hoạch lưu cùng tài liệu (files.summary.plan); "Áp dụng" thay cảnh theo kế hoạch (lời thoại nguyên văn) hoặc viết lại bằng AI.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blockText, buildVideo, docDigest, docxToBlocks, makeVideoKey, parseBlocks, parseVideoFileName, type Block, type OutlineDoc, type Video } from "@cvs/core";
import {
  aiAvailable, analyzeDoc, analyzeDocPrompt, planErrors, scriptErrors, scriptFromReply, writeScript, writeScriptPrompt,
  type AiScript, type AnalyzeDocInput, type DocPlan, type PlanVideo, type Prompt, type WriteScriptInput,
} from "@cvs/ai";
import { activeJobFor, addClaudeRequest, enqueueJob, getFile, getProject, getVideo, listFiles, listJobs, paths, setVideoFlags, updateFileSummary, type Project, type SourceFile } from "@cvs/db";
import { parseOpts, saveParsedVideo } from "./ingest";

export type StoredPlan = DocPlan & { by: "ai" | "claude-code"; at: string };
export type PlanMode = "follow-script" | "rewrite";
export type PlanChoice = { key: string; mode?: PlanMode; include?: boolean };
type Doc = { p: Project; file: SourceFile; blocks: Block[]; input: AnalyzeDocInput; parsed: Video[] };

const SOURCE_CAP = 12000;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

async function loadDoc(pid: string, fileId: string): Promise<Doc> {
  const p = getProject(pid);
  if (!p) throw new Error("Không tìm thấy dự án");
  const file = getFile(pid, fileId);
  if (!file) throw new Error("Không tìm thấy tài liệu");
  const stored = str((file.summary as any)?.stored);
  // tên lưu do ingest đặt (đã làm sạch) – vẫn chặn đường dẫn lạ
  if (!/\.docx$/i.test(stored) || /[\\/]|\.\./.test(stored)) throw new Error("Chỉ phân tích được tài liệu Word (.docx) đã tải lên");
  const f = join(paths.source(pid), stored);
  if (!existsSync(f)) throw new Error("Không còn file gốc của tài liệu – hãy tải lên lại");
  const blocks = await docxToBlocks(readFileSync(f));
  const result = parseBlocks(blocks, { ...parseOpts(p, file.level), fileName: file.name });
  return {
    p,
    file,
    blocks,
    parsed: result.videos,
    input: { fileName: file.name, units: result.units ?? [], videos: result.videos, digest: docDigest(blocks), docText: blocks.map(blockText).join("\n") },
  };
}

/** Prompt mà Claude API nhận khi phân tích tài liệu – Claude Code làm theo đúng prompt này (`pnpm cvs doc`). */
export async function docPlanPrompt(pid: string, fileId: string): Promise<Prompt> {
  return analyzeDocPrompt((await loadDoc(pid, fileId)).input);
}

const cleanVideo = (v: PlanVideo, key: string, proposed: boolean): PlanVideo => ({
  fileName: str(v.fileName),
  key,
  unit: str(v.unit),
  title: str(v.title),
  hasScript: proposed ? false : !!v.hasScript,
  issues: strs(v.issues),
  suggestedMode: proposed ? "rewrite" : v.suggestedMode,
  reason: str(v.reason),
  scenes: Array.isArray(v.scenes) && v.scenes.length
    ? v.scenes.map((s) => ({ title: str(s.title), start: Number.isFinite(s.start) ? Number(s.start) : undefined, end: Number.isFinite(s.end) ? Number(s.end) : undefined, visual: str(s.visual), onscreen: strs(s.onscreen), vo: str(s.vo).replace(/^["“]|["”]$/g, "") }))
    : null,
  visualNotes: (Array.isArray(v.visualNotes) ? v.visualNotes : []).map((n) => ({ scene: str(n.scene), template: str(n.template), note: str(n.note) })),
  contextSummary: str(v.contextSummary) || undefined,
  ...(proposed ? { proposed: true } : {}),
});

/** Kiểm rồi lưu kế hoạch cùng tài liệu (bỏ dấu "đã áp dụng" cũ). Mã video điền theo tên file. */
export async function saveDocPlan(pid: string, fileId: string, plan: DocPlan, by: StoredPlan["by"], doc?: Doc): Promise<{ ok: boolean; errors: string[]; plan?: StoredPlan }> {
  const d = doc ?? (await loadDoc(pid, fileId));
  const errors = planErrors(plan, d.input);
  const key = (fn: string) => makeVideoKey(d.p.course, d.file.level, parseVideoFileName(fn).base);
  const taken = new Set([...d.parsed.map((v) => v.key), ...(Array.isArray(plan?.videos) ? plan.videos.map((v) => key(str(v?.fileName))) : [])]);
  (Array.isArray(plan?.proposed) ? plan.proposed : []).forEach((v, k) => {
    const parts = parseVideoFileName(str(v?.fileName));
    if (!parts.module || !parts.unit) errors.push(`proposed[${k}]: "fileName" cần dạng videos/MO1_U1.3_1.mp4`);
    else if (taken.has(key(v.fileName))) errors.push(`proposed[${k}]: tên file ${v.fileName} trùng video đã có`);
  });
  if (errors.length) return { ok: false, errors };
  const stored: StoredPlan = {
    videos: plan.videos.map((v) => cleanVideo(v, key(v.fileName), false)),
    proposed: (plan.proposed ?? []).map((v) => cleanVideo(v, key(v.fileName), true)),
    notes: strs(plan.notes),
    by,
    at: new Date().toISOString(),
  };
  const { applied: _old, ...summary } = (d.file.summary ?? {}) as Record<string, unknown>;
  updateFileSummary(pid, fileId, { ...summary, plan: stored });
  return { ok: true, errors: [], plan: stored };
}

/** Job "analyze-doc" (Claude API): đọc tài liệu → kế hoạch → lưu. */
export async function aiAnalyzeDoc(pid: string, fileId: string, progress: (pct: number, msg: string) => void) {
  progress(5, "Đọc tài liệu");
  const d = await loadDoc(pid, fileId);
  progress(15, `Claude đang đọc ${d.input.units.length || 1} bài, ${d.parsed.length} khối video…`);
  const plan = await analyzeDoc(d.input);
  progress(90, "Lưu kế hoạch");
  const r = await saveDocPlan(pid, fileId, plan, "ai", d);
  if (!r.ok) throw new Error(`Kế hoạch không hợp lệ: ${r.errors.join("; ")}`);
  return { videos: r.plan!.videos.length, proposed: r.plan!.proposed.length };
}

const range = (ids: string[]) => {
  const n = ids.map((x) => Number(x.slice(1)));
  return n.length > 1 && n.every((x, i) => i === 0 || x === n[i - 1] + 1) ? `${ids[0]}–${ids[ids.length - 1]}` : ids.join(", ");
};

/** Kế hoạch + tình trạng hiện tại từng video (cho giao diện). */
export function docPlanView(pid: string, fileId: string) {
  const file = getFile(pid, fileId);
  if (!file) throw new Error("Không tìm thấy tài liệu");
  const s = (file.summary ?? {}) as { plan?: StoredPlan; applied?: unknown; stored?: string; units?: unknown };
  const job = listJobs(pid, 100).find((j) => j.kind === "analyze-doc" && j.payload?.fileId === fileId && ["queued", "running", "failed"].includes(j.status)) ?? null;
  const items = s.plan
    ? [...s.plan.videos, ...s.plan.proposed].map((v) => {
        const row = v.key ? getVideo(pid, v.key) : null;
        const missing = row ? row.data.scenes.filter((x) => !x.sentences.length).map((x) => x.id) : [];
        const status = v.proposed && !row ? "Đề xuất – chưa có video" : !v.hasScript ? "Không có script" : missing.length ? `Thiếu lời thoại ở ${range(missing)}` : "Có script đầy đủ";
        return { ...v, status, complete: !!row && v.hasScript && !missing.length, sceneCount: v.scenes?.length ?? row?.data.scenes.length ?? 0, exists: !!row, aiWritten: !!row?.data.aiWritten, include: row?.include ?? false };
      })
    : [];
  return { file: { id: file.id, name: file.name, level: file.level, kind: file.kind }, analyzable: /\.docx$/i.test(s.stored ?? ""), units: s.units ?? [], plan: s.plan ?? null, applied: s.applied ?? null, items, job };
}

/** Tìm mục kế hoạch của một video trong các tài liệu của dự án (tài liệu mới nhất trước). */
function findPlanEntry(pid: string, key: string): { file: SourceFile; v: PlanVideo } | null {
  for (const file of listFiles(pid).reverse()) {
    const plan = (file.summary as { plan?: StoredPlan } | null)?.plan;
    const v = plan && [...plan.videos, ...plan.proposed].find((x) => x.key === key);
    if (v) return { file, v };
  }
  return null;
}

/** Nội dung một bài (từ "unit_number: X" tới bài kế) – nguồn khi viết video đề xuất. */
function unitText(blocks: Block[], unit: string): string {
  const want = unit.replace(/^U/i, "").trim();
  const starts = blocks.map((b, i) => (b.kind !== "table" && /^unit_number\s*[:：]/i.test(b.text) ? i : -1)).filter((i) => i >= 0);
  const k = starts.findIndex((i) => (blocks[i] as { text: string }).text.split(/[:：]/)[1]?.trim() === want);
  if (k < 0) return "";
  return blocks.slice(starts[k], starts[k + 1] ?? blocks.length).map(blockText).join("\n").slice(0, SOURCE_CAP);
}

/** Dàn ý + tài liệu nguồn cho việc viết lại (dùng chung cho job API và Claude Code). */
async function rewriteInput(pid: string, key: string): Promise<{ p: Project; fileId: string; outline: OutlineDoc; input: WriteScriptInput }> {
  const found = findPlanEntry(pid, key);
  if (!found) throw new Error(`Chưa có kế hoạch phân tích tài liệu cho video ${key}`);
  const { file, v } = found;
  const p = getProject(pid)!;
  const row = getVideo(pid, key);
  const scenes = row?.data.scenes ?? [];
  let unitSrc = "";
  if (!row?.data.context) unitSrc = unitText((await loadDoc(pid, file.id)).blocks, v.unit);
  const narration = scenes.flatMap((s) => s.sentences.map((x) => x.text)).join(" ");
  const sourceText = [
    v.contextSummary && `TÓM TẮT BÀI: ${v.contextSummary}`,
    row?.data.context || unitSrc,
    narration && !row?.data.aiWritten && `KỊCH BẢN GỐC TRONG TÀI LIỆU (có thể thiếu): ${narration}`,
    row?.data.sources && `NGUỒN: ${row.data.sources}`,
  ].filter(Boolean).join("\n\n").slice(0, SOURCE_CAP);
  const outline: OutlineDoc = {
    title: v.title,
    objectives: [],
    items: scenes.length
      ? scenes.map((s) => ({ heading: s.title, points: [s.visual, ...s.onscreen].filter(Boolean), level: 2 }))
      : [{ heading: v.title, points: [v.contextSummary ?? v.reason].filter(Boolean), level: 2 }],
    raw: "",
  };
  const target = scenes.length ? Math.max(...scenes.map((s) => s.scriptEnd)) : 120;
  return { p, fileId: file.id, outline, input: { ...parseOpts(p, file.level), fileName: v.fileName, targetSeconds: target || 120, sourceText } };
}

function saveRewritten(p: Project, key: string, video: Video, fileId: string) {
  if (video.key !== key) throw new Error(`Mã video viết lại (${video.key}) khác ${key}`);
  saveParsedVideo(p, video, fileId);
  setVideoFlags(p.id, key, { include: true, approved: false });
  return { key, scenes: video.scenes.length };
}

/** Job "ai-script" với payload {planKey}: Claude API viết lại kịch bản theo kế hoạch (aiWritten → phải duyệt). */
export async function rewriteFromPlan(pid: string, key: string) {
  const r = await rewriteInput(pid, key);
  return saveRewritten(r.p, key, await writeScript(r.outline, r.input), r.fileId);
}

/** Prompt viết lại kịch bản (Claude Code: `pnpm cvs prompt write-script`). */
export async function rewritePrompt(pid: string, key: string): Promise<Prompt> {
  const r = await rewriteInput(pid, key);
  return writeScriptPrompt(r.outline, r.input);
}

/** Claude Code gửi kịch bản viết lại (`pnpm cvs set-script`). */
export async function saveScriptReply(pid: string, key: string, reply: AiScript): Promise<{ ok: boolean; errors: string[]; key?: string; scenes?: number }> {
  const errors = scriptErrors(reply);
  if (errors.length) return { ok: false, errors };
  const r = await rewriteInput(pid, key);
  return { ok: true, errors: [], ...saveRewritten(r.p, key, scriptFromReply(reply, r.input), r.fileId) };
}

/** Làm theo script: video bóc lại từ tài liệu; kế hoạch có cảnh đã sửa → thay cảnh (lời thoại nguyên văn); gắn gợi ý hình + tóm tắt bài. */
function followScript(d: Doc, v: PlanVideo, index: number) {
  const parsed = d.parsed.find((x) => x.key === v.key);
  let video: Video;
  if (v.scenes?.length) {
    let t = 0;
    const scenes = v.scenes.map((s) => {
      const start = s.start ?? t;
      const end = s.end !== undefined && s.end > start ? s.end : start + 20;
      t = end;
      return { scriptStart: start, scriptEnd: end, title: s.title, visual: s.visual ?? "", onscreen: s.onscreen ?? [], vo: s.vo };
    });
    video = buildVideo({ fileName: v.fileName, title: v.title || parsed?.title || "", scenes, sources: parsed?.sources, context: parsed?.context }, parseOpts(d.p, d.file.level), index);
  } else if (parsed) video = { ...parsed, title: v.title || parsed.title };
  else throw new Error(`Không bóc được video ${v.fileName} và kế hoạch không có cảnh – chọn "Để Claude viết lại script"`);
  for (const n of v.visualNotes ?? []) {
    const sc = video.scenes.find((s) => s.id === n.scene);
    if (sc && n.template) sc.hint = `${n.template}${n.note ? ` – ${n.note}` : ""}`;
  }
  if (v.contextSummary) video.context = `TÓM TẮT BÀI (Claude): ${v.contextSummary}\n${video.context ?? ""}`.trim();
  saveParsedVideo(d.p, video, d.file.id);
  setVideoFlags(d.p.id, video.key, { include: true });
}

/**
 * Áp dụng kế hoạch: video có sẵn → làm theo script (mặc định) hoặc viết lại; video đề xuất chỉ làm khi bật (include).
 * Viết lại: có Claude API → job "ai-script"; không → yêu cầu "write-script" cho Claude Code.
 */
export async function applyDocPlan(pid: string, fileId: string, choices: PlanChoice[]) {
  if (!Array.isArray(choices)) throw new Error('"choices" phải là mảng');
  const d = await loadDoc(pid, fileId);
  const plan = (d.file.summary as { plan?: StoredPlan } | null)?.plan;
  if (!plan) throw new Error("Tài liệu chưa được phân tích");
  const out = { followed: [] as string[], rewrite: [] as string[], skipped: [] as string[], jobs: [] as number[], requests: [] as number[] };
  const all = [...plan.videos, ...plan.proposed];
  for (const [i, v] of all.entries()) {
    const key = v.key!;
    const c = choices.find((x) => x?.key === key);
    if (c?.mode !== undefined && c.mode !== "follow-script" && c.mode !== "rewrite") throw new Error(`Cách làm của ${key} phải là follow-script | rewrite`);
    const include = v.proposed ? c?.include === true : c?.include !== false;
    if (!include) {
      if (getVideo(pid, key)) setVideoFlags(pid, key, { include: false });
      out.skipped.push(key);
      continue;
    }
    const mode: PlanMode = v.proposed ? "rewrite" : (c?.mode ?? v.suggestedMode);
    if (mode === "follow-script") {
      followScript(d, v, i);
      out.followed.push(key);
      continue;
    }
    out.rewrite.push(key);
    if (aiAvailable()) {
      const busy = activeJobFor(pid, key);
      out.jobs.push((busy?.kind === "ai-script" ? busy : enqueueJob(pid, "ai-script", key, { planKey: key })).id);
    }
    else out.requests.push(addClaudeRequest({ projectId: pid, videoKey: key, kind: "write-script" }).id);
  }
  updateFileSummary(pid, fileId, { ...(d.file.summary as object), applied: { at: new Date().toISOString(), choices } });
  return out;
}
