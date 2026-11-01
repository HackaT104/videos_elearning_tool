// SQLite (better-sqlite3): projects, files, videos, jobs, glossary, voices.
// Video JSON (cảnh, câu, thiết kế) là nguồn sự thật – lưu trong cột data và đồng thời ghi data/<mã>.json (nguyên tử).

import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic, type EngineId, type GlossaryEntry, type StyleId, type Video, type VoiceProvider } from "@cvs/core";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const STORAGE = resolve(process.env.CVS_STORAGE || join(REPO_ROOT, "storage"));

export const paths = {
  project: (pid: string) => join(STORAGE, "projects", pid),
  source: (pid: string) => join(STORAGE, "projects", pid, "source"),
  data: (pid: string, key?: string) => join(STORAGE, "projects", pid, "data", key ? `${key}.json` : ""),
  vo: (pid: string, key: string) => join(STORAGE, "projects", pid, "vo", key),
  frames: (pid: string, key: string) => join(STORAGE, "projects", pid, "frames", key),
  work: (pid: string, key: string, engine: EngineId) => join(STORAGE, "projects", pid, engine === "remotion" ? "rmt" : "hf", key),
  render: (pid: string, key: string) => join(STORAGE, "projects", pid, "render", `${key}.mp4`),
  out: (pid: string) => join(STORAGE, "projects", pid, "out"),
  archive: (pid: string) => join(STORAGE, "projects", pid, "_luu_tru"),
  samples: () => join(STORAGE, "samples"),
  styles: () => join(STORAGE, "styles"),
};

export type ProjectSettings = {
  style: StyleId;
  engine: EngineId;
  provider: VoiceProvider;
  /** Dùng AI (Claude) để thiết kế cảnh khi có khóa API. */
  aiDesign: boolean;
  /** Soát bằng hình (vision) trong QA. */
  aiVision: boolean;
  hfRenderer: "auto" | "cli" | "fallback";
  /** Người dùng đã chọn phong cách từ 10 mẫu (bắt buộc trước khi render). */
  styleConfirmed?: boolean;
  /** Tuỳ chọn CIT mặc định cho dự án. */
  cit?: { temperature?: number; seed?: number | null; useDict?: boolean };
};

export type Project = { id: string; name: string; course: string; levels: string[]; settings: ProjectSettings; created_at: string };
export type SourceFile = { id: string; project_id: string; name: string; level: string; kind: string; summary: unknown; created_at: string };
export type VideoStatus = "new" | "script" | "voiced" | "designed" | "rendered" | "approved" | "failed";
export type VideoRow = {
  project_id: string;
  key: string;
  level: string;
  title: string;
  file_id: string | null;
  include: boolean;
  existing: boolean;
  status: VideoStatus;
  approved: boolean;
  data: Video;
  qa: unknown | null;
  updated_at: string;
};
export type JobKind = "agent" | "produce" | "voice" | "visual" | "render" | "design" | "ai-script" | "theme-preview" | "voice-sample" | "revise";
export type JobStatus = "queued" | "running" | "done" | "failed" | "paused" | "canceled";
export type Job = {
  id: number;
  project_id: string;
  video_key: string | null;
  kind: JobKind;
  status: JobStatus;
  step: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  payload: any;
  result: any;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_SETTINGS: ProjectSettings = { style: "giay-ky-thuat", engine: "hyperframes", provider: "cit", aiDesign: true, aiVision: true, hfRenderer: "auto" };

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(STORAGE, { recursive: true });
  db = new Database(join(STORAGE, "studio.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, course TEXT NOT NULL, levels TEXT NOT NULL, settings TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, level TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS videos (project_id TEXT NOT NULL, key TEXT NOT NULL, level TEXT NOT NULL, title TEXT NOT NULL, file_id TEXT, include INTEGER NOT NULL DEFAULT 1,
      existing INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new', approved INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, qa TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (project_id, key));
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, video_key TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, step TEXT, progress REAL NOT NULL DEFAULT 0,
      message TEXT, error TEXT, payload TEXT, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
    CREATE TABLE IF NOT EXISTS glossary (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, term TEXT NOT NULL, reading TEXT NOT NULL, case_sensitive INTEGER NOT NULL DEFAULT 0, note TEXT);
    CREATE TABLE IF NOT EXISTS voices (provider TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, gender TEXT, PRIMARY KEY (provider, id));
  `);
  const vcols = (db.prepare("PRAGMA table_info(voices)").all() as { name: string }[]).map((c) => c.name);
  if (!vcols.includes("region")) db.exec("ALTER TABLE voices ADD COLUMN region TEXT");
  if (!vcols.includes("description")) db.exec("ALTER TABLE voices ADD COLUMN description TEXT");
  if (!vcols.includes("cloned")) db.exec("ALTER TABLE voices ADD COLUMN cloned INTEGER");
  return db;
}

const now = () => new Date().toISOString();
const j = (s: string | null) => (s ? JSON.parse(s) : null);

// ---------- projects ----------
export function createProject(name: string, course: string, levels: string[], settings: Partial<ProjectSettings> = {}): Project {
  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex")}`;
  const p: Project = { id, name, course: course.toUpperCase(), levels, settings: { ...DEFAULT_SETTINGS, ...settings }, created_at: now() };
  getDb().prepare("INSERT INTO projects VALUES (?,?,?,?,?,?)").run(p.id, p.name, p.course, JSON.stringify(p.levels), JSON.stringify(p.settings), p.created_at);
  for (const d of [paths.source(id), paths.data(id), paths.out(id)]) mkdirSync(d, { recursive: true });
  return p;
}
const rowProject = (r: any): Project => ({ ...r, levels: JSON.parse(r.levels), settings: { ...DEFAULT_SETTINGS, ...JSON.parse(r.settings) } });
export function listProjects(): Project[] {
  return getDb().prepare("SELECT * FROM projects ORDER BY created_at DESC").all().map(rowProject);
}
export function getProject(id: string): Project | null {
  const r = getDb().prepare("SELECT * FROM projects WHERE id=?").get(id);
  return r ? rowProject(r) : null;
}
export function updateProject(id: string, patch: Partial<Pick<Project, "name" | "course" | "levels">> & { settings?: Partial<ProjectSettings> }) {
  const p = getProject(id);
  if (!p) throw new Error("Không tìm thấy dự án");
  const next = { ...p, ...patch, settings: { ...p.settings, ...(patch.settings ?? {}) } };
  getDb().prepare("UPDATE projects SET name=?, course=?, levels=?, settings=? WHERE id=?").run(next.name, next.course, JSON.stringify(next.levels), JSON.stringify(next.settings), id);
  return next;
}

// ---------- files ----------
export function addFile(project_id: string, name: string, level: string, kind: string, summary: unknown): SourceFile {
  const f: SourceFile = { id: randomBytes(5).toString("hex"), project_id, name, level, kind, summary, created_at: now() };
  getDb().prepare("INSERT INTO files VALUES (?,?,?,?,?,?,?)").run(f.id, project_id, name, level, kind, JSON.stringify(summary), f.created_at);
  return f;
}
export function listFiles(project_id: string): SourceFile[] {
  return getDb().prepare("SELECT * FROM files WHERE project_id=? ORDER BY created_at").all(project_id).map((r: any) => ({ ...r, summary: j(r.summary) }));
}
export function deleteFile(project_id: string, id: string) {
  getDb().prepare("DELETE FROM files WHERE project_id=? AND id=?").run(project_id, id);
}

// ---------- videos ----------
const rowVideo = (r: any): VideoRow => ({ ...r, include: !!r.include, existing: !!r.existing, approved: !!r.approved, data: JSON.parse(r.data), qa: j(r.qa) });

export function upsertVideo(project_id: string, video: Video, o: { file_id?: string | null; status?: VideoStatus } = {}) {
  const d = getDb();
  const cur = d.prepare("SELECT file_id, status FROM videos WHERE project_id=? AND key=?").get(project_id, video.key) as any;
  d.prepare(
    `INSERT INTO videos (project_id, key, level, title, file_id, status, data, updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(project_id, key) DO UPDATE SET level=excluded.level, title=excluded.title, file_id=excluded.file_id, status=excluded.status, data=excluded.data, updated_at=excluded.updated_at`,
  ).run(project_id, video.key, video.level, video.title, o.file_id ?? cur?.file_id ?? null, o.status ?? cur?.status ?? "script", JSON.stringify(video), now());
  writeJsonAtomic(paths.data(project_id, video.key), video);
}
export function listVideos(project_id: string): VideoRow[] {
  return getDb().prepare("SELECT * FROM videos WHERE project_id=? ORDER BY level, key").all(project_id).map(rowVideo);
}
export function getVideo(project_id: string, key: string): VideoRow | null {
  const r = getDb().prepare("SELECT * FROM videos WHERE project_id=? AND key=?").get(project_id, key);
  return r ? rowVideo(r) : null;
}
export function saveVideoData(project_id: string, video: Video) {
  upsertVideo(project_id, video);
}
export function setVideoFlags(project_id: string, key: string, f: Partial<{ include: boolean; existing: boolean; approved: boolean; status: VideoStatus }>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    sets.push(`${k}=?`);
    vals.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
  }
  if (!sets.length) return;
  getDb().prepare(`UPDATE videos SET ${sets.join(", ")}, updated_at=? WHERE project_id=? AND key=?`).run(...vals, now(), project_id, key);
}
export function setVideoQa(project_id: string, key: string, qa: unknown) {
  getDb().prepare("UPDATE videos SET qa=?, updated_at=? WHERE project_id=? AND key=?").run(JSON.stringify(qa), now(), project_id, key);
}
export function deleteVideo(project_id: string, key: string) {
  getDb().prepare("DELETE FROM videos WHERE project_id=? AND key=?").run(project_id, key);
}

// ---------- jobs ----------
const rowJob = (r: any): Job => ({ ...r, payload: j(r.payload), result: j(r.result) });
export function enqueueJob(project_id: string, kind: JobKind, video_key: string | null, payload: unknown = {}): Job {
  const t = now();
  const info = getDb().prepare("INSERT INTO jobs (project_id, video_key, kind, status, payload, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(project_id, video_key, kind, "queued", JSON.stringify(payload), t, t);
  return getJob(Number(info.lastInsertRowid))!;
}
export function getJob(id: number): Job | null {
  const r = getDb().prepare("SELECT * FROM jobs WHERE id=?").get(id);
  return r ? rowJob(r) : null;
}
export function listJobs(project_id: string, limit = 200): Job[] {
  return getDb().prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY id DESC LIMIT ?").all(project_id, limit).map(rowJob);
}
/** Lấy job đang chờ (nguyên tử) – tối đa `max` job chạy cùng lúc, không chạy 2 job cùng video. */
export function claimNextJob(running: { video_key: string | null }[]): Job | null {
  const d = getDb();
  return d.transaction(() => {
    const busy = new Set(running.map((r) => r.video_key).filter(Boolean));
    const cands = d.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY id LIMIT 50").all().map(rowJob);
    const job = cands.find((c) => !c.video_key || !busy.has(c.video_key));
    if (!job) return null;
    d.prepare("UPDATE jobs SET status='running', updated_at=? WHERE id=?").run(now(), job.id);
    return { ...job, status: "running" as const };
  })();
}
export function updateJob(id: number, patch: Partial<Pick<Job, "status" | "step" | "progress" | "message" | "error" | "result">>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${k}=?`);
    vals.push(k === "result" ? JSON.stringify(v) : v);
  }
  getDb().prepare(`UPDATE jobs SET ${sets.join(", ")}, updated_at=? WHERE id=?`).run(...vals, now(), id);
}
/** Khi worker khởi động lại: job đang chạy dở → xếp lại hàng (bỏ qua cảnh đã có hash đúng). */
export function requeueStale() {
  getDb().prepare("UPDATE jobs SET status='queued', message='Tiếp tục sau khi khởi động lại' WHERE status='running'").run();
}
export function activeJobFor(project_id: string, key: string): Job | null {
  const r = getDb().prepare("SELECT * FROM jobs WHERE project_id=? AND video_key=? AND status IN ('queued','running','paused') ORDER BY id DESC LIMIT 1").get(project_id, key);
  return r ? rowJob(r) : null;
}

// ---------- glossary ----------
export function listGlossary(project_id: string | null): (GlossaryEntry & { id: number; project_id: string | null })[] {
  const rows = project_id === null ? getDb().prepare("SELECT * FROM glossary WHERE project_id IS NULL ORDER BY term").all() : getDb().prepare("SELECT * FROM glossary WHERE project_id=? ORDER BY term").all(project_id);
  return rows.map((r: any) => ({ id: r.id, project_id: r.project_id, term: r.term, reading: r.reading, caseSensitive: !!r.case_sensitive, note: r.note ?? undefined }));
}
/** Bảng dùng chung + bảng dự án (dự án ghi đè). */
export function glossaryFor(project_id: string): GlossaryEntry[] {
  return [...listGlossary(null), ...listGlossary(project_id)];
}
export function addGlossary(project_id: string | null, e: GlossaryEntry) {
  getDb().prepare("INSERT INTO glossary (project_id, term, reading, case_sensitive, note) VALUES (?,?,?,?,?)").run(project_id, e.term, e.reading, e.caseSensitive ? 1 : 0, e.note ?? null);
}
export function deleteGlossary(id: number) {
  getDb().prepare("DELETE FROM glossary WHERE id=?").run(id);
}

// ---------- voices ----------
export type VoiceRow = { provider: string; id: string; name: string; gender: string | null; region: string | null; description: string | null; cloned: number | null };
export function cacheVoices(provider: string, voices: { id: string; name: string; gender?: string; region?: string; description?: string; cloned?: boolean }[]) {
  const d = getDb();
  d.transaction(() => {
    d.prepare("DELETE FROM voices WHERE provider=?").run(provider);
    for (const v of voices)
      d.prepare("INSERT OR REPLACE INTO voices (provider, id, name, gender, region, description, cloned) VALUES (?,?,?,?,?,?,?)").run(provider, v.id, v.name, v.gender ?? null, v.region ?? null, v.description ?? null, v.cloned ? 1 : 0);
  })();
}
export function listVoices(provider?: string) {
  return (provider ? getDb().prepare("SELECT * FROM voices WHERE provider=?").all(provider) : getDb().prepare("SELECT * FROM voices").all()) as VoiceRow[];
}
