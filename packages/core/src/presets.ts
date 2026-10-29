// Cấu hình giọng theo cấp độ (mục 5.3) – người dùng chỉnh được.

import type { LevelTier, Pace, VoiceConfig } from "./types";

export const VOICE_FEMALE = "Trúc Ly";
export const VOICE_MALE = "Hải Đăng";

export const EDGE_VOICES = { female: "vi-VN-HoaiMyNeural", male: "vi-VN-NamMinhNeural" };

export type LevelPreset = {
  tier: LevelTier;
  label: string;
  /** "alternate" = xen kẽ nữ/nam theo thứ tự video. */
  voice: "alternate" | string;
  speed: number;
  pace: Pace;
  /** Hệ số tốc độ đọc khi ước tính (tiếng/giây = 3,1 × speed × factor). */
  rateFactor: number;
};

export const LEVEL_PRESETS: Record<LevelTier, LevelPreset> = {
  "co-ban": { tier: "co-ban", label: "Cơ bản", voice: "alternate", speed: 0.95, pace: { lead: 0.5, gap: 0.4, tail: 0.6 }, rateFactor: 1 },
  "trung-cap": { tier: "trung-cap", label: "Trung cấp", voice: VOICE_MALE, speed: 0.9, pace: { lead: 0.7, gap: 0.8, tail: 1.2 }, rateFactor: 0.95 },
  "chuyen-sau": { tier: "chuyen-sau", label: "Chuyên sâu", voice: VOICE_MALE, speed: 0.9, pace: { lead: 0.7, gap: 0.9, tail: 1.2 }, rateFactor: 0.93 },
};

/** "L1" → cơ bản, "L2" → trung cấp, "L3"+ → chuyên sâu. */
export function tierOfLevel(level: string): LevelTier {
  const n = Number(level.match(/\d+/)?.[0] ?? 1);
  return n <= 1 ? "co-ban" : n === 2 ? "trung-cap" : "chuyen-sau";
}

export function defaultVoiceFor(level: string, videoIndex: number, provider: "cit" | "edge" = "cit"): VoiceConfig {
  const p = LEVEL_PRESETS[tierOfLevel(level)];
  let voiceId = p.voice === "alternate" ? (videoIndex % 2 === 0 ? VOICE_FEMALE : VOICE_MALE) : p.voice;
  if (provider === "edge") voiceId = voiceId === VOICE_FEMALE ? EDGE_VOICES.female : EDGE_VOICES.male;
  return { provider, voiceId, speed: p.speed };
}

export function defaultPaceFor(level: string): Pace {
  return { ...LEVEL_PRESETS[tierOfLevel(level)].pace };
}

/** Giới hạn im lặng tối đa ở bất kỳ đâu (giây). */
export const MAX_SILENCE = 2.5;
