// Tính timing (mục 5.2 / 6A.4): giọng đọc là đồng hồ.

import { createHash } from "node:crypto";
import { LEVEL_PRESETS, tierOfLevel } from "./presets";
import type { Scene, SceneTiming, Timing, Video, VoiceConfig } from "./types";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Tốc độ đọc trung bình (tiếng/giây) khi ước tính. */
export const SYLLABLES_PER_SECOND = 3.1;

/** Một mục trong vo/manifest.json. Mốc cues/ends tính từ đầu file giọng (đã cắt/giãn). */
export type VoiceManifestScene = {
  hash: string;
  file: string;
  dur: number;
  cues: number[];
  ends: number[];
  trimmed?: { head: number; tail: number };
  paced?: { at: number; added: number }[];
  provider?: string;
};
export type VoiceManifest = { version: number; scenes: Record<string, VoiceManifestScene> };

/** hash = sha1(provider, voice, speed, text tts) – chỉ tạo lại cảnh có hash thay đổi. */
export function sceneVoiceHash(voice: VoiceConfig, scene: Pick<Scene, "sentences">, gap = 0): string {
  const h = createHash("sha1");
  h.update([voice.provider, voice.voiceId, voice.speed.toFixed(3), gap.toFixed(3), ...(voiceExtras(voice) ? [voiceExtras(voice)] : []), ...scene.sentences.map((s) => s.tts)].join("␞"));
  return h.digest("hex").slice(0, 16);
}

/** Phần tuỳ chọn CIT/ZeroTTS đưa vào hash (để trống khi dùng mặc định → hash cũ không đổi). Nhà cung cấp đã nằm trong hash riêng. */
export function voiceExtras(v: VoiceConfig): string {
  const parts: string[] = [];
  if (v.temperature !== undefined) parts.push(`t${v.temperature}`);
  if (v.seed !== undefined && v.seed !== null) parts.push(`s${v.seed}`);
  if (v.useDict === false) parts.push("nodict");
  return parts.join(",");
}

/** Thẻ điều khiển cách đọc của CIT: [nghỉ 2s], [cười], [thở dài], [hắng giọng]… */
export const TTS_TAG_RE = /\[[^\[\]\n]{1,24}\]/g;
export const stripTtsTags = (s: string) => s.replace(TTS_TAG_RE, " ").replace(/\s+/g, " ").trim();

export function countSyllables(s: string): number {
  return stripTtsTags(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Ước tính mốc câu khi chưa có giọng: ~3,1 tiếng/giây × speed × hệ số cấp độ. */
export function estimateSceneAudio(video: Video, scene: Scene): { dur: number; cues: number[]; ends: number[] } {
  const rate = SYLLABLES_PER_SECOND * video.voice.speed * LEVEL_PRESETS[tierOfLevel(video.level)].rateFactor;
  const cues: number[] = [];
  const ends: number[] = [];
  let t = 0;
  scene.sentences.forEach((s, i) => {
    if (i > 0) t += Math.max(0.35, video.pace.gap);
    cues.push(round(t));
    t += Math.max(0.6, countSyllables(s.tts || s.text) / rate);
    ends.push(round(t));
  });
  if (scene.sentences.length === 0) return { dur: 2, cues: [], ends: [] };
  return { dur: round(t), cues, ends };
}

export function computeTiming(video: Video, manifest?: VoiceManifest | null): Timing {
  const scenes: SceneTiming[] = [];
  let start = 0;
  let estimatedAny = false;
  for (const scene of video.scenes) {
    const hash = sceneVoiceHash(video.voice, scene, video.pace.gap);
    const real = manifest?.scenes[scene.id];
    const useReal = !!real && real.hash === hash;
    const a = useReal ? { dur: real!.dur, cues: real!.cues, ends: real!.ends } : estimateSceneAudio(video, scene);
    const { lead, tail } = video.pace;
    const dur = round(lead + a.dur + tail);
    scenes.push({
      id: scene.id,
      start: round(start),
      dur,
      lead,
      tail,
      audioDur: round(a.dur),
      cues: a.cues.map((c) => round(lead + c)),
      ends: a.ends.map((c) => round(lead + c)),
      estimated: !useReal,
      audioFile: useReal ? real!.file : undefined,
    });
    if (!useReal) estimatedAny = true;
    start += dur;
  }
  return { videoKey: video.key, fps: FPS, width: WIDTH, height: HEIGHT, total: round(start), estimated: estimatedAny, scenes };
}

/** Khối TIMING đưa vào cảnh: {dur, cues, ends}. */
export function sceneTimingBlock(t: SceneTiming) {
  return { dur: t.dur, cues: t.cues, ends: t.ends };
}

/** at(i, f) = cues[i] + f × (ends[i] − cues[i]) – dùng chung cho mọi bộ dựng. */
export function at(t: { cues: number[]; ends: number[] }, i: number, f = 0): number {
  const n = t.cues.length;
  if (n === 0) return 0;
  const k = Math.max(0, Math.min(n - 1, i));
  return t.cues[k] + Math.max(0, Math.min(1, f)) * (t.ends[k] - t.cues[k]);
}

export function round(n: number, d = 3): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
