// Luồng demo dùng chung cho test render: bóc fixture → giọng (giả lập hoặc CIT) → timing → build → preview → render.
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { computeTiming, parseInputFile, type Video } from "@cvs/core";
import { mockGenerate, synthesizeVideo } from "@cvs/tts";

export const ROOT = join(import.meta.dirname, "..", "..");

export async function loadFixtureVideo(index = 0, file = "Kich_ban_L1.docx", level = "L1"): Promise<Video> {
  const r = await parseInputFile(file, readFileSync(join(ROOT, "fixtures", file)), { course: "CAR", level });
  return r.videos[index];
}

export async function voice(video: Video, voDir: string, mock = true) {
  mkdirSync(voDir, { recursive: true });
  const manifest = await synthesizeVideo(video, voDir, mock ? { generator: mockGenerate } : {});
  return { manifest, timing: computeTiming(video, manifest) };
}
