// Xuất, dọn dẹp, nghe thử giọng, so sánh phong cách, viết kịch bản bằng AI, sửa cảnh theo ghi chú.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { computeTiming, createNormalizer, levelFolder, makeSentences, type OutlineDoc, type StyleId, type Video, type VoiceConfig } from "@cvs/core";
import { reviseScene, writeOutline, writeScript } from "@cvs/ai";
import { addFile, getProject, getVideo, glossaryFor, listVideos, paths, setVideoFlags, upsertVideo, type ProjectSettings } from "@cvs/db";
import { qaTimes } from "@cvs/engine";
import { hfBuild, hfPreview, launchBrowser } from "@cvs/engine-hf";
import { THEME_IDS, THEMES } from "@cvs/themes";
import { CitClient, mockGenerate, probe, synthesizeSample } from "@cvs/tts";
import { currentTiming, stepBuild, stepQa, type Ctx } from "./pipeline";

// ---------- Xuất ----------

export type ExportResult = { dir: string; files: string[]; skipped: { key: string; reason: string }[]; catalog: string };

export async function exportProject(projectId: string, opts: { onlyApproved?: boolean } = {}): Promise<ExportResult> {
  const outDir = paths.out(projectId);
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
    const info = await probe(dst);
    const s = Math.round(info.duration);
    const voice = `${v.data.voice.provider.toUpperCase()} ${v.data.voice.voiceId} ×${v.data.voice.speed}`;
    rows.push([v.key, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, v.data.title, voice, THEMES[v.data.style as StyleId]?.name ?? v.data.style, v.data.engine, v.level].join("\t"));
  }
  // UTF-8 BOM + CRLF để mở đúng trên Windows (Notepad/Excel)
  const catalog = join(outDir, "DANH_MUC_VIDEO.txt");
  writeFileSync(catalog, "﻿" + rows.join("\r\n") + "\r\n", "utf8");
  return { dir: outDir, files, skipped, catalog };
}

export function openFolder(dir: string) {
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [dir], { detached: true, stdio: "ignore", windowsHide: false }).unref();
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
  const tts = createNormalizer()(text).tts;
  const out: { voice: VoiceConfig; file: string; error?: string }[] = [];
  for (const v of voices) {
    const file = join(dir, `${v.provider}_${v.voiceId.normalize("NFD").replace(/[^\w]/g, "")}_${v.speed}_${Buffer.from(tts).toString("base64url").slice(0, 16)}.mp3`);
    try {
      if (!existsSync(file)) await synthesizeSample(tts, v, file, { cit, generator: process.env.CVS_TTS_MOCK === "1" ? mockGenerate : undefined });
      out.push({ voice: v, file });
    } catch (e) {
      out.push({ voice: v, file: "", error: (e as Error).message });
    }
  }
  return out;
}

// ---------- So sánh phong cách: cùng một khung mẫu theo cả 5 kiểu ----------

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
  const scene = video.scenes.find((s) => s.id === sceneId) ?? video.scenes.find((s) => s.design && s.design.template !== "draft") ?? video.scenes[0];
  video.scenes = [scene];
  const dir = join(paths.project(projectId), "styles", key ?? "mau");
  const browser = await launchBrowser();
  const out: { style: StyleId; file: string }[] = [];
  try {
    for (const style of THEME_IDS) {
      const v = { ...video, style, key: `${video.key}-${style}` };
      const timing = currentTiming(projectId, v);
      const work = join(dir, style);
      await hfBuild({ video: v, timing, manifest: null, voDir: join(work, "vo"), workDir: work });
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
  const f = addFile(projectId, `${input.fileName} (AI viết)`, input.level, "script", { kind: "script", videos: [video.key], aiWritten: true, outline });
  upsertVideo(projectId, video, { file_id: f.id, status: "script" });
  return { video, outline };
}

// ---------- Sửa cảnh theo ghi chú ----------

export async function reviseWithNote(ctx: Ctx, sceneId: string, note: string) {
  const row = getVideo(ctx.projectId, ctx.key)!;
  const video = row.data;
  const i = video.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new Error(`Không có cảnh ${sceneId}`);
  const scene = video.scenes[i];
  scene.notes = [...(scene.notes ?? []), note];
  const timing = currentTiming(ctx.projectId, video);
  const r = await reviseScene(video, scene, note, timing.scenes[i]);
  scene.design = r.design;
  scene.assumptions = [...new Set([...(scene.assumptions ?? []), ...r.assumptions.map((a) => `AI: ${a}`)])];
  upsertVideo(ctx.projectId, video);
  setVideoFlags(ctx.projectId, ctx.key, { approved: false });
  await stepQa(ctx);
}

export { computeTiming, basename, stepBuild };
export type { ProjectSettings };
