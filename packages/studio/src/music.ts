// Nhạc nền: file tải lên của dự án (projects/<mã>/music/<hash>.mp3|wav) hoặc thư viện chung storage/am-nhac/
// (người dùng tự chép nhạc vào, mở từ giao diện). Trộn cuối: @cvs/tts finalizeAudio (chuẩn hoá giọng + nhạc nằm dưới giọng).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { sha1, writeFileAtomic, writeJsonAtomic, type MusicSettings } from "@cvs/core";
import { paths, STORAGE } from "@cvs/db";
import { finalizeAudio, LOUDNESS, probe, type MusicMix } from "@cvs/tts";

export const MAX_MUSIC_BYTES = 40 * 1024 * 1024;
export const musicLibraryDir = () => join(STORAGE, "am-nhac");
const projectMusicDir = (pid: string) => join(paths.project(pid), "music");
const PROJECT_ID_RE = /^[a-f0-9]{24}\.(mp3|wav)$/;
const LIB_RE = /^[^/\\\0]+\.(mp3|wav)$/i;

export class MusicError extends Error {}

export const DEFAULT_MUSIC: Omit<MusicSettings, "file" | "source"> = { volumeDb: -20, duck: true, fadeIn: 1, fadeOut: 1 };

/** Định dạng theo chữ ký file (không tin đuôi/MIME). */
export function musicFormat(b: Buffer): "mp3" | "wav" | null {
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (b.length >= 3 && b.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

export type MusicItem = { id: string; source: "project" | "library"; name: string; size: number; created: string };

/** Đường dẫn file nhạc nếu mã hợp lệ và có file (thư viện: chỉ tên file trực tiếp trong am-nhac/, không đi ra ngoài). */
export function musicFile(pid: string, source: string, id: string): string | null {
  if (source === "project") {
    if (!PROJECT_ID_RE.test(id)) return null;
    const f = join(projectMusicDir(pid), id);
    return existsSync(f) ? f : null;
  }
  if (source === "library") {
    if (!LIB_RE.test(id) || basename(id) !== id || id.startsWith(".")) return null;
    const f = join(musicLibraryDir(), id);
    return existsSync(f) && statSync(f).isFile() ? f : null;
  }
  return null;
}

export async function saveMusic(pid: string, name: string, data: Buffer): Promise<MusicItem> {
  if (data.length === 0) throw new MusicError("File rỗng");
  if (data.length > MAX_MUSIC_BYTES) throw new MusicError(`Nhạc quá lớn (${(data.length / 1048576).toFixed(1)} MB > 40 MB)`);
  const ext = musicFormat(data);
  if (!ext) throw new MusicError("Chỉ nhận nhạc MP3 hoặc WAV");
  const id = `${createHash("sha256").update(data).digest("hex").slice(0, 24)}.${ext}`;
  const dir = projectMusicDir(pid);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, id);
  if (!existsSync(f)) {
    writeFileAtomic(`${f}.check`, data);
    try {
      const info = await probe(`${f}.check`);
      if (!info.streams.some((s) => s.codec_type === "audio") || !(info.duration > 0.5)) throw new MusicError("File không đọc được như nhạc (không có luồng âm thanh)");
      renameSync(`${f}.check`, f);
    } finally {
      rmSync(`${f}.check`, { force: true });
    }
  }
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || id;
  if (!existsSync(`${f}.json`)) writeJsonAtomic(`${f}.json`, { name: clean, created: new Date().toISOString() });
  return describe(pid, "project", id)!;
}

function describe(pid: string, source: "project" | "library", id: string): MusicItem | null {
  const f = musicFile(pid, source, id);
  if (!f) return null;
  let side: { name?: string; created?: string } = {};
  if (source === "project")
    try {
      side = JSON.parse(readFileSync(`${f}.json`, "utf8"));
    } catch {
      /* thiếu thông tin phụ */
    }
  const st = statSync(f);
  return { id, source, name: side.name || id, size: st.size, created: side.created ?? st.mtime.toISOString() };
}

export function listMusic(pid: string): { project: MusicItem[]; library: MusicItem[]; libraryDir: string } {
  const lib = musicLibraryDir();
  mkdirSync(lib, { recursive: true });
  const ls = (dir: string, source: "project" | "library") =>
    existsSync(dir) ? readdirSync(dir).map((f) => describe(pid, source, f)).filter((x): x is MusicItem => !!x).sort((a, b) => a.name.localeCompare(b.name, "vi")) : [];
  return { project: ls(projectMusicDir(pid), "project"), library: ls(lib, "library"), libraryDir: lib };
}

export function deleteMusic(pid: string, id: string): boolean {
  const f = musicFile(pid, "project", id);
  if (!f) return false;
  rmSync(f, { force: true });
  rmSync(`${f}.json`, { force: true });
  return true;
}

const clamp = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);

/** Kiểm cài đặt nhạc từ giao diện. null = tắt nhạc nền. */
export function normalizeMusic(x: unknown): MusicSettings | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.file !== "string" || !o.file || (o.source !== "project" && o.source !== "library")) return null;
  return {
    file: o.file,
    source: o.source,
    volumeDb: clamp(o.volumeDb, -40, -6, DEFAULT_MUSIC.volumeDb),
    duck: o.duck !== false,
    fadeIn: clamp(o.fadeIn, 0, 10, DEFAULT_MUSIC.fadeIn),
    fadeOut: clamp(o.fadeOut, 0, 10, DEFAULT_MUSIC.fadeOut),
    ...(typeof o.license === "string" && o.license.trim() ? { license: o.license.trim().slice(0, 300) } : {}),
  };
}

/** Khoá trộn tiếng: đổi nhạc/mức/duck/mục tiêu âm lượng → bản render cũ cần trộn lại (không cần dựng lại hình). */
export function audioKey(pid: string, m: MusicSettings | null | undefined): string {
  const f = m ? musicFile(pid, m.source, m.file) : null;
  const { license: _l, ...rest } = m ?? ({} as Partial<MusicSettings>);
  return sha1(JSON.stringify({ v: 1, target: LOUDNESS, music: m && f ? { ...rest, size: statSync(f).size } : null })).slice(0, 16);
}

/** Bản dựng hình gốc (tiếng chưa trộn) – giữ lại để trộn lại tiếng mà không render lại khung hình. */
export const rawRender = (out: string) => join(out, "..", ".raw", basename(out));

/** Trộn tiếng cuối: raw → out (giọng −16 LUFS, nhạc nền nếu có). */
export async function mixFinal(pid: string, raw: string, out: string, total: number, m: MusicSettings | null | undefined, log: (s: string) => void = () => {}) {
  let mix: MusicMix | null = null;
  if (m) {
    const f = musicFile(pid, m.source, m.file);
    if (f) mix = { file: f, volumeDb: m.volumeDb, duck: m.duck, fadeIn: m.fadeIn, fadeOut: m.fadeOut };
    else log(`Không tìm thấy file nhạc nền ${m.file} – chỉ chuẩn hoá giọng\n`);
  }
  const part = `${out}.part.mp4`;
  const r = await finalizeAudio(raw, part, total, mix);
  rmSync(out, { force: true });
  renameSync(part, out);
  log(`trộn tiếng: giọng đo ${r.voice?.I.toFixed(1) ?? "?"} LUFS → ${LOUDNESS.I} LUFS${mix ? `, nhạc ${r.musicGainDb?.toFixed(1)} dB${mix.duck ? ", hạ khi có giọng" : ""}` : ""}\n`);
  return { ...r, music: !!mix, key: audioKey(pid, m) };
}
