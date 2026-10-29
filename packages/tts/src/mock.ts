// Bộ tạo giọng GIẢ LẬP (chỉ dùng cho test/demo khi không có CIT Voice Studio):
// mỗi tiếng là một xung âm ngắn, có khoảng ngắt ở dấu phẩy/cuối câu, và trả cues theo cụm như CIT.

import type { Cue, VoiceConfig } from "@cvs/core";
import { pcmToWav, SAMPLE_RATE } from "./ffmpeg";

export function mockSpeech(text: string, speed = 1, sr = SAMPLE_RATE): { pcm: Float32Array; cues: Cue[] } {
  const syll = 0.2 / speed;
  const wordGap = 0.05 / speed;
  const commaGap = 0.22 / speed;
  const stopGap = 0.38 / speed;
  const leadSil = 0.4;
  const tailSil = 0.6;
  const tokens = text.split(/\s+/).filter(Boolean);
  const chunks: { start: number; end: number; text: string }[] = [];
  const segs: { t: number; d: number; f: number }[] = [];
  let t = leadSil;
  let chunkStart = t;
  let chunkWords: string[] = [];
  tokens.forEach((w, i) => {
    const f = 140 + ((w.length * 37 + i * 11) % 90);
    segs.push({ t, d: syll, f });
    t += syll;
    chunkWords.push(w);
    const last = i === tokens.length - 1;
    if (/[.!?…]$/.test(w) || /[,;:]$/.test(w) || last) {
      chunks.push({ start: r3(chunkStart), end: r3(t), text: chunkWords.join(" ") });
      chunkWords = [];
      t += last ? 0 : /[,;:]$/.test(w) ? commaGap : stopGap;
      chunkStart = t;
    } else t += wordGap;
  });
  t += tailSil;
  const pcm = new Float32Array(Math.ceil(t * sr));
  for (const s of segs) {
    const a = Math.round(s.t * sr);
    const n = Math.round(s.d * sr);
    for (let k = 0; k < n; k++) {
      const env = Math.sin((Math.PI * k) / n); // bao hình sin – không có nhảy đột ngột
      const x = (k / sr) * s.f * 2 * Math.PI;
      pcm[a + k] = 0.3 * env * (Math.sin(x) + 0.3 * Math.sin(2.7 * x));
    }
  }
  return { pcm, cues: chunks };
}

export async function mockGenerate(text: string, voice: VoiceConfig) {
  const { pcm, cues } = mockSpeech(text, voice.speed);
  return { audio: pcmToWav(pcm), cues, format: "wav" as const };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
