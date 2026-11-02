// CIT Voice Studio là thành phần bắt buộc nằm trong ứng dụng: tự tải bộ cài chính thức, cài vào vendor/cit,
// tự khởi động cùng worker, theo dõi và bật lại khi bị tắt.
// Nguồn: https://github.com/Cuongyd196/cit-voice-studio (Releases). Dùng CIT nghĩa là đồng ý Điều khoản sử dụng của CIT.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch } from "undici";
import { CitClient } from "./cit";

export const CIT_VERSION = process.env.CVS_CIT_VERSION || "1.0.4";
export const CIT_REPO = "Cuongyd196/cit-voice-studio";
export const CIT_TERMS_URL = `https://github.com/${CIT_REPO}/blob/main/DIEU-KHOAN.md`;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const CIT_DIR = resolve(process.env.CVS_CIT_DIR || join(REPO_ROOT, "vendor", "cit"));

export type CitManagerState = {
  platform: NodeJS.Platform;
  installed: boolean;
  executable: string | null;
  running: boolean;
  /** Ứng dụng đang tự quản lý (đã khởi động) tiến trình CIT. */
  managed: boolean;
  installing: boolean;
  progress: number;
  message: string;
  error: string | null;
  version: string;
};

const state: CitManagerState = {
  platform: process.platform,
  installed: false,
  executable: null,
  running: false,
  managed: false,
  installing: false,
  progress: 0,
  message: "",
  error: null,
  version: CIT_VERSION,
};
let child: ChildProcess | null = null;
let watchdog: NodeJS.Timeout | null = null;
let starting: Promise<boolean> | null = null;

function assetName(): string {
  if (process.platform === "win32") return `CIT-Voice-Studio-v${CIT_VERSION}-win-x86_64.exe`;
  if (process.platform === "linux") return `CIT-Voice-Studio-v${CIT_VERSION}-amd64.deb`;
  if (process.platform === "darwin") return `CIT-Voice-Studio-v${CIT_VERSION}-macos-${process.arch === "arm64" ? "arm64" : "x86_64"}.dmg`;
  throw new Error(`Hệ điều hành ${process.platform} chưa được CIT Voice Studio hỗ trợ`);
}

function walk(dir: string, depth: number, pick: (p: string) => boolean): string | null {
  if (!existsSync(dir) || depth < 0) return null;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isFile() && pick(p)) return p;
  }
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    try {
      if (statSync(p).isDirectory()) {
        const hit = walk(p, depth - 1, pick);
        if (hit) return hit;
      }
    } catch {
      /* bỏ qua */
    }
  }
  return null;
}

/** Tìm file chạy CIT: thư mục của ứng dụng trước, rồi vị trí cài đặt mặc định. */
export function findCitExecutable(): string | null {
  if (process.env.CVS_CIT_EXE && existsSync(process.env.CVS_CIT_EXE)) return process.env.CVS_CIT_EXE;
  if (process.platform === "win32") {
    const isExe = (p: string) => /\.exe$/i.test(p) && /cit.*voice/i.test(p.split(/[\\/]/).pop()!) && !/unins/i.test(p);
    const roots = [join(CIT_DIR, "app"), join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Programs", "CIT Voice Studio")];
    for (const r of roots) {
      const hit = walk(r, 2, isExe);
      if (hit) return hit;
    }
    return null;
  }
  if (process.platform === "linux") {
    for (const p of [join(CIT_DIR, "app", "opt", "cit-voice-studio", "CIT-Voice-Studio"), "/opt/cit-voice-studio/CIT-Voice-Studio"]) if (existsSync(p)) return p;
    return null;
  }
  if (process.platform === "darwin") {
    for (const app of [join(CIT_DIR, "app", "CIT Voice Studio.app"), "/Applications/CIT Voice Studio.app"]) {
      const hit = walk(join(app, "Contents", "MacOS"), 0, () => true);
      if (hit) return hit;
    }
  }
  return null;
}

export function citManagerState(): CitManagerState {
  state.executable = findCitExecutable();
  state.installed = !!state.executable;
  return { ...state };
}

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "";
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", fail);
    p.on("close", (c) => (c === 0 ? ok() : fail(new Error(`${cmd} lỗi (${c}): ${err.slice(-400)}`))));
  });
}

/** Tải và cài CIT Voice Studio vào thư mục của ứng dụng (không cần quyền quản trị). */
export async function installCit(onProgress?: (pct: number, msg: string) => void): Promise<string> {
  if (state.installing) throw new Error("Đang cài CIT Voice Studio");
  state.installing = true;
  state.error = null;
  const report = (pct: number, msg: string) => {
    state.progress = pct;
    state.message = msg;
    onProgress?.(pct, msg);
  };
  try {
    const name = assetName();
    const url = `https://github.com/${CIT_REPO}/releases/download/${CIT_VERSION}/${name}`;
    const dl = join(CIT_DIR, "download");
    mkdirSync(dl, { recursive: true });
    const file = join(dl, name);
    if (!existsSync(file)) {
      report(1, `Đang tải ${name}…`);
      const res = await fetch(url, { dispatcher: new Agent({ headersTimeout: 120_000, bodyTimeout: 30 * 60_000 }) });
      if (!res.ok || !res.body) throw new Error(`Không tải được bộ cài CIT (HTTP ${res.status}) từ ${url}`);
      const total = Number(res.headers.get("content-length") ?? 0);
      const part = `${file}.part`;
      const out = createWriteStream(part);
      let got = 0;
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        got += chunk.length;
        if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
        if (total) report(Math.min(80, Math.round((got / total) * 80)), `Đang tải CIT Voice Studio ${Math.round(got / 1e6)}/${Math.round(total / 1e6)} MB`);
      }
      await new Promise<void>((r, f) => out.end((e?: Error | null) => (e ? f(e) : r())));
      const { renameSync } = await import("node:fs");
      renameSync(part, file);
    }
    report(82, "Đang cài CIT Voice Studio…");
    const target = join(CIT_DIR, "app");
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    if (process.platform === "win32") {
      // Bộ cài Inno Setup: cài im lặng cho người dùng hiện tại, vào thư mục của ứng dụng.
      await run(file, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CURRENTUSER", "/NOICONS", `/DIR=${target}`]);
    } else if (process.platform === "linux") {
      // Giải nén gói .deb, không cần sudo.
      await run("dpkg-deb", ["-x", file, target]);
    } else {
      const mnt = join(CIT_DIR, "mnt");
      mkdirSync(mnt, { recursive: true });
      await run("hdiutil", ["attach", "-nobrowse", "-quiet", "-mountpoint", mnt, file]);
      try {
        await run("cp", ["-R", join(mnt, "CIT Voice Studio.app"), target]);
      } finally {
        await run("hdiutil", ["detach", "-quiet", mnt]).catch(() => undefined);
      }
      await run("xattr", ["-dr", "com.apple.quarantine", join(target, "CIT Voice Studio.app")]).catch(() => undefined);
    }
    const exe = findCitExecutable();
    if (!exe) throw new Error("Cài xong nhưng không tìm thấy file chạy CIT Voice Studio");
    writeFileSync(join(CIT_DIR, "VERSION"), CIT_VERSION);
    report(100, "Đã cài CIT Voice Studio");
    return exe;
  } catch (e) {
    state.error = (e as Error).message;
    throw e;
  } finally {
    state.installing = false;
  }
}

async function waitHealthy(timeoutMs: number): Promise<boolean> {
  const cit = new CitClient({ retries: 0 });
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await cit.status()).ok) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** Bảo đảm CIT đang chạy: đã có (người dùng tự mở) → dùng luôn; chưa → khởi động bản trong ứng dụng. */
export async function ensureCitRunning(opts: { autoInstall?: boolean; timeoutMs?: number } = {}): Promise<boolean> {
  if (starting) return starting;
  starting = (async () => {
    const cit = new CitClient({ retries: 0 });
    if ((await cit.status()).ok) {
      state.running = true;
      state.error = null;
      return true;
    }
    let exe = findCitExecutable();
    if (!exe && opts.autoInstall) exe = await installCit();
    if (!exe) {
      state.running = false;
      state.message = "Chưa cài CIT Voice Studio";
      return false;
    }
    state.message = "Đang khởi động CIT Voice Studio…";
    child = spawn(exe, [], {
      cwd: dirname(exe),
      // không tự mở trình duyệt/cửa sổ trên Linux; giao diện CIT vẫn ở http://127.0.0.1:8001
      env: { ...process.env, BROWSER: process.platform === "linux" ? "true" : process.env.BROWSER },
      stdio: "ignore",
      windowsHide: true,
      detached: false,
    });
    state.managed = true;
    child.on("exit", () => {
      state.running = false;
      child = null;
    });
    const ok = await waitHealthy(opts.timeoutMs ?? 180_000);
    state.running = ok;
    state.message = ok ? "CIT Voice Studio đang chạy" : "CIT Voice Studio không khởi động được";
    if (!ok) state.error = state.message;
    return ok;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/** Theo dõi: CIT tắt → tự bật lại (chỉ khi ứng dụng quản lý bản cài trong vendor/cit hoặc đã cài sẵn). */
export function startCitWatchdog(intervalMs = 30_000) {
  if (watchdog) return;
  watchdog = setInterval(async () => {
    const ok = (await new CitClient({ retries: 0 }).status()).ok;
    state.running = ok;
    if (!ok && !state.installing && findCitExecutable()) await ensureCitRunning().catch(() => undefined);
  }, intervalMs);
  watchdog.unref();
}

export function stopCit() {
  // Windows: dừng cả cây tiến trình (CIT/venv Python có tiến trình con), đồng bộ để chạy được trong trình xử lý "exit"
  if (child?.pid && process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else if (child) child.kill();
  child = null;
  state.managed = false;
  state.running = false;
}

export async function restartCit(): Promise<boolean> {
  stopCit();
  await new Promise((r) => setTimeout(r, 1500));
  return ensureCitRunning();
}
