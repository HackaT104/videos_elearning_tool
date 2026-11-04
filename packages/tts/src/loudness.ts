// Âm lượng chuẩn (EBU R128, −16 LUFS / −1,5 dBTP – mức thường dùng cho video web/e-learning) và nhạc nền nằm dưới giọng.
// Hai lượt: đo giọng (loudnorm print_format=json) → chuẩn hoá tuyến tính theo số đo; nhạc nén theo giọng (sidechaincompress).

import { ffmpeg, run, FFMPEG } from "./ffmpeg";

export const LOUDNESS = { I: -16, TP: -1.5, LRA: 11 } as const;

export type Loudness = { I: number; TP: number; LRA: number; thresh: number; offset: number };

/** Khối JSON cuối mà loudnorm in ra stderr (print_format=json). */
export function parseLoudnorm(stderr: string): Loudness | null {
  const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!m) return null;
  try {
    const j = JSON.parse(m[m.length - 1]);
    const n = (k: string) => Number(j[k]);
    return { I: n("input_i"), TP: n("input_tp"), LRA: n("input_lra"), thresh: n("input_thresh"), offset: n("target_offset") };
  } catch {
    return null;
  }
}

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "0");
const T = `I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;

/** Bộ lọc loudnorm: không có số đo → lượt đo; có → lượt chuẩn hoá tuyến tính. Giọng im lặng (−inf) → giữ nguyên. */
export function loudnormFilter(m?: Loudness | null): string {
  if (!m) return `loudnorm=${T}:print_format=json`;
  if (!Number.isFinite(m.I) || m.I < -70) return "anull";
  return `loudnorm=${T}:measured_I=${f2(m.I)}:measured_TP=${f2(m.TP)}:measured_LRA=${f2(m.LRA)}:measured_thresh=${f2(m.thresh)}:offset=${f2(m.offset)}:linear=true`;
}

/** Lượt đo: luồng âm thanh đầu tiên của file. */
export async function measureLoudness(file: string): Promise<Loudness | null> {
  const r = await run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-map", "0:a:0", "-af", loudnormFilter(), "-f", "null", "-"]);
  return parseLoudnorm(r.stderr);
}

export type MusicMix = { file: string; volumeDb: number; duck: boolean; fadeIn: number; fadeOut: number };

const STEREO = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
/** Trần mẫu sau khi trộn (thấp hơn −1,5 dBTP một chút vì alimiter đo theo mẫu, không theo đỉnh thật). */
export const LIMIT_DB = -2;

/**
 * filter_complex trộn cuối: [0:a] giọng (đã có trong video) → loudnorm; [1:a] nhạc (đã lặp bằng -stream_loop) → cắt đúng tổng
 * thời lượng, chỉnh mức (musicGainDb), fade, nén theo giọng khi duck → amix + alimiter. Ra nhãn [aout].
 */
export function mixGraph(total: number, voice: Loudness | null, music?: (MusicMix & { gainDb: number }) | null): string {
  const v = `[0:a]${STEREO},${loudnormFilter(voice)},${STEREO}`;
  if (!music) return `${v}[aout]`;
  const fi = Math.max(0, Math.min(music.fadeIn, total / 2));
  const fo = Math.max(0, Math.min(music.fadeOut, total / 2));
  const m = [`[1:a]${STEREO}`, `atrim=0:${total.toFixed(3)}`, "asetpts=N/SR/TB", `volume=${music.gainDb.toFixed(2)}dB`];
  if (fi > 0) m.push(`afade=t=in:st=0:d=${fi}`);
  if (fo > 0) m.push(`afade=t=out:st=${(total - fo).toFixed(3)}:d=${fo}`);
  const lim = `alimiter=limit=${Math.pow(10, LIMIT_DB / 20).toFixed(4)}:level=false`;
  if (!music.duck) return [`${v}[v]`, `${m.join(",")}[m]`, `[v][m]amix=inputs=2:normalize=0:duration=first,${lim}[aout]`].join(";");
  return [
    `${v},asplit=2[v][key]`,
    `${m.join(",")}[m]`,
    // giọng vượt ngưỡng (~−30 dBFS) → nhạc hạ ~8–10 dB; nhả chậm để nhạc lên lại êm giữa các câu
    "[m][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md]",
    `[v][md]amix=inputs=2:normalize=0:duration=first,${lim}[aout]`,
  ].join(";");
}

/** Mức chỉnh nhạc (dB) để nhạc nằm dưới giọng chuẩn volumeDb (mặc định −20 LU). */
export function musicGainDb(music: Loudness | null, volumeDb: number): number {
  if (!music || !Number.isFinite(music.I)) return volumeDb;
  return Math.max(-60, Math.min(20, LOUDNESS.I + volumeDb - music.I));
}

/**
 * Trộn tiếng cuối cho file đã render (giữ nguyên hình, -c:v copy): chuẩn hoá giọng −16 LUFS, thêm nhạc nền (tuỳ chọn).
 * Trả số đo giọng trước khi chuẩn hoá.
 */
export async function finalizeAudio(src: string, out: string, total: number, music?: MusicMix | null): Promise<{ voice: Loudness | null; musicGainDb?: number }> {
  const voice = await measureLoudness(src);
  let mm: (MusicMix & { gainDb: number }) | null = null;
  if (music) mm = { ...music, gainDb: musicGainDb(await measureLoudness(music.file), music.volumeDb) };
  const inputs = ["-i", src, ...(mm ? ["-stream_loop", "-1", "-i", mm.file] : [])];
  await ffmpeg([...inputs, "-filter_complex", mixGraph(total, voice, mm), "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", total.toFixed(3), "-movflags", "+faststart", out]);
  return { voice, musicGainDb: mm?.gainDb };
}

export type Ebur128 = { I: number; LRA: number; TP: number };

/** Phần "Summary" của ebur128=peak=true. */
export function parseEbur128(stderr: string): Ebur128 | null {
  const s = stderr.slice(stderr.lastIndexOf("Summary:"));
  if (!s.startsWith("Summary:")) return null;
  const num = (re: RegExp) => {
    const m = s.match(re);
    return m ? (m[1] === "-inf" ? -Infinity : Number(m[1])) : NaN;
  };
  return { I: num(/I:\s+(-?[\d.]+|-inf) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}
