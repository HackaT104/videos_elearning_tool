// Phụ đề nhiều ngôn ngữ (dịch bằng Claude – API hoặc Claude Code), WebVTT theo ngôn ngữ, và phụ đề/logo mặc định cho dự án mới.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildVtt, isSubLang, normalizeLogo, normalizeSubtitle, numbersMatch, resolveOverlay, subText, writeJsonAtomic, type Video } from "@cvs/core";
import { aiAvailable, translateSubs, type SubItem } from "@cvs/ai";
import { getProject, getVideo, listVideos, paths, STORAGE, updateProject, upsertVideo } from "@cvs/db";
import { ASSET_ID_RE } from "@cvs/engine";
import { currentTiming, Stopped, type Ctx } from "./pipeline";

/** Phụ đề WebVTT của một video theo ngôn ngữ (mặc định tiếng Việt), kèm vị trí theo cài đặt phụ đề. */
export function videoVtt(projectId: string, video: Video, lang = "vi"): string {
  return buildVtt(video, currentTiming(projectId, video), lang, resolveOverlay(getProject(projectId)?.settings, video).subtitle);
}

/** Các câu của video để dịch: id = sN#idx. */
export const subItems = (video: Video): SubItem[] => video.scenes.flatMap((s) => s.sentences.map((x, i) => ({ id: `${s.id}#${i}`, text: x.text.trim() }))).filter((x) => x.text);

/** Số câu còn thiếu bản dịch theo ngôn ngữ. */
export function missingSubs(video: Video, lang: string): number {
  return lang === "vi" ? 0 : video.scenes.reduce((n, s) => n + s.sentences.filter((x) => x.text.trim() && !subText(x, lang)).length, 0);
}

export type SubsResult = { ok: boolean; errors: string[]; warnings: string[]; saved: number };

/**
 * Ghi bản dịch phụ đề {id, text} (text rỗng = xoá). by "ai"/"claude-code": số phải khớp lời thoại gốc (lỗi);
 * người dùng sửa tay: chỉ cảnh báo.
 */
export function setSubs(projectId: string, key: string, lang: unknown, items: unknown, by: "user" | "ai" | "claude-code" = "user"): SubsResult {
  const res: SubsResult = { ok: false, errors: [], warnings: [], saved: 0 };
  if (!isSubLang(lang) || lang === "vi") return { ...res, errors: ['"lang" phải là mã ngôn ngữ phụ đề (en, ja, ko, zh, fr, de, es, th) – tiếng Việt lấy từ lời thoại'] };
  if (!Array.isArray(items) || !items.length || items.length > 2000) return { ...res, errors: ['Cần mảng "translations" [{id, text}] (1–2000 mục)'] };
  const row = getVideo(projectId, key);
  if (!row) return { ...res, errors: ["Không tìm thấy video"] };
  const v = row.data;
  const todo: { x: Video["scenes"][number]["sentences"][number]; text: string }[] = [];
  for (const it of items as { id?: unknown; text?: unknown }[]) {
    const m = typeof it?.id === "string" ? /^(s\d+)#(\d+)$/.exec(it.id) : null;
    const x = m ? v.scenes.find((s) => s.id === m[1])?.sentences[Number(m[2])] : undefined;
    if (!x) {
      res.errors.push(`Không có câu "${String(it?.id)}" (id dạng sN#idx)`);
      continue;
    }
    if (typeof it.text !== "string" || it.text.length > 600) {
      res.errors.push(`${it.id}: "text" phải là chuỗi ≤ 600 ký tự`);
      continue;
    }
    const text = it.text.replace(/\s+/g, " ").trim();
    if (text && !numbersMatch(x.text, text)) (by === "user" ? res.warnings : res.errors).push(`${it.id}: số trong bản dịch khác lời thoại gốc`);
    todo.push({ x, text });
  }
  if (res.errors.length) return res;
  for (const { x, text } of todo) {
    const subs = { ...(x.subs ?? {}) };
    if (text) subs[lang] = text;
    else delete subs[lang];
    if (Object.keys(subs).length) x.subs = subs;
    else delete x.subs;
  }
  upsertVideo(projectId, v);
  // ngôn ngữ mới → thêm vào danh sách phụ đề của dự án
  const p = getProject(projectId);
  const sub = normalizeSubtitle(p?.settings.subtitle);
  if (p && !sub.languages.includes(lang)) updateProject(projectId, { settings: { subtitle: normalizeSubtitle({ ...sub, languages: [...sub.languages, lang] }) } });
  return { ...res, ok: true, saved: todo.length };
}

/** Câu đã dịch ở video khác của dự án (giữ thuật ngữ thống nhất). */
function memoryFor(projectId: string, lang: string, except: string) {
  const out: { text: string; tr: string }[] = [];
  for (const r of listVideos(projectId)) if (r.key !== except) for (const s of r.data.scenes) for (const x of s.sentences) if (x.subs?.[lang]) out.push({ text: x.text, tr: x.subs[lang] });
  return out.slice(0, 40);
}

/** Đầu vào dịch (prompt Claude Code và job API dùng chung): câu còn thiếu bản dịch, hoặc mọi câu khi all. */
export function translateInput(projectId: string, key: string, lang: string, all = false) {
  const v = getVideo(projectId, key)?.data;
  if (!v) throw new Error("Không tìm thấy video");
  if (!isSubLang(lang) || lang === "vi") throw new Error("Cần mã ngôn ngữ đích (--lang en | ja | ko | zh | fr | de | es | th)");
  const items = subItems(v).filter((it) => all || !subText(sentenceOf(v, it.id)!, lang));
  return { video: v, items, context: `${v.title}. ${v.context ?? ""}`, memory: memoryFor(projectId, lang, key) };
}
const sentenceOf = (v: Video, id: string) => {
  const [sid, i] = id.split("#");
  return v.scenes.find((s) => s.id === sid)?.sentences[Number(i)];
};

/** Job "translate-subs": Claude API dịch các câu còn thiếu của một video (hoặc mọi video) sang ngôn ngữ lang. */
export async function aiTranslateSubs(ctx: Ctx, key: string | null, lang: string, all = false): Promise<{ videos: number; saved: number }> {
  if (!aiAvailable()) throw new Error('Chưa đăng nhập Claude – vào mục Claude AI để đăng nhập, hoặc dùng "Gửi cho Claude Code".');
  const keys = key ? [key] : listVideos(ctx.projectId).filter((v) => v.include && !v.existing).map((v) => v.key);
  let saved = 0;
  for (const [i, k] of keys.entries()) {
    if (ctx.shouldStop()) throw new Stopped();
    const inp = translateInput(ctx.projectId, k, lang, all);
    if (!inp.items.length) continue;
    ctx.progress("normalize", (i / keys.length) * 100, `Claude dịch ${k} (${i + 1}/${keys.length})`);
    const tr = await translateSubs(inp.items, lang, inp.context, inp.memory, (d, t) => ctx.progress("normalize", ((i + d / t) / keys.length) * 100, `Claude dịch ${k}: ${d}/${t} câu`));
    // chỉ ghi câu có lời thoại không đổi trong lúc Claude dịch
    const fresh = getVideo(ctx.projectId, k)!.data;
    const ok = tr.filter((t) => sentenceOf(fresh, t.id)?.text.trim() === inp.items.find((x) => x.id === t.id)?.text);
    if (!ok.length) continue;
    const r = setSubs(ctx.projectId, k, lang, ok, "ai");
    if (!r.ok) throw new Error(r.errors.join("; "));
    saved += r.saved;
  }
  ctx.progress("normalize", 100, `${saved} câu đã dịch`);
  return { videos: keys.length, saved };
}

// ---------- phụ đề/logo mặc định cho mọi dự án ----------

const DEF_FILE = () => join(STORAGE, "overlay-defaults.json");
const DEF_DIR = () => join(STORAGE, "overlay-defaults");

export function overlayDefaults(): { subtitle?: unknown; logo?: unknown } | null {
  try {
    return JSON.parse(readFileSync(DEF_FILE(), "utf8"));
  } catch {
    return null;
  }
}

/** "Dùng cho mọi dự án": lưu phụ đề + logo (kèm file ảnh) của dự án làm mặc định; on=false → bỏ mặc định. */
export function saveOverlayDefaults(projectId: string, on = true) {
  if (!on) {
    rmSync(DEF_FILE(), { force: true });
    rmSync(DEF_DIR(), { recursive: true, force: true });
    return null;
  }
  const p = getProject(projectId);
  if (!p) throw new Error("Không tìm thấy dự án");
  const o = resolveOverlay(p.settings);
  rmSync(DEF_DIR(), { recursive: true, force: true });
  if (o.logo.assetId) {
    const src = join(paths.assets(projectId), o.logo.assetId);
    if (!existsSync(src)) throw new Error("Không còn file logo của dự án – tải lại logo");
    mkdirSync(DEF_DIR(), { recursive: true });
    copyFileSync(src, join(DEF_DIR(), o.logo.assetId));
    if (existsSync(`${src}.json`)) copyFileSync(`${src}.json`, join(DEF_DIR(), `${o.logo.assetId}.json`));
  }
  const d = { subtitle: o.subtitle, logo: o.logo };
  writeJsonAtomic(DEF_FILE(), d);
  return d;
}

/** Dự án mới nhận phụ đề + logo mặc định (chép file logo vào ảnh của dự án). */
export function applyOverlayDefaults(projectId: string) {
  const d = overlayDefaults();
  if (!d) return;
  const logo = normalizeLogo(d.logo);
  if (logo.assetId && ASSET_ID_RE.test(logo.assetId) && existsSync(join(DEF_DIR(), logo.assetId))) {
    mkdirSync(paths.assets(projectId), { recursive: true });
    copyFileSync(join(DEF_DIR(), logo.assetId), join(paths.assets(projectId), logo.assetId));
    if (existsSync(join(DEF_DIR(), `${logo.assetId}.json`))) copyFileSync(join(DEF_DIR(), `${logo.assetId}.json`), join(paths.assets(projectId), `${logo.assetId}.json`));
  } else delete logo.assetId;
  updateProject(projectId, { settings: { subtitle: normalizeSubtitle(d.subtitle), logo } });
}
