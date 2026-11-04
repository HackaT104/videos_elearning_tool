// Kiểm file MP4 sau render: định dạng (ffprobe), khung đen / hình đứng (blackdetect, freezedetect), âm lượng (ebur128) và méo tiếng.
// Bộ đọc kết quả là hàm thuần (test trên mẫu stderr của ffmpeg).

import type { Timing } from "@cvs/core";
import { FFMPEG, LOUDNESS, parseEbur128, run, type ProbeInfo } from "@cvs/tts";
import type { QaItem } from "./index";

export type Span = { start: number; end: number };

/** blackdetect: "black_start:1.2 black_end:2.5 black_duration:1.3". */
export function parseBlack(stderr: string): Span[] {
  return [...stderr.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
}

/** freezedetect: freeze_start … freeze_end (thiếu end = đứng tới hết video). */
export function parseFreeze(stderr: string, duration: number): Span[] {
  const out: Span[] = [];
  let cur: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/freeze_start:\s*([\d.]+)/);
    if (s) cur = Number(s[1]);
    const e = line.match(/freeze_end:\s*([\d.]+)/);
    if (e && cur !== null) {
      out.push({ start: cur, end: Number(e[1]) });
      cur = null;
    }
  }
  if (cur !== null) out.push({ start: cur, end: duration });
  return out;
}

/** astats (measure_overall): mức đỉnh mẫu (dBFS) của phần "Overall". */
export function parsePeak(stderr: string): number | null {
  const s = stderr.slice(stderr.lastIndexOf("Overall"));
  const m = s.match(/Peak level dB:\s*(-?[\d.]+|-inf)/);
  return m ? (m[1] === "-inf" ? -Infinity : Number(m[1])) : null;
}

const fps = (r?: string) => {
  const [a, b] = (r ?? "").split("/").map(Number);
  return b ? a / b : a || 0;
};

/** Định dạng: H.264 1920×1080 30 fps, AAC, thời lượng khớp timing ±0,15 s. */
export function formatItems(info: ProbeInfo, timing: Timing): QaItem[] {
  const items: QaItem[] = [];
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  if (!a || a.codec_name !== "aac") items.push({ kind: "audio", severity: "error", message: a ? `Âm thanh là ${a.codec_name}, cần AAC` : "Video không có luồng âm thanh AAC" });
  if (!v || v.codec_name !== "h264" || v.width !== timing.width || v.height !== timing.height)
    items.push({ kind: "render", severity: "error", message: `Video không phải H.264 ${timing.width}×${timing.height}${v ? ` (đang là ${v.codec_name} ${v.width}×${v.height})` : ""}` });
  const f = fps(v?.r_frame_rate) || fps(v?.avg_frame_rate);
  if (v && Math.abs(f - timing.fps) > 0.05) items.push({ kind: "render", severity: "error", message: `Tốc độ khung ${f.toFixed(2)} fps, cần ${timing.fps} fps` });
  if (Math.abs(info.duration - timing.total) > 0.15) items.push({ kind: "render", severity: "error", message: `Thời lượng ${info.duration.toFixed(2)} s lệch timing ${timing.total.toFixed(2)} s (> 0,15 s)` });
  return items;
}

const sceneAt = (timing: Timing, t: number) => timing.scenes.find((x) => t >= x.start && t < x.start + x.dur) ?? timing.scenes[timing.scenes.length - 1];

/** Khoảng đứng hình dài nhất cảnh được phép: khoảng cách lớn nhất giữa các mốc câu (hình chỉ đổi ở mốc), tối thiểu 3 s. */
export function holdOf(s: Timing["scenes"][number]): number {
  const marks = [0, ...s.cues, s.dur].sort((a, b) => a - b);
  let hold = 0;
  for (let i = 1; i < marks.length; i++) hold = Math.max(hold, marks[i] - marks[i - 1]);
  return Math.max(3, hold + 0.5);
}

export function visualItems(black: Span[], freeze: Span[], timing: Timing): QaItem[] {
  const items: QaItem[] = [];
  for (const b of black)
    if (b.end - b.start > 0.5)
      items.push({ kind: "render", severity: "warning", scene: sceneAt(timing, b.start)?.id, message: `Màn hình đen ${(b.end - b.start).toFixed(1)} s tại ${b.start.toFixed(1)} s – kiểm tra cảnh có hiện đủ hình không` });
  for (const f of freeze) {
    const s = sceneAt(timing, f.start);
    if (!s) continue;
    const hold = holdOf(s);
    if (f.end - f.start > hold)
      items.push({ kind: "render", severity: "warning", scene: s.id, message: `Hình đứng yên ${(f.end - f.start).toFixed(1)} s tại ${f.start.toFixed(1)} s (cảnh này chỉ nên đứng tối đa ${hold.toFixed(1)} s) – có thể hoạt ảnh không chạy` });
  }
  return items;
}

export function loudnessItems(m: { I: number; TP: number } | null, peak: number | null): QaItem[] {
  const items: QaItem[] = [];
  if (!m || !Number.isFinite(m.I)) return [{ kind: "audio", severity: "warning", message: "Không đo được độ to âm thanh (EBU R128)" }];
  if (Math.abs(m.I - LOUDNESS.I) > 1.5)
    items.push({ kind: "audio", severity: "warning", message: `Độ to ${m.I.toFixed(1)} LUFS, mục tiêu ${LOUDNESS.I} LUFS (±1,5) – render lại để chuẩn hoá âm lượng` });
  if (m.TP > LOUDNESS.TP + 0.5) items.push({ kind: "audio", severity: "warning", message: `Đỉnh thật ${m.TP.toFixed(1)} dBTP vượt mức ${LOUDNESS.TP} dBTP – dễ rè trên loa điện thoại` });
  if (peak !== null && peak >= -0.05) items.push({ kind: "audio", severity: "error", message: "Âm thanh chạm 0 dBFS (méo/clipping) – giảm mức nhạc nền hoặc render lại" });
  return items;
}

/** Chạy hai lượt ffmpeg (hình, tiếng) và gom kết quả. */
export async function mediaQa(file: string, info: ProbeInfo, timing: Timing): Promise<{ items: QaItem[]; loudness: { I: number; TP: number } | null }> {
  const [vid, aud] = await Promise.all([
    run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-map", "0:v:0", "-vf", "blackdetect=d=0.5:pix_th=0.02,freezedetect=n=-60dB:d=3", "-f", "null", "-"]),
    run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true,astats=measure_perchannel=none:measure_overall=Peak_level", "-f", "null", "-"]),
  ]);
  const m = parseEbur128(aud.stderr);
  const items = [...visualItems(parseBlack(vid.stderr), parseFreeze(vid.stderr, info.duration), timing), ...loudnessItems(m, parsePeak(aud.stderr))];
  return { items, loudness: m ? { I: m.I, TP: m.TP } : null };
}
