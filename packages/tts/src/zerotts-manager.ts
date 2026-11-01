// ZeroTTS – giọng thứ hai, cài theo yêu cầu (bấm Cài trên trang Giọng đọc, hoặc CVS_ZEROTTS_AUTO_INSTALL=1):
// tạo venv Python trong vendor/zerotts/.venv, pip install zerotts fastapi uvicorn (+ onnx khi dựng bản int8),
// tải mô hình (~300–900 MB, vào vendor/zerotts/hf), tuỳ chọn dựng bản int8 (nhanh hơn trên CPU thường),
// rồi chạy packages/tts/zerotts/server.py tại 127.0.0.1:8002; theo dõi và bật lại khi bị tắt.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZerottsClient, ZEROTTS_URL } from "./zerotts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const ZEROTTS_DIR = resolve(process.env.CVS_ZEROTTS_DIR || join(REPO_ROOT, "vendor", "zerotts"));
export const ZEROTTS_SERVER_PY = resolve(HERE, "..", "zerotts", "server.py");
const QUANTIZE_PY = resolve(HERE, "..", "zerotts", "quantize_onnx_int8.py");
const VENV = join(ZEROTTS_DIR, ".venv");
const HF_HOME = join(ZEROTTS_DIR, "hf");
const INT8_DIR = join(ZEROTTS_DIR, "model-int8");
const MARKER = join(ZEROTTS_DIR, "installed.json");
const LOG = join(ZEROTTS_DIR, "server.log");
export const ZEROTTS_MODEL_ID = "zeroweight-ai/ZeroTTS";
/** Dung lượng mô hình fp32 ước tính – chỉ để hiện tiến độ tải. */
const MODEL_MB = 900;

const fake = () => process.env.CVS_ZEROTTS_FAKE === "1";
const wantInt8 = () => process.env.CVS_ZEROTTS_INT8 !== "0";
const port = () => String(process.env.CVS_ZEROTTS_PORT || new URL(ZEROTTS_URL).port || 8002);

export type ZerottsManagerState = {
  platform: NodeJS.Platform;
  installed: boolean;
  running: boolean;
  managed: boolean;
  installing: boolean;
  progress: number;
  message: string;
  error: string | null;
  /** Thư mục mô hình đang dùng và có phải bản int8 không. */
  model: string | null;
  int8: boolean;
  fake: boolean;
  dir: string;
};

const state: ZerottsManagerState = {
  platform: process.platform,
  installed: false,
  running: false,
  managed: false,
  installing: false,
  progress: 0,
  message: "",
  error: null,
  model: null,
  int8: false,
  fake: false,
  dir: ZEROTTS_DIR,
};
let child: ChildProcess | null = null;
let watchdog: NodeJS.Timeout | null = null;
let starting: Promise<boolean> | null = null;

type Marker = { model: string; int8: boolean; fake?: boolean; at: string };

export function venvPython(): string {
  return process.platform === "win32" ? join(VENV, "Scripts", "python.exe") : join(VENV, "bin", "python");
}

function readMarker(): Marker | null {
  try {
    return existsSync(MARKER) && existsSync(venvPython()) ? (JSON.parse(readFileSync(MARKER, "utf8")) as Marker) : null;
  } catch {
    return null;
  }
}

export function zerottsInstalled(): boolean {
  return !!readMarker();
}

export function zerottsManagerState(): ZerottsManagerState {
  const m = readMarker();
  state.installed = !!m;
  state.model = m?.model ?? null;
  state.int8 = !!m?.int8;
  state.fake = fake() || !!m?.fake;
  return { ...state };
}

/** Python ≥ 3.10: CVS_ZEROTTS_PYTHON, rồi `py -3` (Windows), `python3`, `python`. */
export function findPython(): { cmd: string; args: string[]; version: string } | null {
  const cands: [string, string[]][] = [];
  if (process.env.CVS_ZEROTTS_PYTHON) cands.push([process.env.CVS_ZEROTTS_PYTHON, []]);
  if (process.platform === "win32") cands.push(["py", ["-3"]]);
  cands.push(["python3", []], ["python", []]);
  for (const [cmd, args] of cands) {
    const r = spawnSync(cmd, [...args, "-c", "import sys;print('%d.%d.%d' % sys.version_info[:3])"], { encoding: "utf8", windowsHide: true, timeout: 20_000 });
    const v = r.status === 0 ? r.stdout.trim() : "";
    const [maj, min] = v.split(".").map(Number);
    if (maj === 3 && min >= 10) return { cmd, args, version: v };
  }
  return null;
}

function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", fail);
    // chỉ giữ vài dòng cuối (thường là dòng lỗi chính của Python/pip)
    const tail = () => (err || out).trim().split(/\r?\n/).filter((l) => l.trim()).slice(-2).join(" · ").slice(-400);
    p.on("close", (c) => (c === 0 ? ok(out) : fail(new Error(`${cmd.split(/[\\/]/).pop()} lỗi (${c}): ${tail()}`))));
  });
}

function dirMb(dir: string): number {
  let n = 0;
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      try {
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else n += st.size;
      } catch {
        /* bỏ qua */
      }
    }
  };
  walk(dir);
  return Math.round(n / 1e6);
}

const pyEnv = (): NodeJS.ProcessEnv => ({ HF_HOME, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PIP_DISABLE_PIP_VERSION_CHECK: "1" });

/** Cài ZeroTTS vào vendor/zerotts (không cần quyền quản trị). Chỉ chạy khi người dùng yêu cầu. */
export async function installZerotts(onProgress?: (pct: number, msg: string) => void): Promise<string> {
  if (state.installing) throw new Error("Đang cài ZeroTTS");
  state.installing = true;
  state.error = null;
  const report = (pct: number, msg: string) => {
    state.progress = pct;
    state.message = msg;
    onProgress?.(pct, msg);
  };
  try {
    report(1, "Đang tìm Python ≥ 3.10…");
    mkdirSync(ZEROTTS_DIR, { recursive: true });
    if (!existsSync(venvPython())) {
      const py = findPython();
      if (!py) throw new Error("Không tìm thấy Python 3.10 trở lên. Cài Python từ https://www.python.org/downloads/ (Windows: tích \"Add python.exe to PATH\") rồi bấm Cài lại.");
      report(3, `Đang tạo môi trường Python ${py.version}…`);
      await run(py.cmd, [...py.args, "-m", "venv", VENV]);
    }
    report(8, "Đang cài thư viện Python (zerotts, onnxruntime, fastapi, uvicorn)…");
    const pkgs = ["zerotts", "fastapi", "uvicorn", ...(wantInt8() && !fake() ? ["onnx"] : [])];
    await run(venvPython(), ["-m", "pip", "install", "--upgrade", ...pkgs], { env: pyEnv() });
    let model = ZEROTTS_MODEL_ID;
    let int8 = false;
    if (!fake()) {
      report(40, "Đang tải mô hình ZeroTTS từ Hugging Face…");
      const base = dirMb(HF_HOME);
      const tick = setInterval(() => {
        const mb = dirMb(HF_HOME) - base;
        report(Math.min(78, 40 + Math.round((mb / MODEL_MB) * 38)), `Đang tải mô hình ZeroTTS… ${mb} MB`);
      }, 2000);
      try {
        const code = `from zerotts import hub; print(hub.resolve_model_dir(${JSON.stringify(ZEROTTS_MODEL_ID)}))`;
        model = (await run(venvPython(), ["-c", code], { env: pyEnv() })).trim().split(/\r?\n/).pop()!;
      } catch (e) {
        throw new Error(`Không tải được mô hình ZeroTTS từ Hugging Face (huggingface.co) – kiểm tra mạng/proxy rồi bấm Cài lại. Chi tiết: ${(e as Error).message}`);
      } finally {
        clearInterval(tick);
      }
      if (!model || !existsSync(join(model, "config.json"))) throw new Error(`Tải mô hình xong nhưng không thấy config.json trong ${model}`);
      if (wantInt8()) {
        report(80, "Đang dựng bản int8 (nhanh hơn trên CPU thường, vài phút)…");
        try {
          await run(venvPython(), [QUANTIZE_PY, "--model", model, "--dst", INT8_DIR], { env: pyEnv() });
          model = INT8_DIR;
          int8 = true;
        } catch (e) {
          // không chặn cài đặt: dùng bản fp32
          state.error = `Không dựng được bản int8, dùng bản gốc: ${(e as Error).message.slice(0, 200)}`;
        }
      }
    }
    writeFileSync(MARKER, JSON.stringify({ model, int8, fake: fake(), at: new Date().toISOString() } satisfies Marker, null, 2));
    report(100, int8 ? "Đã cài ZeroTTS (bản int8)" : "Đã cài ZeroTTS");
    return model;
  } catch (e) {
    state.error = (e as Error).message;
    state.message = "Cài ZeroTTS lỗi";
    throw e;
  } finally {
    state.installing = false;
  }
}

function logTail(): string {
  try {
    return readFileSync(LOG, "utf8").trim().split(/\r?\n/).slice(-3).join(" ").slice(-400);
  } catch {
    return "";
  }
}

async function waitHealthy(z: ZerottsClient, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await z.health()).ok) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Bảo đảm máy chủ ZeroTTS đang chạy: đã chạy → dùng luôn; đã cài → khởi động; chưa cài → false (hoặc cài nếu autoInstall). */
export async function ensureZerottsRunning(opts: { autoInstall?: boolean; timeoutMs?: number } = {}): Promise<boolean> {
  if (starting) return starting;
  starting = (async () => {
    const z = new ZerottsClient({ retries: 0 });
    if ((await z.health()).ok) {
      state.running = true;
      return true;
    }
    let m = readMarker();
    if (!m && opts.autoInstall) {
      await installZerotts();
      m = readMarker();
    }
    if (!m) {
      state.running = false;
      state.message = "Chưa cài ZeroTTS";
      return false;
    }
    state.message = "Đang khởi động ZeroTTS (nạp mô hình)…";
    state.error = null;
    mkdirSync(ZEROTTS_DIR, { recursive: true });
    const log = openSync(LOG, "w");
    try {
      child = spawn(venvPython(), ["-I", ZEROTTS_SERVER_PY], {
        cwd: ZEROTTS_DIR,
        env: {
          ...process.env,
          ...pyEnv(),
          ZEROTTS_MODEL: m.model,
          CVS_ZEROTTS_PORT: port(),
          ...(m.fake ? { CVS_ZEROTTS_FAKE: "1" } : {}),
          // mô hình đã tải lúc cài – không gọi mạng khi khởi động
          HF_HUB_OFFLINE: "1",
        },
        stdio: ["ignore", log, log],
        windowsHide: true,
      });
    } finally {
      closeSync(log);
    }
    state.managed = true;
    const me = child;
    me.on("error", (e) => (state.error = `Không chạy được Python của ZeroTTS: ${e.message}`));
    me.on("exit", () => {
      state.running = false;
      if (child === me) child = null;
    });
    const ok = await waitHealthy(z, opts.timeoutMs ?? 300_000);
    state.running = ok;
    state.message = ok ? "ZeroTTS đang chạy" : "ZeroTTS không khởi động được";
    if (!ok) {
      state.error = `${state.message}. ${logTail()}`.trim();
      if (child === me) stopZerotts();
    }
    return ok;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/** Theo dõi: máy chủ tắt → bật lại (chỉ khi đã cài). */
export function startZerottsWatchdog(intervalMs = 30_000) {
  if (watchdog) return;
  watchdog = setInterval(async () => {
    const ok = (await new ZerottsClient({ retries: 0 }).health()).ok;
    state.running = ok;
    if (!ok && !state.installing && !starting && zerottsInstalled()) await ensureZerottsRunning().catch(() => undefined);
  }, intervalMs);
  watchdog.unref();
}

export function stopZerotts() {
  if (child) child.kill();
  child = null;
  state.managed = false;
  state.running = false;
}

export async function restartZerotts(): Promise<boolean> {
  stopZerotts();
  await new Promise((r) => setTimeout(r, 1000));
  return ensureZerottsRunning();
}
