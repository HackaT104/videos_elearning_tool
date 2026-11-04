// Phong cách tuỳ chỉnh: lưu theo dự án (projects/<pid>/themes) và thư viện chung (storage/themes), tư liệu tham chiếu
// (ảnh của dự án, video mẫu + khung trích bằng ffmpeg) và việc "Tạo phong cách bằng AI" – đường Claude API (job "style-gen")
// và Claude Code (`pnpm cvs style-refs | prompt style-gen | set-theme`) dùng chung prompt và bộ kiểm.

import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { writeJsonAtomic, type StyleId, type Video } from "@cvs/core";
import { generateStyle, styleGenErrors, styleGenPrompt, type Prompt, type StyleGenInput, type StyleGenReply } from "@cvs/ai";
import { getProject, getVideo, listVideos, paths, STORAGE } from "@cvs/db";
import { parseAssetId } from "@cvs/engine";
import {
  buildCustomTheme, filmStyleBrief, forgetCustomTheme, getFilmStyle, getTheme, isCustomThemeId, makeCustomThemeId, registerCustomTheme, setCustomThemeResolver, THEME_IDS, themeToDraft,
  type CustomThemeId, type Theme, type ThemeAdjustment, type ThemeDraft,
} from "@cvs/themes";
import { ffmpeg, probe, run, FFMPEG } from "@cvs/tts";
import { assetFile } from "./assets";
import { listStylePreviews, representativeScene, stylePreview } from "./extras";
import { MAX_STYLE_DOCS, styleDoc, type StyleDoc } from "./style-docs";

export type CustomThemeRecord = {
  id: CustomThemeId;
  theme: Theme;
  draft: ThemeDraft;
  rationale: string;
  closest: string;
  adjustments: ThemeAdjustment[];
  prompt: string;
  by: "ai" | "claude-code" | "user";
  /** Phong cách gốc khi chỉnh tiếp bằng lời. */
  base: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------- lưu trữ phong cách ----------

const readRecord = (file: string): CustomThemeRecord | null => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CustomThemeRecord;
  } catch {
    return null;
  }
};
const projectFile = (pid: string, id: string) => join(paths.themes(pid), `${id}.json`);
const libraryFile = (id: string) => join(paths.themeLibrary(), `${id}.json`);
const listDir = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => isCustomThemeId(f.replace(/\.json$/, "")) && f.endsWith(".json")).map((f) => readRecord(join(dir, f))).filter((r): r is CustomThemeRecord => !!r) : []);

/** Tìm phong cách theo mã trong thư viện rồi mọi dự án (mã có hậu tố ngẫu nhiên → không trùng giữa dự án). */
function findRecord(id: string): CustomThemeRecord | null {
  if (!isCustomThemeId(id)) return null;
  if (existsSync(libraryFile(id))) return readRecord(libraryFile(id));
  const root = join(STORAGE, "projects");
  if (!existsSync(root)) return null;
  for (const pid of readdirSync(root)) if (existsSync(projectFile(pid, id))) return readRecord(projectFile(pid, id));
  return null;
}
// getTheme() ở cả hai bộ dựng (cùng tiến trình worker) tra phong cách tuỳ chỉnh qua đây
setCustomThemeResolver((id) => findRecord(id)?.theme);

export const projectThemeIds = (pid: string): StyleId[] => listDir(paths.themes(pid)).map((r) => r.id);
export const getProjectTheme = (pid: string, id: string): CustomThemeRecord | null => (isCustomThemeId(id) && existsSync(projectFile(pid, id)) ? readRecord(projectFile(pid, id)) : null);

/** Phong cách của dự án (mới trước) + thư viện chung (chưa có trong dự án). */
export function listCustomThemes(pid: string): { project: CustomThemeRecord[]; library: (CustomThemeRecord & { inLibrary: true })[]; libraryIds: string[] } {
  const project = listDir(paths.themes(pid)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lib = listDir(paths.themeLibrary());
  const own = new Set(project.map((r) => r.id));
  return { project, library: lib.filter((r) => !own.has(r.id)).map((r) => ({ ...r, inLibrary: true as const })), libraryIds: lib.map((r) => r.id) };
}

function writeRecord(pid: string, r: CustomThemeRecord) {
  mkdirSync(paths.themes(pid), { recursive: true });
  writeJsonAtomic(projectFile(pid, r.id), r);
  if (existsSync(libraryFile(r.id))) writeJsonAtomic(libraryFile(r.id), r); // đã lưu vào thư viện → cập nhật cùng
  registerCustomTheme(r.theme);
}

/** Lưu câu trả lời tạo phong cách (AI hoặc Claude Code) sau khi kiểm – lỗi cứng → {ok:false}. Mỗi lần tạo một mã mới. */
export function saveThemeReply(pid: string, reply: unknown, by: CustomThemeRecord["by"]): { ok: boolean; errors: string[]; record?: CustomThemeRecord } {
  const errors = styleGenErrors(reply);
  if (errors.length) return { ok: false, errors };
  const r = reply as StyleGenReply;
  const brief = loadBrief(pid);
  const id = makeCustomThemeId(String(r.theme.name), randomBytes(3).toString("hex"));
  const b = buildCustomTheme(r.theme, id);
  if (!b.theme) return { ok: false, errors: b.errors };
  const at = new Date().toISOString();
  const record: CustomThemeRecord = { id, theme: b.theme, draft: b.draft!, rationale: r.rationale.trim().slice(0, 1200), closest: r.closest, adjustments: b.adjustments, prompt: brief?.prompt ?? "", by, base: brief?.base ?? null, createdAt: at, updatedAt: at };
  writeRecord(pid, record);
  if (brief) saveBrief(pid, { ...brief, last: id });
  return { ok: true, errors: [], record };
}

/** Chỉnh tay màu chính / cặp phông / tên – kiểm lại như AI (tương phản tự chỉnh). */
export function tweakCustomTheme(pid: string, id: string, patch: { colors?: Record<string, unknown>; fontPair?: unknown; name?: unknown }): { ok: boolean; errors: string[]; record?: CustomThemeRecord } {
  const cur = getProjectTheme(pid, id);
  if (!cur) return { ok: false, errors: ["Không tìm thấy phong cách tuỳ chỉnh trong dự án"] };
  if (patch.colors !== undefined && (!patch.colors || typeof patch.colors !== "object" || Array.isArray(patch.colors))) return { ok: false, errors: ['"colors" phải là đối tượng màu'] };
  const draft = { ...cur.draft, colors: { ...cur.draft.colors, ...(patch.colors ?? {}) }, ...(patch.fontPair !== undefined ? { fontPair: patch.fontPair } : {}), ...(patch.name !== undefined ? { name: patch.name } : {}) };
  const b = buildCustomTheme(draft, cur.id);
  if (!b.theme) return { ok: false, errors: b.errors };
  const record: CustomThemeRecord = { ...cur, theme: b.theme, draft: b.draft!, adjustments: b.adjustments, by: "user", updatedAt: new Date().toISOString() };
  writeRecord(pid, record);
  return { ok: true, errors: [], record };
}

export function saveThemeToLibrary(pid: string, id: string): CustomThemeRecord {
  const r = getProjectTheme(pid, id);
  if (!r) throw new Error("Không tìm thấy phong cách tuỳ chỉnh trong dự án");
  mkdirSync(paths.themeLibrary(), { recursive: true });
  writeJsonAtomic(libraryFile(id), r);
  return r;
}

/** Phong cách từ thư viện được chọn cho dự án → chép vào dự án (xoá khỏi thư viện sau này không làm hỏng video). */
export function ensureProjectTheme(pid: string, id: string) {
  if (!isCustomThemeId(id) || existsSync(projectFile(pid, id))) return;
  const r = existsSync(libraryFile(id)) ? readRecord(libraryFile(id)) : null;
  if (!r) throw new Error(`Không có phong cách "${id}"`);
  writeRecord(pid, r);
}

/** Xoá khỏi dự án (từ chối khi dự án/video còn dùng) hoặc khỏi thư viện. */
export function deleteCustomTheme(pid: string, id: string, from: "project" | "library"): { ok: boolean; error?: string } {
  if (!isCustomThemeId(id)) return { ok: false, error: "Mã phong cách không hợp lệ" };
  if (from === "library") {
    if (!existsSync(libraryFile(id))) return { ok: false, error: "Không có trong thư viện" };
    rmSync(libraryFile(id), { force: true });
    return { ok: true };
  }
  if (!existsSync(projectFile(pid, id))) return { ok: false, error: "Không có trong dự án" };
  const p = getProject(pid);
  const used = [...(p?.settings.style === id ? ["cả dự án"] : []), ...listVideos(pid).filter((v) => v.data.style === id).map((v) => v.key)];
  if (used.length) return { ok: false, error: `Phong cách đang được dùng (${used.slice(0, 5).join(", ")}) – chọn phong cách khác trước khi xoá` };
  rmSync(projectFile(pid, id), { force: true });
  forgetCustomTheme(id);
  const styles = join(paths.project(pid), "styles");
  if (existsSync(styles)) for (const k of readdirSync(styles)) rmSync(join(styles, k, `${id}.png`), { force: true });
  return { ok: true };
}

// ---------- tư liệu tham chiếu ----------

export type StyleBrief = { prompt: string; images: string[]; video: string | null; docs?: string[]; preset?: string | null; base: string | null; at: string; last?: string };
export const MAX_REF_IMAGES = 6;
export const MAX_REF_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_EXT = [".mp4", ".mov", ".webm"];
const VID_RE = /^[a-f0-9]{16}$/;
const briefFile = (pid: string) => join(paths.styleRefs(pid), "brief.json");
const videoDir = (pid: string) => join(paths.styleRefs(pid), "videos");

export function loadBrief(pid: string): StyleBrief | null {
  try {
    return JSON.parse(readFileSync(briefFile(pid), "utf8")) as StyleBrief;
  } catch {
    return null;
  }
}
function saveBrief(pid: string, b: StyleBrief) {
  mkdirSync(paths.styleRefs(pid), { recursive: true });
  writeJsonAtomic(briefFile(pid), b);
}

/** Kiểm + lưu đề bài: mô tả ≤ 2000 ký tự, ≤ 6 ảnh jpg/png/webp của dự án, video mẫu đã tải, phong cách gốc (tuỳ chọn). */
export function setStyleBrief(pid: string, input: { prompt?: unknown; images?: unknown; video?: unknown; docs?: unknown; preset?: unknown; base?: unknown }): StyleBrief {
  const prompt = typeof input.prompt === "string" ? input.prompt.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() : "";
  if (prompt.length > 2000) throw new Error("Mô tả dài quá 2000 ký tự");
  const images = Array.isArray(input.images) ? [...new Set(input.images.map(String))] : [];
  if (images.length > MAX_REF_IMAGES) throw new Error(`Tối đa ${MAX_REF_IMAGES} ảnh tham chiếu`);
  for (const id of images) {
    const meta = parseAssetId(id);
    if (!meta || !assetFile(pid, id)) throw new Error(`Không có ảnh ${id} trong dự án`);
    if (!["png", "jpg", "webp"].includes(meta.ext)) throw new Error("Ảnh tham chiếu chỉ nhận JPG, PNG hoặc WebP");
  }
  const video = input.video ? String(input.video) : null;
  if (video && !styleVideo(pid, video)) throw new Error("Không có video tham chiếu này");
  const docs = Array.isArray(input.docs) ? [...new Set(input.docs.map(String))] : [];
  if (docs.length > MAX_STYLE_DOCS) throw new Error(`Tối đa ${MAX_STYLE_DOCS} tài liệu phong cách`);
  for (const d of docs) if (!styleDoc(pid, d)) throw new Error("Không có tài liệu phong cách này – tải lại tài liệu");
  const pdfBytes = docs.flatMap((d) => styleDoc(pid, d)!.pdfs).reduce((n, f) => n + f.size, 0);
  if (pdfBytes > 25 * 1024 * 1024) throw new Error("Tổng PDF quá lớn để gửi cho Claude (tối đa 25 MB) – bỏ bớt tài liệu");
  const preset = input.preset ? String(input.preset) : null;
  if (preset && !getFilmStyle(preset)) throw new Error("Không có phong cách phim mẫu này");
  const base = input.base ? String(input.base) : null;
  if (base && !getProjectTheme(pid, base) && !THEME_IDS.includes(base as never)) throw new Error("Phong cách gốc không có");
  if (!prompt && !images.length && !video && !docs.length && !preset) throw new Error("Cần mô tả phong cách, một phong cách phim mẫu, hoặc ít nhất một ảnh / video / tài liệu tham chiếu");
  const b: StyleBrief = { prompt, images, video, docs, preset, base, at: new Date().toISOString(), last: loadBrief(pid)?.last };
  saveBrief(pid, b);
  return b;
}

export type StyleVideo = { id: string; name: string; duration: number; size: number; frames: { file: string; t: number }[]; created: string };

export function styleVideo(pid: string, id: string): StyleVideo | null {
  if (!VID_RE.test(id)) return null;
  try {
    return JSON.parse(readFileSync(join(videoDir(pid), `${id}.json`), "utf8")) as StyleVideo;
  } catch {
    return null;
  }
}
export function listStyleVideos(pid: string): StyleVideo[] {
  const d = videoDir(pid);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => styleVideo(pid, f.slice(0, -5))).filter((v): v is StyleVideo => !!v).sort((a, b) => b.created.localeCompare(a.created));
}
export function deleteStyleVideo(pid: string, id: string): boolean {
  const v = styleVideo(pid, id);
  if (!v) return false;
  const d = videoDir(pid);
  for (const f of readdirSync(d)) if (f.startsWith(id)) rmSync(join(d, f), { recursive: true, force: true });
  return true;
}

/** Lưu video mẫu (luồng – không giữ cả file trong bộ nhớ), kiểm bằng ffprobe, trích khung. Trùng nội dung → cùng mã. */
export async function saveStyleVideo(pid: string, name: string, body: AsyncIterable<Uint8Array>): Promise<StyleVideo> {
  const ext = extname(name).toLowerCase();
  if (!VIDEO_EXT.includes(ext)) throw new StyleRefError("Video tham chiếu chỉ nhận MP4, MOV hoặc WebM");
  const d = videoDir(pid);
  mkdirSync(d, { recursive: true });
  const tmp = join(d, `.tai-${randomBytes(4).toString("hex")}${ext}`);
  const hash = createHash("sha256");
  let size = 0;
  try {
    const out = createWriteStream(tmp);
    let werr: Error | null = null;
    out.on("error", (e) => (werr = e)); // lỗi ghi đĩa: báo lỗi, không làm sập worker
    try {
      for await (const chunk of body) {
        size += chunk.length;
        if (size > MAX_REF_VIDEO_BYTES) throw new StyleRefError("Video quá lớn (tối đa 200 MB)");
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise<void>((r) => (out.once("drain", () => r()), out.once("error", () => r())));
        if (werr) break;
      }
    } finally {
      await new Promise<void>((r) => (werr ? r() : out.end(r)));
    }
    if (werr) throw new StyleRefError(`Không ghi được video: ${(werr as Error).message}`);
    if (!size) throw new StyleRefError("File rỗng");
    const info = await probe(tmp).catch(() => null);
    const v = info?.streams.find((s) => s.codec_type === "video");
    if (!info || !v || !(info.duration > 0)) throw new StyleRefError("Không đọc được video (cần MP4/MOV/WebM có hình)");
    const id = hash.digest("hex").slice(0, 16);
    const file = join(d, `${id}${ext}`);
    if (styleVideo(pid, id)) return styleVideo(pid, id)!;
    renameSync(tmp, file);
    const frames = await extractFrames(file, join(d, id), info.duration);
    const rec: StyleVideo = { id, name: name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120), duration: Math.round(info.duration * 10) / 10, size, frames, created: new Date().toISOString() };
    writeJsonAtomic(join(d, `${id}.json`), rec);
    return rec;
  } finally {
    rmSync(tmp, { force: true });
  }
}
export class StyleRefError extends Error {}

/** Mốc lấy khung: các lần chuyển cảnh (ffmpeg scene) trải đều, bù bằng mốc chia đều – n mốc, cách nhau ≥ d/(2n). */
export function pickFrameTimes(duration: number, cuts: number[], n: number): number[] {
  const gap = duration / (2 * n);
  const inside = cuts.map((t) => Math.min(t + 0.3, duration - 0.05)).filter((t) => t > 0.2 && t < duration - 0.1);
  const picked: number[] = [];
  const add = (t: number) => {
    if (picked.length < n && picked.every((p) => Math.abs(p - t) >= gap)) picked.push(t);
  };
  if (inside.length > n) for (let k = 0; k < n; k++) add(inside[Math.floor(((k + 0.5) * inside.length) / n)]);
  else inside.forEach(add);
  for (let k = 0; k < n && picked.length < n; k++) add((duration * (k + 0.5)) / n);
  return picked.sort((a, b) => a - b).map((t) => Math.round(t * 100) / 100);
}

/** 6–8 khung đại diện, rộng 960 px (JPEG). Dò chuyển cảnh trên bản thu nhỏ (10 phút đầu). */
export async function extractFrames(file: string, outDir: string, duration: number): Promise<{ file: string; t: number }[]> {
  const n = duration >= 8 ? 8 : 6;
  const r = await run(FFMPEG, ["-hide_banner", "-nostdin", "-t", "600", "-i", file, "-an", "-vf", "fps=5,scale=256:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-"]);
  const cuts = [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const out: { file: string; t: number }[] = [];
  for (const [i, t] of pickFrameTimes(duration, cuts, n).entries()) {
    const f = join(outDir, `khung-${String(i + 1).padStart(2, "0")}.jpg`);
    await ffmpeg(["-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "3", f]).catch(() => null);
    if (existsSync(f) && statSync(f).size > 0) out.push({ file: f, t });
  }
  if (!out.length) throw new StyleRefError("Không trích được khung hình nào từ video");
  return out;
}

/** Ảnh tham chiếu thu nhỏ (cạnh dài ≤ 1280, JPEG) cho Claude – ảnh gốc tới 10 MB vượt giới hạn ảnh của API. */
async function refImage(pid: string, id: string): Promise<string> {
  const src = assetFile(pid, id)!;
  const out = join(paths.styleRefs(pid), "img", `${id}.jpg`);
  if (existsSync(out)) return out;
  mkdirSync(join(paths.styleRefs(pid), "img"), { recursive: true });
  try {
    await ffmpeg(["-i", src, "-frames:v", "1", "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease", "-q:v", "3", out]);
    return out;
  } catch {
    return src; // ffmpeg không đọc được (WebP lạ…) → gửi ảnh gốc
  }
}

export type StyleRefs = {
  prompt: string; base: string | null; images: { id: string; name: string; file: string }[]; video: { id: string; name: string; frames: { file: string; t: number }[] } | null;
  docs: Pick<StyleDoc, "id" | "name" | "kind" | "images" | "pdfs" | "notes">[];
  preset: { slug: string; name: string } | null;
};

export async function styleRefs(pid: string): Promise<StyleRefs> {
  const b = loadBrief(pid);
  if (!b) throw new Error("Chưa có đề bài tạo phong cách – mở bước Phong cách, mục Tạo phong cách bằng AI");
  const images = [];
  for (const id of b.images) if (assetFile(pid, id)) images.push({ id, name: readName(pid, id), file: await refImage(pid, id) });
  const v = b.video ? styleVideo(pid, b.video) : null;
  const docs = (b.docs ?? []).map((d) => styleDoc(pid, d)).filter((d): d is StyleDoc => !!d).map(({ id, name, kind, images, pdfs, notes }) => ({ id, name, kind, images, pdfs, notes }));
  const fs = b.preset ? getFilmStyle(b.preset) : null;
  return { prompt: b.prompt, base: b.base, images, video: v ? { id: v.id, name: v.name, frames: v.frames } : null, docs, preset: fs ? { slug: fs.slug, name: fs.en } : null };
}
const readName = (pid: string, id: string) => {
  try {
    return JSON.parse(readFileSync(`${assetFile(pid, id)}.json`, "utf8")).name ?? id;
  } catch {
    return id;
  }
};

// ---------- đề bài cho Claude ----------

/** Video dùng để dựng ảnh mẫu phong cách (cùng bộ ảnh mẫu hiện có nếu đã dựng). */
export function previewKey(pid: string): string | null {
  const k = listStylePreviews(pid)?.key;
  if (k && k !== "mau" && getVideo(pid, k)) return k;
  if (k === "mau") return null;
  return listVideos(pid).find((v) => v.include && !v.existing)?.key ?? null;
}

function styleInput(pid: string, refs: StyleRefs): StyleGenInput {
  const p = getProject(pid);
  if (!p) throw new Error("Không tìm thấy dự án");
  // chủ đề: video của bộ ảnh mẫu, hoặc video đầu tiên (bộ ảnh mẫu dựng từ khung mẫu chung)
  const key = previewKey(pid) ?? listVideos(pid).find((v) => v.include && !v.existing)?.key;
  const video: Video | undefined = key ? getVideo(pid, key)?.data : undefined;
  const sc = video ? representativeScene(video) : undefined;
  const baseRec = refs.base ? getProjectTheme(pid, refs.base) : null;
  const base = refs.base ? { id: refs.base, draft: baseRec?.draft ?? themeToDraft(getTheme(refs.base)) } : null;
  return {
    prompt: refs.prompt,
    subject: { project: p.name, course: p.course, videoTitle: video?.title, scene: sc ? { title: sc.title, visual: sc.visual, onscreen: sc.onscreen, text: sc.sentences.map((s) => s.text).join(" ") } : undefined },
    base,
    images: refs.images.length,
    frames: refs.video?.frames.length ?? 0,
    preset: refs.preset ? { name: refs.preset.name, text: filmStyleBrief(refs.preset.slug) ?? "" } : null,
    docs: refs.docs.map((d) => ({ name: d.name, kind: d.kind, images: d.images.length, pdfs: d.pdfs.map((f) => f.name), notes: d.notes })),
  };
}

/** Prompt đúng như đường API (Claude Code: `pnpm cvs prompt style-gen <pid>`). */
export async function styleGenPromptFor(pid: string): Promise<Prompt> {
  return styleGenPrompt(styleInput(pid, await styleRefs(pid)));
}

/** Job "style-gen" (Claude API): đề bài + ảnh → phong cách → lưu → dựng ảnh xem trước trên cảnh đại diện. */
export async function runStyleGen(pid: string, progress: (pct: number, message: string) => void) {
  const refs = await styleRefs(pid);
  const docImages = refs.docs.flatMap((d) => d.images);
  const pdfs = refs.docs.flatMap((d) => d.pdfs.map((f) => ({ file: f.file, label: `PDF «${f.name}» (tài liệu ${d.name})` })));
  progress(10, `Claude xem ${refs.images.length + docImages.length + (refs.video?.frames.length ?? 0)} ảnh${pdfs.length ? ` và ${pdfs.length} PDF` : ""} tham chiếu, dựng phong cách`);
  const images = [
    ...refs.images.map((x, i) => ({ file: x.file, label: `Ảnh tham chiếu ${i + 1}: ${x.name}` })),
    ...docImages,
    ...(refs.video?.frames ?? []).map((f, i) => ({ file: f.file, label: `Khung ${i + 1} của video mẫu «${refs.video!.name}» (giây ${f.t})` })),
  ];
  const reply = await generateStyle(styleInput(pid, refs), images, pdfs);
  const r = saveThemeReply(pid, reply, "ai");
  if (!r.ok) throw new Error(`Phong cách không hợp lệ: ${r.errors.join("; ")}`);
  progress(70, `Dựng ảnh xem trước «${r.record!.theme.name}»`);
  const shots = await stylePreview(pid, previewKey(pid), undefined, [r.record!.id]);
  return { id: r.record!.id, adjustments: r.record!.adjustments, preview: shots[0]?.file ?? null };
}
