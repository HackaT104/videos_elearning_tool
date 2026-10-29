// Tạo Video/Scene với giá trị mặc định của dự án.

import { makeVideoKey, parseVideoFileName } from "./codes";
import { createNormalizer, type NormalizeOptions } from "./normalize/normalize";
import { defaultPaceFor, defaultVoiceFor } from "./presets";
import { splitSentences } from "./split";
import type { EngineId, Scene, Sentence, StyleId, Video, VoiceProvider } from "./types";

export type ProjectDefaults = {
  course: string; // mã khóa, ví dụ "CAR"
  level: string; // "L1"
  style?: StyleId;
  engine?: EngineId;
  provider?: VoiceProvider;
  normalize?: NormalizeOptions;
};

export function makeSentences(vo: string, normalize: (s: string) => { tts: string }): Sentence[] {
  return splitSentences(vo).map((text) => ({ text, tts: normalize(text).tts }));
}

export type RawScene = {
  scriptStart: number;
  scriptEnd: number;
  title: string;
  visual: string;
  onscreen: string[];
  vo: string;
};

export type RawVideo = {
  fileName?: string;
  title: string;
  scenes: RawScene[];
  sources?: string;
  context?: string;
  /** Mã đặt sẵn (Excel) khi không có tên file. */
  code?: string;
  module?: string;
};

export function buildVideo(raw: RawVideo, d: ProjectDefaults, index: number): Video {
  const normalizer = createNormalizer(d.normalize);
  const parts = parseVideoFileName(raw.fileName ?? raw.code ?? `VIDEO_${index + 1}`);
  const module = parts.module || raw.module || "";
  const scenes: Scene[] = raw.scenes.map((s, i) => ({
    id: `s${i + 1}`,
    scriptStart: s.scriptStart,
    scriptEnd: s.scriptEnd,
    title: s.title,
    visual: s.visual.trim(),
    onscreen: s.onscreen.map((x) => x.trim()).filter(Boolean),
    sentences: makeSentences(s.vo, normalizer),
  }));
  const provider = d.provider ?? "cit";
  return {
    key: makeVideoKey(d.course, d.level, parts.base),
    course: d.course,
    level: d.level,
    module,
    unit: parts.unit,
    seq: parts.seq,
    title: raw.title.trim() || parts.base,
    sourceFileName: raw.fileName,
    style: d.style ?? "giay-ky-thuat",
    engine: d.engine ?? "hyperframes",
    voice: defaultVoiceFor(d.level, index, provider),
    pace: defaultPaceFor(d.level),
    sources: raw.sources?.trim() || undefined,
    context: raw.context?.trim() || undefined,
    scenes,
  };
}

/** Chạy lại chuẩn hóa cho mọi câu chưa bị khóa (sau khi sửa glossary). */
export function renormalizeVideo(video: Video, opts?: NormalizeOptions): Video {
  const n = createNormalizer(opts);
  return {
    ...video,
    scenes: video.scenes.map((s) => ({
      ...s,
      sentences: s.sentences.map((x) => (x.ttsLocked ? x : { ...x, tts: n(x.text).tts })),
    })),
  };
}
