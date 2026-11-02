// Xuất, dọn dẹp, nghe thử giọng, so sánh phong cách, viết kịch bản bằng AI, sửa cảnh theo ghi chú.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, isAbsolute, join, resolve, sep } from "node:path";
import { computeTiming, createNormalizer, levelFolder, makeSentences, type OutlineDoc, type StyleId, type Video, type VoiceConfig } from "@cvs/core";
import { aiAvailable, reviseScene, writeOutline, writeScript } from "@cvs/ai";
import { addFile, getProject, getVideo, glossaryFor, listVideos, paths, setVideoFlags, STORAGE, updateProject, upsertVideo, type ProjectSettings } from "@cvs/db";
import { effectiveDesign, qaTimes } from "@cvs/engine";
import { hfBuild, hfPreview, launchBrowser } from "@cvs/engine-hf";
import { THEME_IDS, THEMES } from "@cvs/themes";
import { CitClient, ensureZerottsRunning, mockGenerate, probe, synthesizeSample, ZerottsClient } from "@cvs/tts";
import { currentTiming, makeCustomScene, stepBuild, stepQa, type Ctx } from "./pipeline";

// ---------- Xuất ----------

export type ExportResult = { dir: string; files: string[]; skipped: { key: string; reason: string }[]; catalog: string };

/** Tên thư mục an toàn trên Windows/macOS/Linux (giữ dấu tiếng Việt). */
export const safeFolderName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 120) || "Du_an";

/** Kiểm tra thư mục đích người dùng chọn: đường dẫn tuyệt đối, là thư mục (hoặc tạo được), không nằm trong thư mục lưu trữ của ứng dụng. */
export function validateExportDir(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("Chưa chọn thư mục lưu");
  const raw = input.trim();
  if (!isAbsolute(raw)) throw new Error("Cần đường dẫn đầy đủ, ví dụ D:\\Video khoá học hoặc /home/ban/Video");
  const p = resolve(raw);
  const store = resolve(STORAGE);
  if (p === store || p.startsWith(store + sep) || store.startsWith(p + sep)) throw new Error("Chọn thư mục ngoài thư mục lưu trữ của ứng dụng (storage)");
  if (existsSync(p) && !statSync(p).isDirectory()) throw new Error("Đường dẫn này là một tệp, không phải thư mục");
  try {
    mkdirSync(p, { recursive: true });
  } catch (e) {
    throw new Error(`Không tạo được thư mục: ${(e as Error).message}`);
  }
  return p;
}

/** Phụ đề WebVTT của một video theo timing hiện tại. */
export function videoVtt(projectId: string, video: Video): string {
  const t = currentTiming(projectId, video);
  const ts = (s: number) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23);
  const lines = ["WEBVTT", ""];
  video.scenes.forEach((s, i) => {
    const st = t.scenes[i];
    s.sentences.forEach((x, k) => lines.push(`${ts(st.start + st.cues[k])} --> ${ts(st.start + (st.ends[k] ?? st.dur))}`, x.text, ""));
  });
  return lines.join("\n");
}

/**
 * Xuất video đã duyệt: mặc định vào storage/…/out; có `dest` → <dest>/<tên dự án>/Cap_do_N/ (nhớ thư mục cho lần sau).
 * `extras`: kèm phụ đề .vtt và lời thoại .txt cạnh mỗi MP4.
 */
export async function exportProject(projectId: string, opts: { onlyApproved?: boolean; dest?: string; extras?: boolean } = {}): Promise<ExportResult> {
  const project = getProject(projectId);
  if (!project) throw new Error("Không tìm thấy dự án");
  const dest = opts.dest !== undefined ? validateExportDir(opts.dest) : null;
  const outDir = dest ? join(dest, safeFolderName(project.name)) : paths.out(projectId);
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const skipped: ExportResult["skipped"] = [];
  const rows: string[] = ["Mã video\tThời lượng\tTiêu đề\tGiọng\tPhong cách\tBộ dựng\tCấp độ"];
  for (const v of listVideos(projectId)) {
    if (!v.include || v.existing) continue;
    const src = paths.render(projectId, v.key);
    if (!existsSync(src)) {
      skipped.push({ key: v.key, reason: "Chưa render" });
      continue;
    }
    const qa = v.qa as { ok?: boolean } | null;
    if ((opts.onlyApproved ?? true) && !v.approved) {
      skipped.push({ key: v.key, reason: qa?.ok ? "Chưa duyệt" : "QA chưa đạt / chưa duyệt" });
      continue;
    }
    const dir = join(outDir, levelFolder(v.level));
    mkdirSync(dir, { recursive: true });
    const dst = join(dir, `${v.key}.mp4`);
    copyFileSync(src, dst);
    files.push(dst);
    if (opts.extras) {
      writeFileSync(join(dir, `${v.key}.vtt`), videoVtt(projectId, v.data), "utf8");
      const script = v.data.scenes.map((s) => `[${s.id}] ${s.title}\r\n${s.sentences.map((x) => x.text).join(" ")}`).join("\r\n\r\n");
      writeFileSync(join(dir, `${v.key}.txt`), "\ufeff" + `${v.data.title}\r\n\r\n${script}\r\n`, "utf8");
    }
    const info = await probe(dst);
    const s = Math.round(info.duration);
    const voice = `${v.data.voice.provider.toUpperCase()} ${v.data.voice.voiceId} ×${v.data.voice.speed}`;
    rows.push([v.key, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, v.data.title, voice, THEMES[v.data.style as StyleId]?.name ?? v.data.style, v.data.engine, v.level].join("\t"));
  }
  // UTF-8 BOM + CRLF để mở đúng trên Windows (Notepad/Excel)
  const catalog = join(outDir, "DANH_MUC_VIDEO.txt");
  writeFileSync(catalog, "\ufeff" + rows.join("\r\n") + "\r\n", "utf8");
  updateProject(projectId, { settings: { ...(dest ? { exportDir: dest } : {}), lastExport: { dir: outDir, at: new Date().toISOString(), files: files.length } } });
  return { dir: outDir, files, skipped, catalog };
}

export function openFolder(dir: string) {
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [dir], { detached: true, stdio: "ignore", windowsHide: false }).on("error", () => undefined).unref();
}

// ---------- Chọn thư mục bằng hộp thoại của hệ điều hành (trên máy chạy worker) ----------

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Lệnh mở hộp chọn thư mục theo hệ điều hành; null = máy không có giao diện đồ hoạ / công cụ chọn. */
export function pickFolderCommand(platform: NodeJS.Platform = process.platform, env: Record<string, string | undefined> = process.env, has: (exe: string) => boolean = onPath, initial?: string, title = "Chọn nơi lưu dự án"): { cmd: string; args: string[] } | null {
  if (platform === "win32") {
    // cửa sổ chủ TopMost để hộp thoại hiện trước trình duyệt; -STA bắt buộc cho WinForms; mã hoá UTF-16 base64 → không lo ngoặc/dấu
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "$o = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0; StartPosition = 'CenterScreen' }",
      "$o.Show(); $o.Activate()",
      "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$d.Description = ${psQuote(title)}`,
      "$d.ShowNewFolderButton = $true",
      initial ? `$d.SelectedPath = ${psQuote(initial)}` : "",
      "$r = $d.ShowDialog($o); $o.Close()",
      "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath } else { exit 3 }",
    ].filter(Boolean).join("\n");
    return { cmd: "powershell.exe", args: ["-NoProfile", "-STA", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")] };
  }
  if (platform === "darwin") {
    const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const from = initial ? ` default location (POSIX file ${q(initial)})` : "";
    return { cmd: "osascript", args: ["-e", `POSIX path of (choose folder with prompt ${q(title)}${from})`] };
  }
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  if (has("zenity")) return { cmd: "zenity", args: ["--file-selection", "--directory", `--title=${title}`, ...(initial ? [`--filename=${initial.endsWith("/") ? initial : `${initial}/`}`] : [])] };
  if (has("kdialog")) return { cmd: "kdialog", args: ["--getexistingdirectory", initial || homedir(), "--title", title] };
  return null;
}

function onPath(exe: string): boolean {
  return (process.env.PATH ?? "").split(delimiter).some((d) => d && existsSync(join(d, exe)));
}

export class NoGuiError extends Error {}

/** Mở hộp chọn thư mục, chờ người dùng chọn. Không có giao diện → NoGuiError (giao diện web cho nhập đường dẫn). */
export function pickFolder(initial?: string, run: typeof spawn = spawn): Promise<{ path: string } | { cancelled: true }> {
  const c = pickFolderCommand(process.platform, process.env, onPath, initial && existsSync(initial) ? initial : undefined);
  if (!c) return Promise.reject(new NoGuiError("Máy chạy ứng dụng không mở được hộp chọn thư mục – hãy gõ đường dẫn thư mục"));
  return new Promise((res, rej) => {
    let out = "";
    let err = "";
    const p = run(c.cmd, c.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const t = setTimeout(() => p.kill(), 10 * 60_000);
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", (e) => (clearTimeout(t), rej(new NoGuiError(`Không mở được hộp chọn thư mục (${e.message}) – hãy gõ đường dẫn thư mục`))));
    p.on("close", (code) => {
      clearTimeout(t);
      const path = out.trim().split(/\r?\n/).pop()?.trim() ?? "";
      if (code === 0 && path) return res({ path: /[^:\\/][\\/]$/.test(path) ? path.slice(0, -1) : path });
      // huỷ: Windows mã 3, osascript -128, zenity/kdialog mã 1 không lỗi
      if (code === 3 || /-128/.test(err) || (code === 1 && !err.trim())) return res({ cancelled: true });
      rej(new NoGuiError(`Hộp chọn thư mục lỗi: ${err.trim() || `mã ${code}`} – hãy gõ đường dẫn thư mục`));
    });
  });
}

// ---------- Dọn dẹp (chuyển vào _luu_tru, không xóa hẳn) ----------

export type CleanupItem = { path: string; label: string; bytes: number };

function dirSize(p: string): number {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((s, f) => s + dirSize(join(p, f)), 0);
}

export function cleanupCandidates(projectId: string): CleanupItem[] {
  const items: CleanupItem[] = [];
  const root = paths.project(projectId);
  for (const v of listVideos(projectId)) {
    const vo = paths.vo(projectId, v.key);
    if (existsSync(join(vo, "raw"))) items.push({ path: join(vo, "raw"), label: `${v.key}: giọng thô (WAV) đã xử lý`, bytes: dirSize(join(vo, "raw")) });
    if (existsSync(vo)) {
      const manifest = existsSync(join(vo, "manifest.json")) ? JSON.parse(readFileSync(join(vo, "manifest.json"), "utf8")) : { scenes: {} };
      const used = new Set(Object.values(manifest.scenes as Record<string, { file: string }>).map((s) => s.file));
      for (const f of readdirSync(vo)) if (f.endsWith(".mp3") && !used.has(f)) items.push({ path: join(vo, f), label: `${v.key}: giọng cũ ${f}`, bytes: dirSize(join(vo, f)) });
    }
    const fr = paths.frames(projectId, v.key);
    if (existsSync(fr)) items.push({ path: fr, label: `${v.key}: bộ nhớ đệm xem trước`, bytes: dirSize(fr) });
    for (const eng of ["hf", "rmt"]) {
      const tmp = join(root, eng, v.key, ".render-tmp");
      if (existsSync(tmp)) items.push({ path: tmp, label: `${v.key}: file tạm render`, bytes: dirSize(tmp) });
    }
  }
  for (const d of ["render-test", "styles"]) if (existsSync(join(root, d))) items.push({ path: join(root, d), label: `Bản render thử / ảnh phong cách`, bytes: dirSize(join(root, d)) });
  return items;
}

export function archiveItems(projectId: string, pathsToMove: string[]): string {
  const root = paths.project(projectId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = join(paths.archive(projectId), stamp);
  for (const p of pathsToMove) {
    if (!p.startsWith(root) || p.startsWith(paths.archive(projectId)) || !existsSync(p)) continue;
    const rel = p.slice(root.length + 1);
    const target = join(dest, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    renameSync(p, target);
  }
  return dest;
}

// ---------- Nghe thử giọng ----------

export async function voiceSamples(text: string, voices: VoiceConfig[]): Promise<{ voice: VoiceConfig; file: string; error?: string }[]> {
  const dir = paths.samples();
  mkdirSync(dir, { recursive: true });
  const cit = new CitClient();
  const zerotts = new ZerottsClient();
  const mock = process.env.CVS_TTS_MOCK === "1";
  const tts = createNormalizer()(text).tts;
  const out: { voice: VoiceConfig; file: string; error?: string }[] = [];
  for (const v of voices) {
    const file = join(dir, `${v.provider}_${createHash("sha1").update(JSON.stringify([v, tts])).digest("hex").slice(0, 16)}.mp3`);
    try {
      if (!existsSync(file) && v.provider === "zerotts" && !mock && !(await ensureZerottsRunning()))
        throw new Error("ZeroTTS chưa cài hoặc chưa chạy – bấm Cài ZeroTTS trên trang Giọng đọc.");
      if (!existsSync(file)) await synthesizeSample(tts, v, file, { cit, zerotts, generator: mock ? mockGenerate : undefined });
      out.push({ voice: v, file });
    } catch (e) {
      out.push({ voice: v, file: "", error: (e as Error).message });
    }
  }
  return out;
}

// ---------- So sánh phong cách: cùng một khung mẫu theo mọi phong cách (THEME_IDS) ----------

export async function stylePreview(projectId: string, key: string | null, sceneId?: string): Promise<{ style: StyleId; file: string }[]> {
  let video: Video;
  if (key) video = structuredClone(getVideo(projectId, key)!.data);
  else {
    const norm = createNormalizer();
    video = {
      key: "MAU",
      course: "CVS",
      level: "L1",
      module: "",
      unit: "",
      seq: "",
      title: "Khung mẫu",
      style: "giay-ky-thuat",
      engine: "hyperframes",
      voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 },
      pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
      scenes: [
        {
          id: "s1",
          scriptStart: 0,
          scriptEnd: 10,
          title: "So sánh",
          visual: "So sánh hai bên",
          onscreen: ["Thẩm định", "Thẩm tra"],
          sentences: makeSentences("Thẩm định diễn ra trước khi dự án đăng ký. Thẩm tra diễn ra định kỳ sau mỗi kỳ giám sát.", norm),
          design: { template: "split-compare", params: { title: "Thẩm định và thẩm tra", left: { label: "Thẩm định", icon: "search", points: [{ text: "Trước khi dự án đăng ký" }] }, right: { label: "Thẩm tra", icon: "magnifier", points: [{ text: "Định kỳ, sau mỗi kỳ giám sát" }] } }, by: "user" },
        },
      ],
    };
  }
  // Cảnh đại diện: ưu tiên cảnh có hình phong phú (so sánh, quy trình, số liệu…) để thấy rõ khác biệt giữa các phong cách.
  const plain = ["title-card", "draft", "quote-banner"];
  const scene =
    video.scenes.find((s) => s.id === sceneId) ??
    video.scenes.find((s) => !plain.includes(effectiveDesign(video, s).template)) ??
    video.scenes.find((s) => effectiveDesign(video, s).template !== "draft") ??
    video.scenes[0];
  video.scenes = [scene];
  const dir = join(paths.project(projectId), "styles", key ?? "mau");
  const browser = await launchBrowser();
  const out: { style: StyleId; file: string }[] = [];
  try {
    for (const style of THEME_IDS) {
      const v = { ...video, style, key: `${video.key}-${style}` };
      const timing = currentTiming(projectId, v);
      const work = join(dir, style);
      await hfBuild({ video: v, timing, manifest: null, voDir: join(work, "vo"), workDir: work, assetsDir: paths.assets(projectId) });
      const t = qaTimes(timing).find((x) => x.label.endsWith("cuối cảnh"))!;
      const p = await hfPreview(work, [t], join(dir, "frames", style), { browser });
      const file = join(dir, `${style}.png`);
      copyFileSync(p.frames[0].file, file);
      out.push({ style, file });
    }
  } finally {
    await browser.close();
  }
  return out;
}

// ---------- Viết kịch bản bằng AI ----------

export async function aiWriteScript(projectId: string, input: { kind: "outline" | "topic"; outline?: OutlineDoc; topic?: string; level: string; targetSeconds?: number; audience?: string; fileName: string; sourceText?: string }) {
  const p = getProject(projectId)!;
  const outline = input.kind === "outline" ? input.outline! : await writeOutline(input.topic!, { level: input.level, targetSeconds: input.targetSeconds, audience: input.audience });
  const video = await writeScript(outline, {
    course: p.course,
    level: input.level,
    style: p.settings.style,
    engine: p.settings.engine,
    provider: p.settings.provider,
    normalize: { glossary: glossaryFor(projectId) },
    fileName: input.fileName,
    targetSeconds: input.targetSeconds,
    audience: input.audience,
    sourceText: input.sourceText,
  });
  if (p.settings.font) video.font = p.settings.font;
  const f = addFile(projectId, `${input.fileName} (AI viết)`, input.level, "script", { kind: "script", videos: [video.key], aiWritten: true, outline });
  upsertVideo(projectId, video, { file_id: f.id, status: "script" });
  return { video, outline };
}

// ---------- Sửa cảnh theo ghi chú ----------

/**
 * Sửa một cảnh theo yêu cầu bằng lời (prompt tại cảnh). Mặc định AI chọn/điền lại template;
 * `custom` (hoặc cảnh đang là cảnh tùy biến) → AI viết lại mã cảnh. Thiết kế cũ được lưu để hoàn tác.
 */
export async function reviseWithNote(ctx: Ctx, sceneId: string, note: string, o: { custom?: boolean } = {}) {
  if (!aiAvailable()) throw new Error("Chưa đăng nhập Claude – vào mục Claude AI để đăng nhập rồi gửi lại yêu cầu sửa cảnh");
  const row = getVideo(ctx.projectId, ctx.key)!;
  const video = row.data;
  const i = video.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new Error(`Không có cảnh ${sceneId}`);
  const scene = video.scenes[i];
  scene.notes = [...(scene.notes ?? []), note];
  upsertVideo(ctx.projectId, video);
  if (o.custom || scene.design?.template === "custom") {
    ctx.progress("design", 10, `AI viết lại mã cảnh ${sceneId}`);
    await makeCustomScene(ctx, sceneId, note);
    setVideoFlags(ctx.projectId, ctx.key, { approved: false });
    await stepQa(ctx);
    return;
  }
  ctx.progress("design", 10, `AI sửa ${sceneId}: ${note.slice(0, 60)}`);
  const timing = currentTiming(ctx.projectId, video);
  const r = await reviseScene(video, scene, note, timing.scenes[i]);
  if (scene.design) scene.history = [...(scene.history ?? []), scene.design].slice(-5);
  scene.design = r.design;
  scene.assumptions = [...new Set([...(scene.assumptions ?? []), ...r.assumptions.map((a) => `AI: ${a}`)])];
  upsertVideo(ctx.projectId, video);
  setVideoFlags(ctx.projectId, ctx.key, { approved: false });
  await stepQa(ctx);
}

/** Hoàn tác lần sửa gần nhất của một cảnh (lấy thiết kế trước đó trong history). */
export function undoSceneDesign(projectId: string, key: string, sceneId: string): boolean {
  const row = getVideo(projectId, key);
  const scene = row?.data.scenes.find((s) => s.id === sceneId);
  if (!row || !scene?.history?.length) return false;
  scene.design = scene.history.pop();
  scene.notes = [...(scene.notes ?? []), "(hoàn tác lần sửa trước)"];
  upsertVideo(projectId, row.data);
  setVideoFlags(projectId, key, { approved: false });
  return true;
}

export { computeTiming, basename, stepBuild };
export type { ProjectSettings };

/** Ảnh mẫu phong cách đã dựng gần nhất của dự án (để màn hình chọn phong cách hiện ngay, không phải dựng lại). */
export function listStylePreviews(projectId: string): { key: string; styles: { style: StyleId; file: string }[] } | null {
  const dir = join(paths.project(projectId), "styles");
  if (!existsSync(dir)) return null;
  const sets = readdirSync(dir)
    .map((k) => ({ k, files: THEME_IDS.map((s) => ({ style: s, file: join(dir, k, `${s}.png`) })).filter((x) => existsSync(x.file)) }))
    .filter((x) => x.files.length > 0)
    .map((x) => ({ ...x, t: Math.max(...x.files.map((f) => statSync(f.file).mtimeMs)) }))
    .sort((a, b) => b.t - a.t);
  return sets[0] ? { key: sets[0].k, styles: sets[0].files } : null;
}
