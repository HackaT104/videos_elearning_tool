// Render: chính = `npx hyperframes render`; dự phòng = Playwright tua từng khung (30 fps) → PNG vào ffmpeg
// (libx264, yuv420p, CRF 18) → ghép các <audio> theo data-start bằng adelay + amix → AAC 192 kbps.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Timing } from "@cvs/core";
import type { RenderProgress, RenderResult } from "@cvs/engine";
import { delimiter } from "node:path";
import { FFMPEG, FFPROBE, ffmpeg, probe } from "@cvs/tts";
import { launchBrowser, openComposition, seek } from "./preview";

const require = createRequire(import.meta.url);

export type HfRenderOptions = {
  renderer?: "auto" | "cli" | "fallback";
  /** Số trang Chromium song song khi render dự phòng. */
  concurrency?: number;
  onProgress?: (p: RenderProgress) => void;
  /** Ghi log CLI. */
  log?: (s: string) => void;
};

function hyperframesBin(): string | null {
  try {
    return join(dirname(require.resolve("hyperframes/package.json")), "bin", "hyperframes.mjs");
  } catch {
    return null;
  }
}

export async function renderWithCli(workDir: string, outFile: string, opts: HfRenderOptions): Promise<void> {
  const bin = hyperframesBin();
  if (!bin) throw new Error("Chưa cài gói hyperframes");
  await new Promise<void>((resolve, reject) => {
    // cảnh có media (clip hoạt hình) → CLI cần ffmpeg/ffprobe trong PATH: dùng bản đi kèm ứng dụng
    const binDirs = [FFMPEG, FFPROBE].filter((b) => /[\\/]/.test(b)).map((b) => dirname(b));
    const PATH = [...new Set(binDirs), process.env.PATH ?? process.env.Path ?? ""].join(delimiter);
    const p = spawn(process.execPath, [bin, "render", "-o", outFile, "--crf", "18"], { cwd: workDir, env: { ...process.env, PATH, Path: PATH, HYPERFRAMES_NO_UPDATE_CHECK: "1", CI: "1" }, windowsHide: true });
    let log = "";
    const onData = (d: Buffer) => {
      const s = d.toString();
      log += s;
      opts.log?.(s);
      const m = s.match(/(\d{1,3})%/);
      if (m) opts.onProgress?.({ phase: "hyperframes render", pct: Number(m[1]) });
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 && existsSync(outFile) ? resolve() : reject(new Error(`hyperframes render lỗi (mã ${code}): ${log.split("\n").slice(-8).join("\n")}`))));
  });
}

async function renderFramesSegment(workDir: string, from: number, to: number, fps: number, outFile: string, onFrame: () => void) {
  const browser = await launchBrowser();
  const hp = await openComposition(browser, workDir);
  if (hp.errors.length) {
    await hp.close();
    await browser.close();
    throw new Error(`Lỗi trang khi render: ${hp.errors.join("; ")}`);
  }
  const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-r", String(fps), outFile], {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d));
  const done = new Promise<void>((resolve, reject) => ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg lỗi: ${ffErr}`)))));
  try {
    for (let f = from; f < to; f++) {
      await seek(hp.page, f / fps);
      const png = await hp.page.screenshot({ type: "png" });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      onFrame();
    }
  } finally {
    ff.stdin.end();
    await hp.close();
    await browser.close();
  }
  await done;
}

/** Trộn giọng theo mốc: adelay + amix → AAC 192 kbps, đúng tổng thời lượng. */
export async function mixAudio(clips: { file: string; start: number }[], total: number, outFile: string) {
  if (clips.length === 0) {
    await ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", String(total), "-c:a", "aac", "-b:a", "192k", outFile]);
    return;
  }
  const inputs = clips.flatMap((c) => ["-i", c.file]);
  const chains = clips.map((c, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`);
  const mix = `${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad[out]`;
  await ffmpeg([...inputs, "-filter_complex", [...chains, mix].join(";"), "-map", "[out]", "-t", String(total), "-c:a", "aac", "-b:a", "192k", outFile]);
}

export async function renderFallback(workDir: string, timing: Timing, outFile: string, opts: HfRenderOptions = {}): Promise<void> {
  const fps = timing.fps;
  const total = Math.round(timing.total * fps);
  const tmp = join(workDir, ".render-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const n = Math.max(1, Math.min(opts.concurrency ?? 2, Math.ceil(total / 150)));
  const per = Math.ceil(total / n);
  let doneFrames = 0;
  const tick = () => {
    doneFrames++;
    if (doneFrames % 15 === 0 || doneFrames === total) opts.onProgress?.({ phase: "Dựng khung hình", frame: doneFrames, total, pct: Math.round((doneFrames / total) * 90) });
  };
  const segs = Array.from({ length: n }, (_, i) => ({ from: i * per, to: Math.min(total, (i + 1) * per), file: join(tmp, `seg${i}.mp4`) })).filter((s) => s.to > s.from);
  await Promise.all(segs.map((s) => renderFramesSegment(workDir, s.from, s.to, fps, s.file, tick)));
  const list = join(tmp, "list.txt");
  writeFileSync(list, segs.map((s) => `file '${s.file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const video = join(tmp, "video.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);
  opts.onProgress?.({ phase: "Ghép tiếng", pct: 93 });
  const clips = timing.scenes.filter((s) => s.audioFile).map((s) => ({ file: join(workDir, "assets", "vo", s.audioFile!), start: s.start + s.lead }));
  const audio = join(tmp, "audio.m4a");
  await mixAudio(clips, timing.total, audio);
  const part = outFile + ".part.mp4";
  await ffmpeg(["-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-t", String(timing.total), "-movflags", "+faststart", part]);
  rmSync(outFile, { force: true });
  await import("node:fs").then((fs) => fs.renameSync(part, outFile));
  rmSync(tmp, { recursive: true, force: true });
  opts.onProgress?.({ phase: "Xong", pct: 100 });
}

export async function hfRender(workDir: string, timing: Timing, outFile: string, opts: HfRenderOptions = {}): Promise<RenderResult> {
  mkdirSync(dirname(outFile), { recursive: true });
  const mode = opts.renderer ?? (process.env.CVS_HF_RENDERER as HfRenderOptions["renderer"]) ?? "auto";
  let renderer = "fallback";
  if (mode === "cli" || mode === "auto") {
    try {
      opts.onProgress?.({ phase: "hyperframes render", pct: 1 });
      await renderWithCli(workDir, outFile, opts);
      renderer = "hyperframes-cli";
    } catch (e) {
      if (mode === "cli") throw e;
      opts.log?.(`CLI HyperFrames lỗi, chuyển sang render dự phòng: ${(e as Error).message}\n`);
    }
  }
  if (renderer === "fallback") await renderFallback(workDir, timing, outFile, opts);
  const info = await probe(outFile);
  return { file: outFile, duration: info.duration, renderer };
}
