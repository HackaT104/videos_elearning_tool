// Tạo giọng cho cả video: đọc liền cả cảnh trong một lần gọi → gán mốc câu → cắt im lặng → giãn nhịp → MP3 + manifest.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readJson, sceneVoiceHash, stripTtsTags, voiceExtras, writeFileAtomic, writeJsonAtomic, type Cue, type Scene, type Video, type VoiceConfig, type VoiceManifest, type VoiceManifestScene } from "@cvs/core";
import { alignSentences } from "./align";
import { CitClient } from "./cit";
import { edgeGenerate } from "./edge";
import { decodeToPcm, pcmToWav, SAMPLE_RATE, wavToMp3 } from "./ffmpeg";
import { pace, shiftSpans, trimSilence } from "./silence";

export const MANIFEST_VERSION = 1;

export type SynthOptions = {
  cit?: CitClient;
  /** Tạo lại kể cả khi hash khớp. */
  force?: boolean;
  /** Chỉ các cảnh này. */
  only?: string[];
  onProgress?: (p: { scene: string; index: number; total: number; status: "skip" | "tts" | "done" }) => void;
  /** Bộ tạo giọng thay thế (test/demo). */
  generator?: (text: string, voice: VoiceConfig) => Promise<{ audio: Buffer; cues: Cue[]; format: string }>;
};

export function manifestPath(voDir: string) {
  return join(voDir, "manifest.json");
}

export function loadManifest(voDir: string): VoiceManifest {
  const m = readJson<VoiceManifest>(manifestPath(voDir), { version: MANIFEST_VERSION, scenes: {} });
  return m.version === MANIFEST_VERSION ? m : { version: MANIFEST_VERSION, scenes: {} };
}

function rawHash(voice: VoiceConfig, text: string) {
  return createHash("sha1").update([voice.provider, voice.voiceId, voice.speed.toFixed(3), ...(voiceExtras(voice) ? [voiceExtras(voice)] : []), text].join("␞")).digest("hex").slice(0, 16);
}

export async function generateRaw(text: string, voice: VoiceConfig, opts: Pick<SynthOptions, "cit" | "generator">) {
  if (opts.generator) return opts.generator(text, voice);
  if (voice.provider === "edge") return edgeGenerate(stripTtsTags(text), voice.voiceId, voice.speed);
  const cit = opts.cit ?? new CitClient();
  return cit.generate({
    text,
    voice_id: voice.voiceId,
    speed: voice.speed,
    format: "wav",
    ...(voice.temperature !== undefined ? { temperature: voice.temperature } : {}),
    ...(voice.seed !== undefined && voice.seed !== null ? { seed: voice.seed } : {}),
    use_pronunciation_dict: voice.useDict ?? true,
  });
}

/** Xử lý một cảnh (giả định đã có file thô). Trả về mục manifest. */
export async function processScene(
  rawFile: string,
  cues: Cue[],
  scene: Scene,
  gap: number,
  outMp3: string,
): Promise<Omit<VoiceManifestScene, "hash" | "file">> {
  const pcm0 = await decodeToPcm(rawFile, SAMPLE_RATE);
  const dur0 = pcm0.length / SAMPLE_RATE;
  const spans0 = alignSentences(scene.sentences.map((s) => s.tts), cues, dur0);
  const trimmed = trimSilence(pcm0, SAMPLE_RATE);
  const dur1 = trimmed.pcm.length / SAMPLE_RATE;
  const spans1 = shiftSpans(spans0, trimmed.head, dur1);
  if (spans1.length) spans1[spans1.length - 1].end = dur1;
  const paced = pace(trimmed.pcm, SAMPLE_RATE, spans1, gap);
  const dur = paced.pcm.length / SAMPLE_RATE;
  if (paced.spans.length) paced.spans[paced.spans.length - 1].end = r3(dur);
  const wav = outMp3.replace(/\.mp3$/, ".wav");
  writeFileSync(wav, pcmToWav(paced.pcm, SAMPLE_RATE));
  const tmpMp3 = outMp3 + ".part.mp3";
  await wavToMp3(wav, tmpMp3);
  writeFileAtomic(outMp3, readFileSync(tmpMp3));
  rmSync(tmpMp3, { force: true });
  rmSync(wav, { force: true });
  return {
    dur: r3(dur),
    cues: paced.spans.map((s) => s.start),
    ends: paced.spans.map((s) => s.end),
    trimmed: { head: trimmed.head, tail: trimmed.tail },
    paced: paced.inserts,
  };
}

/** Tạo giọng cho mọi cảnh có hash thay đổi. Ghi manifest sau mỗi cảnh (chạy lại được nếu đứt giữa chừng). */
export async function synthesizeVideo(video: Video, voDir: string, opts: SynthOptions = {}): Promise<VoiceManifest> {
  mkdirSync(join(voDir, "raw"), { recursive: true });
  const manifest = loadManifest(voDir);
  const scenes = video.scenes.filter((s) => !opts.only || opts.only.includes(s.id));
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const hash = sceneVoiceHash(video.voice, scene, video.pace.gap);
    const prev = manifest.scenes[scene.id];
    if (!opts.force && prev?.hash === hash && existsSync(join(voDir, prev.file))) {
      opts.onProgress?.({ scene: scene.id, index: i, total: scenes.length, status: "skip" });
      continue;
    }
    if (scene.sentences.length === 0) {
      delete manifest.scenes[scene.id];
      continue;
    }
    opts.onProgress?.({ scene: scene.id, index: i, total: scenes.length, status: "tts" });
    const text = scene.sentences.map((s) => s.tts.trim()).join(" ");
    const rh = rawHash(video.voice, text);
    const rawCues = join(voDir, "raw", `${rh}.cues.json`);
    let rawFile = ["wav", "mp3"].map((e) => join(voDir, "raw", `${rh}.${e}`)).find((f) => existsSync(f));
    let cues: Cue[];
    if (rawFile && existsSync(rawCues) && !opts.force) {
      cues = readJson<Cue[]>(rawCues);
    } else {
      const g = await generateRaw(text, video.voice, opts);
      rawFile = join(voDir, "raw", `${rh}.${g.format === "mp3" ? "mp3" : "wav"}`);
      writeFileAtomic(rawFile, g.audio);
      writeJsonAtomic(rawCues, g.cues);
      cues = g.cues;
    }
    const file = `${scene.id}-${hash.slice(0, 8)}.mp3`;
    const entry = await processScene(rawFile, cues, scene, video.pace.gap, join(voDir, file));
    manifest.scenes[scene.id] = { hash, file, provider: video.voice.provider, ...entry };
    writeJsonAtomic(manifestPath(voDir), manifest);
    opts.onProgress?.({ scene: scene.id, index: i, total: scenes.length, status: "done" });
  }
  // bỏ mục của cảnh không còn tồn tại
  for (const id of Object.keys(manifest.scenes)) if (!video.scenes.some((s) => s.id === id)) delete manifest.scenes[id];
  writeJsonAtomic(manifestPath(voDir), manifest);
  return manifest;
}

/** "Nghe thử": đọc một câu mẫu → MP3. */
export async function synthesizeSample(text: string, voice: VoiceConfig, outMp3: string, opts: Pick<SynthOptions, "cit" | "generator"> = {}) {
  const g = await generateRaw(text, voice, opts);
  const raw = outMp3.replace(/\.mp3$/, `.raw.${g.format === "mp3" ? "mp3" : "wav"}`);
  writeFileSync(raw, g.audio);
  const pcm = await decodeToPcm(raw);
  const t = trimSilence(pcm, SAMPLE_RATE);
  const wav = outMp3.replace(/\.mp3$/, ".wav");
  writeFileSync(wav, pcmToWav(t.pcm));
  await wavToMp3(wav, outMp3);
  rmSync(raw, { force: true });
  rmSync(wav, { force: true });
  return outMp3;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
