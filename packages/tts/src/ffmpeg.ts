// Gọi ffmpeg/ffprobe (dùng bản đi kèm ffmpeg-static để chạy được trên Windows không cần cài riêng).

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

function resolveBin(env: string, pkg: string, pick: (m: any) => string | undefined, fallback: string): string {
  if (process.env[env]) return process.env[env]!;
  try {
    const p = pick(require(pkg));
    if (p && existsSync(p)) return p;
  } catch {
    /* gói chưa cài – dùng bản hệ thống */
  }
  return fallback;
}

export const FFMPEG = resolveBin("FFMPEG_PATH", "ffmpeg-static", (m) => m?.default ?? m, "ffmpeg");
export const FFPROBE = resolveBin("FFPROBE_PATH", "ffprobe-static", (m) => m?.path, "ffprobe");

export type RunResult = { code: number; stdout: Buffer; stderr: string };

export function run(bin: string, args: string[], input?: Buffer): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: err }));
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

export async function ffmpeg(args: string[], input?: Buffer): Promise<RunResult> {
  const r = await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", ...args], input);
  if (r.code !== 0) throw new Error(`ffmpeg lỗi (${r.code}): ${r.stderr.split("\n").slice(-6).join("\n")}`);
  return r;
}

export const SAMPLE_RATE = 24000;

/** Giải mã file âm thanh bất kỳ → PCM float32 mono. */
export async function decodeToPcm(file: string, sampleRate = SAMPLE_RATE): Promise<Float32Array> {
  const r = await ffmpeg(["-i", file, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"]);
  const buf = r.stdout;
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** PCM float32 mono → WAV 16-bit. */
export function pcmToWav(pcm: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    data.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** WAV PCM 16-bit mono (như pcmToWav / máy chủ ZeroTTS trả về) → PCM float32 + tần số mẫu. */
export function wavToPcm(buf: Buffer): { pcm: Float32Array; sampleRate: number } {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Không phải file WAV");
  let p = 12;
  let sampleRate = 0;
  let fmtOk = false;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === "fmt ") {
      fmtOk = buf.readUInt16LE(p + 8) === 1 && buf.readUInt16LE(p + 10) === 1 && buf.readUInt16LE(p + 22) === 16;
      sampleRate = buf.readUInt32LE(p + 12);
    } else if (id === "data") {
      if (!fmtOk) throw new Error("WAV phải là PCM 16-bit mono");
      const n = Math.floor(Math.min(size, buf.length - p - 8) / 2);
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(p + 8 + i * 2) / 0x8000;
      return { pcm, sampleRate };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error("WAV thiếu phần dữ liệu");
}

/** Đổi tốc độ đọc, giữ cao độ (ffmpeg atempo, 0,5–2×). */
export async function atempo(pcm: Float32Array, sampleRate: number, speed: number): Promise<Float32Array> {
  const s = Math.max(0.5, Math.min(2, speed));
  if (Math.abs(s - 1) < 1e-3 || pcm.length === 0) return pcm;
  const r = await ffmpeg(
    ["-f", "f32le", "-ar", String(sampleRate), "-ac", "1", "-i", "pipe:0", "-filter:a", `atempo=${s.toFixed(4)}`, "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"],
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  );
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** WAV → MP3 160 kbps. */
export async function wavToMp3(wav: string, mp3: string): Promise<void> {
  await ffmpeg(["-i", wav, "-codec:a", "libmp3lame", "-b:a", "160k", mp3]);
}

export type ProbeInfo = { duration: number; streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] };

export async function probe(file: string): Promise<ProbeInfo> {
  const r = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  if (r.code !== 0) throw new Error(`ffprobe lỗi: ${r.stderr}`);
  const j = JSON.parse(r.stdout.toString());
  return { duration: Number(j.format?.duration ?? 0), streams: j.streams ?? [] };
}

/** ffmpeg silencedetect → danh sách đoạn im lặng [start, end]. */
export async function silenceDetect(file: string, noiseDb = -45, minDur = 0.15): Promise<{ start: number; end: number }[]> {
  const r = await run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=${minDur}`, "-f", "null", "-"]);
  const out: { start: number; end: number }[] = [];
  let cur: number | null = null;
  for (const line of r.stderr.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    if (s) cur = Number(s[1]);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (e) {
      out.push({ start: Math.max(0, cur ?? 0), end: Number(e[1]) });
      cur = null;
    }
  }
  if (cur !== null) out.push({ start: cur, end: Infinity });
  return out;
}
