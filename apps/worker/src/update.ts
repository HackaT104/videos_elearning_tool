// Cập nhật bản cài Windows: hỏi GitHub Releases (repo riêng tư → cần mã truy cập), tải Setup.exe, kiểm SHA-256 theo latest.json,
// chạy cài im lặng rồi thoát (bộ cài tự mở lại ứng dụng). Mã truy cập lưu trong storage/settings.json, không bao giờ ghi log/trả về.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, createWriteStream, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { REPO_ROOT, STORAGE } from "@cvs/db";
import { quitApp } from "./desktop";

export const APP_VERSION: string = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
export const updateRepo = () => process.env.CVS_UPDATE_REPO || "HackaT104/videos_elearning_tool";
const SETTINGS_FILE = join(STORAGE, "settings.json");
const DAY = 24 * 3600_000;

// ---------- phiên bản ----------
type Ver = { nums: number[]; pre: string[] };
export function parseVersion(v: string): Ver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v).trim());
  return m ? { nums: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split(".") : [] } : null;
}
/** >0 nếu a mới hơn b (semver: 1.0.0-beta < 1.0.0). Chuỗi không hợp lệ coi như 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a) ?? { nums: [0, 0, 0], pre: [] };
  const y = parseVersion(b) ?? { nums: [0, 0, 0], pre: [] };
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// ---------- latest.json ----------
export type LatestInfo = { version: string; url: string; sha256: string; notes: string };
export function parseLatestJson(raw: unknown): LatestInfo {
  const j = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") throw new Error("latest.json không hợp lệ");
  const version = String(j.version ?? "").replace(/^v/, "");
  if (!parseVersion(version)) throw new Error(`latest.json: phiên bản không hợp lệ "${version}"`);
  const url = String(j.url ?? "");
  if (!/^https:\/\/\S+\.exe$/i.test(url)) throw new Error("latest.json: thiếu đường dẫn Setup.exe");
  const sha256 = String(j.sha256 ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("latest.json: thiếu mã SHA-256 hợp lệ");
  return { version, url, sha256, notes: typeof j.notes === "string" ? j.notes.slice(0, 4000) : "" };
}

// ---------- GitHub ----------
type Asset = { name: string; url: string; size: number };
export type Release = { info: LatestInfo; setup: Asset; tag: string };

const ghHeaders = (token: string | undefined, accept: string): Record<string, string> => ({
  accept,
  "user-agent": "CourseVideoStudio-updater",
  "x-github-api-version": "2022-11-28",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

function ghError(status: number, token: string | undefined, repo: string, res?: Response): Error {
  if (status === 404)
    return new Error(token ? `Không thấy bản phát hành của ${repo}: chưa có bản nào, hoặc mã truy cập không đọc được repo này` : "Repo riêng tư – cần mã truy cập (hoặc chưa có bản phát hành nào)");
  if (status === 401) return new Error("Mã truy cập không hợp lệ hoặc đã hết hạn – tạo mã mới");
  if ((status === 403 || status === 429) && res?.headers.get("x-ratelimit-remaining") === "0") return new Error("GitHub tạm giới hạn lượt hỏi – thử lại sau ít phút");
  if (status === 403) return new Error("Mã truy cập không có quyền đọc Releases (cần quyền Contents: Read-only)");
  return new Error(`GitHub trả lỗi ${status}`);
}

async function ghFetch(f: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new Error(`Không kết nối được GitHub: ${(e as Error).message}`);
  }
}

/** Hỏi bản phát hành mới nhất; tải latest.json (qua API asset – chạy được với repo riêng tư). */
export async function fetchLatestRelease(opts: { repo: string; token?: string; fetch?: typeof fetch }): Promise<Release> {
  const f = opts.fetch ?? fetch;
  if (!/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) throw new Error(`Tên repo không hợp lệ: ${opts.repo}`);
  const res = await ghFetch(f, `https://api.github.com/repos/${opts.repo}/releases/latest`, { headers: ghHeaders(opts.token, "application/vnd.github+json") });
  if (!res.ok) throw ghError(res.status, opts.token, opts.repo, res);
  const rel = (await res.json()) as { tag_name?: string; assets?: { name: string; url: string; size: number }[] };
  const assets = (rel.assets ?? []).map((a) => ({ name: String(a.name), url: String(a.url), size: Number(a.size) || 0 }));
  const lj = assets.find((a) => a.name === "latest.json");
  if (!lj) throw new Error(`Bản phát hành ${rel.tag_name ?? ""} thiếu latest.json`);
  const r2 = await ghFetch(f, lj.url, { headers: ghHeaders(opts.token, "application/octet-stream") });
  if (!r2.ok) throw ghError(r2.status, opts.token, opts.repo, r2);
  const info = parseLatestJson(await r2.text());
  const want = decodeURIComponent(basename(new URL(info.url).pathname));
  const setup = assets.find((a) => a.name === want) ?? assets.find((a) => /setup.*\.exe$/i.test(a.name));
  if (!setup) throw new Error(`Bản phát hành ${rel.tag_name ?? ""} thiếu tệp ${want}`);
  return { info, setup, tag: String(rel.tag_name ?? "") };
}

/** Tải Setup.exe về thư mục tạm, băm SHA-256 trong lúc tải; sai mã → xoá tệp và báo lỗi. */
export async function downloadSetup(rel: Release, opts: { token?: string; fetch?: typeof fetch; dir?: string; onProgress?: (pct: number) => void }): Promise<string> {
  const f = opts.fetch ?? fetch;
  const dir = opts.dir ?? join(tmpdir(), "course-video-studio-update");
  mkdirSync(dir, { recursive: true });
  if (!/^[\w.-]+\.exe$/i.test(rel.setup.name)) throw new Error("Tên tệp cài đặt không hợp lệ");
  const file = join(dir, rel.setup.name);
  const part = `${file}.part`;
  // API asset + octet-stream → GitHub chuyển hướng sang máy chủ tệp (fetch tự bỏ header Authorization khi đổi máy chủ)
  const res = await ghFetch(f, rel.setup.url, { headers: ghHeaders(opts.token, "application/octet-stream"), signal: AbortSignal.timeout(60 * 60_000) });
  if (!res.ok || !res.body) throw ghError(res.status, opts.token, updateRepo(), res);
  const total = Number(res.headers.get("content-length")) || rel.setup.size;
  const hash = createHash("sha256");
  const out = createWriteStream(part);
  let got = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
      if (total) opts.onProgress?.(Math.min(99, Math.round((got / total) * 100)));
    }
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  } catch (e) {
    out.destroy();
    rmSync(part, { force: true });
    throw new Error(`Tải bản cập nhật bị ngắt: ${(e as Error).message}`);
  }
  if (hash.digest("hex") !== rel.info.sha256) {
    rmSync(part, { force: true });
    throw new Error("Tệp tải về không khớp SHA-256 – đã huỷ. Hãy thử lại.");
  }
  renameSync(part, file);
  opts.onProgress?.(100);
  return file;
}

// ---------- cài đặt của ứng dụng (storage/settings.json, dùng chung với Claude Code) ----------
type Saved = { updateToken?: string; updateAutoCheck?: boolean; updateLastCheck?: string; updateLatest?: LatestInfo | null };
function readSettings(): Record<string, unknown> & Saved {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeSettings(patch: Saved) {
  const j = { ...readSettings(), ...patch };
  for (const k of Object.keys(patch) as (keyof Saved)[]) if (patch[k] === undefined) delete j[k];
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(j, null, 2));
  try {
    chmodSync(SETTINGS_FILE, 0o600);
  } catch {
    /* Windows */
  }
}
const token = () => readSettings().updateToken || process.env.CVS_UPDATE_TOKEN || undefined;

export function saveUpdateSettings(b: { token?: unknown; autoCheck?: unknown }) {
  const patch: Saved = {};
  if (b.token !== undefined) {
    const t = String(b.token ?? "").trim();
    if (t && !/^[A-Za-z0-9_]{20,255}$/.test(t)) throw new Error("Mã truy cập không đúng định dạng (dạng github_pat_… hoặc ghp_…)");
    patch.updateToken = t || undefined;
  }
  if (typeof b.autoCheck === "boolean") patch.updateAutoCheck = b.autoCheck;
  writeSettings(patch);
}

// ---------- trạng thái + hành động cho API ----------
const st = { checking: false, downloading: false, progress: 0, error: null as string | null, message: "" };
/** Chỉ bản cài Windows (launcher đặt CVS_DESKTOP=1) mới tự cài được; bản mã nguồn cập nhật bằng git pull. */
export const canInstall = () => process.platform === "win32" && process.env.CVS_DESKTOP === "1";

export function updateStatus() {
  const s = readSettings();
  const latest = s.updateLatest ?? null;
  return {
    current: APP_VERSION,
    repo: updateRepo(),
    latest,
    available: !!latest && compareVersions(latest.version, APP_VERSION) > 0,
    lastCheck: s.updateLastCheck ?? null,
    autoCheck: s.updateAutoCheck !== false,
    hasToken: !!s.updateToken,
    tokenFromEnv: !s.updateToken && !!process.env.CVS_UPDATE_TOKEN,
    canInstall: canInstall(),
    ...st,
  };
}

export async function checkForUpdate(f?: typeof fetch) {
  if (st.checking) return updateStatus();
  st.checking = true;
  st.error = null;
  try {
    const rel = await fetchLatestRelease({ repo: updateRepo(), token: token(), fetch: f });
    writeSettings({ updateLatest: rel.info, updateLastCheck: new Date().toISOString() });
  } catch (e) {
    st.error = (e as Error).message;
    writeSettings({ updateLastCheck: new Date().toISOString() });
  } finally {
    st.checking = false;
  }
  return updateStatus();
}

/** Tải + kiểm tra + chạy bộ cài im lặng, rồi thoát ứng dụng (chạy nền; giao diện đọc tiến độ qua updateStatus). */
export function installUpdate(f?: typeof fetch): { ok: boolean; error?: string } {
  if (!canInstall()) return { ok: false, error: "Chỉ bản cài trên Windows mới tự cập nhật được. Bản mã nguồn: dùng git pull rồi chạy lại KHOI_DONG.cmd." };
  if (st.downloading) return { ok: true };
  st.downloading = true;
  st.progress = 0;
  st.error = null;
  st.message = "Đang hỏi bản mới…";
  (async () => {
    const rel = await fetchLatestRelease({ repo: updateRepo(), token: token(), fetch: f });
    if (compareVersions(rel.info.version, APP_VERSION) <= 0) throw new Error(`Đang dùng bản mới nhất (${APP_VERSION})`);
    st.message = `Đang tải bản ${rel.info.version}…`;
    const file = await downloadSetup(rel, { token: token(), fetch: f, onProgress: (p) => (st.progress = p) });
    st.message = "Đang cài – ứng dụng sẽ tự mở lại sau khi cài xong";
    // /AUTOSTART=1: bộ cài mở lại ứng dụng sau khi cài im lặng ([Run] trong CourseVideoStudio.iss)
    spawn(file, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/CLOSEAPPLICATIONS", "/NORESTART", "/AUTOSTART=1"], { detached: true, stdio: "ignore" }).unref();
    quitApp();
  })().catch((e) => {
    st.error = (e as Error).message;
    st.message = "";
    st.downloading = false;
  });
  return { ok: true };
}

/** Tự hỏi bản mới khi khởi động, tối đa một lần mỗi ngày (tắt được trong Cài đặt). */
export function startAutoUpdateCheck() {
  const tick = () => {
    const s = updateStatus();
    if (s.autoCheck && (!s.lastCheck || Date.now() - Date.parse(s.lastCheck) > DAY)) void checkForUpdate();
  };
  setTimeout(tick, 15_000).unref();
  setInterval(tick, 6 * 3600_000).unref();
}
