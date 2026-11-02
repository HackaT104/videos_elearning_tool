// Tự chạy Claude Code (gói Claude đã đăng ký, không tốn phí API) để xử lý hàng đợi yêu cầu AI – thay cho việc người dùng
// tự mở Claude Code rồi dán câu lệnh. Chạy headless `claude -p` trong thư mục ứng dụng, quyền hẹp: chỉ `pnpm cvs`, đọc tệp,
// ghi tệp tạm trong storage/claude-code-tmp. Một lượt mỗi lúc; yêu cầu gửi thêm trong lúc chạy → chạy lượt nữa khi xong.

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { getClaudeRequest, listClaudeRequests, REPO_ROOT, STORAGE, updateClaudeRequest } from "@cvs/db";

export const CC_RUN_PROMPT = "Xử lý các yêu cầu đang chờ của Course Video Studio (dùng skill cvs-claude-code). Ghi file tạm chỉ vào thư mục storage/claude-code-tmp/.";
export const CC_TMP_DIR = join(REPO_ROOT, "storage", "claude-code-tmp");
const SETTINGS_FILE = join(STORAGE, "settings.json");
const LOG_KEEP = 30;

type Env = Record<string, string | undefined>;

// ---------- tìm Claude Code ----------

const isFile = (p: string) => {
  try {
    accessSync(p, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** Đường dẫn CLI Claude Code: CVS_CLAUDE_BIN → `claude` trên PATH (như where/which) → nơi cài mặc định (npm, trình cài chính thức). */
export function findClaudeBin(env: Env = process.env, platform: NodeJS.Platform = process.platform, exists: (p: string) => boolean = isFile): string | null {
  if (env.CVS_CLAUDE_BIN) return exists(env.CVS_CLAUDE_BIN) ? env.CVS_CLAUDE_BIN : null;
  const win = platform === "win32";
  const sep = win ? ";" : platform === process.platform ? delimiter : ":";
  const exts = win ? [".exe", ".cmd", ".bat"] : [""];
  for (const dir of (env.PATH ?? env.Path ?? "").split(sep).filter(Boolean)) for (const e of exts) if (exists(join(dir, `claude${e}`))) return join(dir, `claude${e}`);
  const home = env.USERPROFILE || env.HOME || homedir();
  const extra = win
    ? [join(home, ".local", "bin", "claude.exe"), env.APPDATA ? join(env.APPDATA, "npm", "claude.cmd") : "", join(home, "AppData", "Roaming", "npm", "claude.cmd")]
    : [join(home, ".local", "bin", "claude"), join(home, ".claude", "local", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  return extra.find((p) => p && exists(p)) ?? null;
}

/** Bọc một tham số cho cmd.exe. Chỉ dùng cho tham số do ứng dụng tự tạo: từ chối ký tự cmd có thể diễn giải (", %, !, xuống dòng). */
export function cmdQuote(a: string): string {
  if (/["%!\r\n]/.test(a)) throw new Error(`Tham số không an toàn cho cmd.exe: ${a}`);
  return `"${a}"`;
}

/**
 * Lệnh thật để chạy CLI: .cmd/.bat của npm → chạy thẳng cli.js bằng Node (khỏi qua cmd.exe); không có cli.js → cmd.exe với
 * tham số đã bọc ngoặc kép (Node ≥ 18.20 không cho spawn .cmd khi thiếu shell).
 */
export function claudeCommand(bin: string, args: string[], platform: NodeJS.Platform = process.platform, exists: (p: string) => boolean = existsSync): { cmd: string; args: string[]; shell: boolean } {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(bin)) {
    const cli = join(dirname(bin), "node_modules", "@anthropic-ai", "claude-code", "cli.js");
    if (exists(cli)) return { cmd: process.execPath, args: [cli, ...args], shell: false };
    return { cmd: cmdQuote(bin), args: args.map(cmdQuote), shell: true };
  }
  return { cmd: bin, args, shell: false };
}

/** Bộ công cụ & quyền: không hỏi (dontAsk = việc ngoài danh sách bị từ chối), không MCP/mạng; Bash chỉ `pnpm cvs`, ghi chỉ thư mục tạm. */
export function claudeRunArgs(platform: NodeJS.Platform = process.platform): string[] {
  const shells = platform === "win32" ? ["Bash", "PowerShell"] : ["Bash"]; // Windows không có Git Bash → Claude Code dùng PowerShell
  const tools = [...shells, "Read", "Glob", "Grep", "Write", "Edit", "Skill"];
  const allow = [
    ...shells.flatMap((s) => [`${s}(pnpm cvs *)`, `${s}(pnpm -s cvs *)`]),
    "Read",
    "Glob",
    "Grep",
    "Skill",
    "Edit(storage/claude-code-tmp/**)", // luật Edit áp cho cả Write
  ];
  // prompt gửi qua stdin (không qua dòng lệnh → không lo mã hoá/ngoặc kép trên Windows)
  return ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--strict-mcp-config", "--tools", tools.join(","), "--allowedTools", allow.join(",")];
}

/** Môi trường cho Claude Code: bỏ khoá API để chắc chắn dùng gói Claude đã đăng ký (không tính phí API). */
export function claudeEnv(env: Env = process.env): Env {
  const e: Env = { ...env, CVS_API: env.CVS_API ?? `http://127.0.0.1:${env.CVS_API_PORT ?? 3001}/api` };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CVS_CLAUDE_KEY_SAVED", "CLAUDECODE"]) delete e[k];
  return e;
}

function spawnClaude(bin: string, args: string[], opts: SpawnOptions): ChildProcess {
  const c = claudeCommand(bin, args);
  return spawn(c.cmd, c.args, { ...opts, shell: c.shell, windowsHide: true, env: claudeEnv(opts.env as Env | undefined) as NodeJS.ProcessEnv });
}

/** Chạy lệnh ngắn, gom stdout (hết giờ → null). */
function capture(bin: string, args: string[], timeoutMs = 20_000): Promise<{ code: number | null; out: string } | null> {
  return new Promise((res) => {
    let out = "";
    let p: ChildProcess;
    try {
      p = spawnClaude(bin, args, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return res(null);
    }
    const t = setTimeout(() => (killTree(p), res(null)), timeoutMs);
    p.stdout?.on("data", (d) => (out += d));
    p.on("error", () => (clearTimeout(t), res(null)));
    p.on("close", (code) => (clearTimeout(t), res({ code, out })));
  });
}

function killTree(p: ChildProcess) {
  if (p.exitCode !== null || !p.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else p.kill("SIGTERM");
}

// ---------- cài đặt chung ----------

export type ClaudeCodeSettings = { auto: boolean };
export function claudeCodeSettings(): ClaudeCodeSettings {
  try {
    const j = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
    return { auto: j.claudeCodeAuto === true };
  } catch {
    return { auto: false };
  }
}
export function setClaudeCodeSettings(s: Partial<ClaudeCodeSettings>): ClaudeCodeSettings {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    /* chưa có */
  }
  if (typeof s.auto === "boolean") j.claudeCodeAuto = s.auto;
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(j, null, 2));
  return claudeCodeSettings();
}

// ---------- trạng thái ----------

const st = {
  child: null as ChildProcess | null,
  ids: [] as number[],
  startedAt: null as string | null,
  log: [] as string[],
  logFile: null as string | null,
  lastError: null as string | null,
  lastResult: null as "done" | "failed" | null,
  again: false,
  finished: null as Promise<void> | null,
};
const install = { running: false, log: [] as string[], error: null as string | null, done: false };
let probe: { bin: string; at: number; version: string | null; loggedIn: boolean | null; authMethod: string | null } | null = null;

const push = (arr: string[], line: string) => {
  arr.push(line);
  if (arr.length > LOG_KEEP) arr.splice(0, arr.length - LOG_KEEP);
};

/** Đã đăng nhập? `claude auth status --json` (không tốn lượt dùng); CLI cũ không có lệnh này → đoán theo tệp đăng nhập. */
async function probeBin(bin: string, force = false) {
  if (!force && probe?.bin === bin && Date.now() - probe.at < 60_000) return probe;
  const v = await capture(bin, ["--version"]);
  const version = v?.code === 0 ? (v.out.trim().split(/\s/)[0] ?? null) : null;
  let loggedIn: boolean | null = null;
  let authMethod: string | null = null;
  const a = await capture(bin, ["auth", "status", "--json"]);
  try {
    const j = JSON.parse(a?.out ?? "");
    if (typeof j.loggedIn === "boolean") ((loggedIn = j.loggedIn), (authMethod = j.authMethod ?? null));
  } catch {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
    if (existsSync(join(dir, ".credentials.json"))) loggedIn = true;
    else
      try {
        if (JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8")).oauthAccount) loggedIn = true;
      } catch {
        /* không đoán được → null */
      }
  }
  probe = { bin, at: Date.now(), version, loggedIn, authMethod };
  return probe;
}

export type ClaudeRunnerStatus = {
  installed: boolean;
  bin: string | null;
  version: string | null;
  /** null = không biết chắc */
  loggedIn: boolean | null;
  authMethod: string | null;
  running: boolean;
  currentRequestIds: number[];
  startedAt: string | null;
  lastLog: string[];
  lastError: string | null;
  lastResult: "done" | "failed" | null;
  logFile: string | null;
  auto: boolean;
  install: { running: boolean; log: string[]; error: string | null; done: boolean };
  platform: NodeJS.Platform;
};

export async function claudeRunnerStatus(force = false): Promise<ClaudeRunnerStatus> {
  const bin = findClaudeBin();
  const p = bin ? await probeBin(bin, force) : null;
  return {
    installed: !!bin,
    bin,
    version: p?.version ?? null,
    loggedIn: p?.loggedIn ?? null,
    authMethod: p?.authMethod ?? null,
    running: !!st.child,
    currentRequestIds: st.ids,
    startedAt: st.startedAt,
    lastLog: st.log,
    lastError: st.lastError,
    lastResult: st.lastResult,
    logFile: st.logFile,
    auto: claudeCodeSettings().auto,
    install: { ...install, log: install.log },
    platform: process.platform,
  };
}

// ---------- chạy ----------

/** Một dòng stream-json → dòng nhật ký dễ đọc (null = bỏ qua). */
export function describeStreamLine(line: string): string | null {
  let j: any;
  try {
    j = JSON.parse(line);
  } catch {
    return line.trim() || null;
  }
  if (j.type === "system" && j.subtype === "init") return `Claude Code ${j.claude_code_version ?? ""} bắt đầu (model ${j.model ?? "?"})`.replace(/\s+/g, " ");
  if (j.type === "assistant")
    return (
      (j.message?.content ?? [])
        .map((c: any) => (c.type === "text" ? c.text.trim() : c.type === "tool_use" ? `→ ${c.name}: ${String(c.input?.command ?? c.input?.file_path ?? c.input?.skill ?? c.input?.pattern ?? "").slice(0, 200)}` : ""))
        .filter(Boolean)
        .join("\n") || null
    );
  if (j.type === "result") return j.is_error ? `Lỗi: ${j.result ?? j.subtype}` : `Xong: ${String(j.result ?? "").slice(0, 400)}`;
  return null;
}

export type RunStart = { started: boolean; queued?: boolean; reason?: string };

/**
 * Chạy Claude Code cho mọi yêu cầu đang chờ. Đang chạy → hẹn chạy thêm một lượt khi xong.
 * Yêu cầu được đánh dấu "running"; khi kết thúc, yêu cầu Claude Code chưa đánh dấu xong → "failed" kèm lý do.
 */
export function startClaudeRun(o: { timeoutMs?: number } = {}): RunStart {
  if (st.child) {
    st.again = true;
    return { started: false, queued: true, reason: "Claude Code đang chạy – yêu cầu mới sẽ được làm ngay sau lượt này" };
  }
  const bin = findClaudeBin();
  if (!bin) return { started: false, reason: "Chưa cài Claude Code trên máy này" };
  // việc trùng (cùng loại + video + cảnh, bấm nhiều lần từ trước) → chỉ làm một lần, các bản sau đánh dấu huỷ
  const seen = new Set<string>();
  const pending = listClaudeRequests({ status: "pending" }).filter((r) => {
    const k = `${r.project_id}|${r.kind}|${r.video_key ?? ""}|${r.scene_id ?? ""}`;
    if (r.kind !== "revise" && seen.has(k)) {
      updateClaudeRequest(r.id, { status: "cancelled", message: "Trùng với việc đã gửi trước – chỉ làm một lần" });
      return false;
    }
    seen.add(k);
    return true;
  });
  if (!pending.length) return { started: false, reason: "Không có yêu cầu nào đang chờ" };
  st.again = false;
  st.ids = pending.map((r) => r.id);
  for (const id of st.ids) updateClaudeRequest(id, { status: "running", message: "Claude Code đang làm…" });
  const dir = join(STORAGE, "logs");
  mkdirSync(dir, { recursive: true });
  mkdirSync(CC_TMP_DIR, { recursive: true });
  st.logFile = join(dir, `claude-code-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.log`);
  st.startedAt = new Date().toISOString();
  st.log = [];
  st.lastError = null;
  st.lastResult = null;
  const logFile = st.logFile;
  const note = (s: string) => {
    for (const l of s.split("\n")) if (l.trim()) push(st.log, l);
  };
  appendFileSync(logFile, `[${st.startedAt}] ${bin} · yêu cầu ${st.ids.join(", ")}\n`);
  note(`Bắt đầu: ${st.ids.length} yêu cầu`);

  let child: ChildProcess;
  try {
    child = spawnClaude(bin, claudeRunArgs(), { cwd: REPO_ROOT, stdio: ["pipe", "pipe", "pipe"], env: process.env });
  } catch (e) {
    const why = `Không chạy được Claude Code: ${(e as Error).message}`;
    finish(1, why);
    return { started: false, reason: why };
  }
  st.child = child;
  let buf = "";
  let resultError: string | null = null;
  let timedOut = false;
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (d: string) => {
    appendFileSync(logFile, d);
    buf += d;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      const s = describeStreamLine(l);
      if (s) note(s);
      if (s?.startsWith("Lỗi: ")) resultError = s.slice(5);
    }
  });
  let errTail = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (d: string) => {
    appendFileSync(logFile, d);
    errTail = (errTail + d).slice(-600);
  });
  child.stdin?.on("error", () => undefined);
  child.stdin?.end(CC_RUN_PROMPT + "\n");
  const ms = o.timeoutMs ?? Number(process.env.CVS_CLAUDE_TIMEOUT_MIN ?? 45) * 60_000;
  const timer = setTimeout(() => {
    timedOut = true;
    note(`Quá ${Math.round(ms / 60_000)} phút – dừng Claude Code`);
    killTree(child);
  }, ms);
  st.finished = new Promise((res) => {
    let done = false;
    const end = (code: number | null, err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (buf.trim()) note(describeStreamLine(buf) ?? "");
      const why = err
        ? `Không chạy được Claude Code: ${err.message}`
        : timedOut
          ? `Quá thời gian (${Math.round(ms / 60_000)} phút)`
          : resultError ?? (code !== 0 ? `Claude Code dừng với mã ${code}${errTail.trim() ? `: ${errTail.trim().split("\n").pop()}` : ""}` : null);
      finish(code, why);
      res();
    };
    child.on("error", (e) => end(null, e));
    child.on("close", (code) => end(code));
  });
  return { started: true };
}

function finish(code: number | null, why: string | null) {
  // yêu cầu Claude Code chưa đánh dấu done/fail → failed (không tự chạy lại để tránh vòng lặp)
  for (const id of st.ids)
    if (getClaudeRequest(id)?.status === "running")
      updateClaudeRequest(id, { status: "failed", message: why ?? "Claude Code đã dừng nhưng chưa đánh dấu xong yêu cầu này – bấm gửi lại hoặc xem nhật ký" });
  st.lastError = why;
  st.lastResult = why ? "failed" : "done";
  push(st.log, why ? `Lỗi: ${why}` : "Xong");
  if (st.logFile) appendFileSync(st.logFile, `\n[${new Date().toISOString()}] kết thúc (mã ${code}) ${why ?? "OK"}\n`);
  st.child = null;
  st.ids = [];
  if (st.again && listClaudeRequests({ status: "pending" }).length) setTimeout(() => startClaudeRun(), 0);
  st.again = false;
}

/** Chờ lượt hiện tại (và lượt nối tiếp nếu có) xong – cho kiểm thử. */
export async function waitClaudeRun() {
  const tick = () => new Promise((r) => setTimeout(r, 10));
  await tick();
  while (st.child) {
    await st.finished;
    await tick();
  }
}

export function stopClaudeRun() {
  if (st.child) killTree(st.child);
}
process.on("exit", stopClaudeRun);

// ---------- cài / đăng nhập ----------

/** Lệnh cài chính thức (trình cài gốc – khuyến nghị của Anthropic; không cần quyền quản trị). */
export function installCommand(platform: NodeJS.Platform = process.platform): { cmd: string; args: string[]; text: string } {
  if (platform === "win32") return { cmd: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"], text: "irm https://claude.ai/install.ps1 | iex   (trong PowerShell)" };
  return { cmd: "bash", args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"], text: "curl -fsSL https://claude.ai/install.sh | bash" };
}

export function installClaudeCode(): { started: boolean; reason?: string } {
  if (install.running) return { started: false, reason: "Đang cài" };
  const c = installCommand();
  Object.assign(install, { running: true, log: [`$ ${c.text}`], error: null, done: false });
  const p = spawn(c.cmd, c.args, { cwd: REPO_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const on = (d: Buffer) => String(d).split(/\r?\n|\r/).filter((l) => l.trim()).forEach((l) => push(install.log, l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")));
  p.stdout?.on("data", on);
  p.stderr?.on("data", on);
  const end = (err: string | null) => {
    if (!install.running) return;
    install.running = false;
    probe = null;
    install.done = !err && !!findClaudeBin();
    install.error = err ?? (install.done ? null : "Cài xong nhưng chưa tìm thấy lệnh claude – mở lại ứng dụng (KHOI_DONG.cmd) rồi thử lại");
    push(install.log, install.error ?? "Đã cài Claude Code");
  };
  p.on("error", (e) => end(`Không chạy được trình cài: ${e.message}. Cách khác: npm install -g @anthropic-ai/claude-code`));
  p.on("close", (code) => end(code === 0 ? null : `Trình cài dừng với mã ${code}. Cách khác: npm install -g @anthropic-ai/claude-code`));
  return { started: true };
}

/** Lệnh mở một cửa sổ terminal mới chạy `claude` (để người dùng tự đăng nhập bằng tài khoản Claude). null = không mở được. */
export function loginTerminalCommand(bin: string, platform: NodeJS.Platform = process.platform, env: Env = process.env, has: (exe: string) => boolean = (x) => !!findOnPath(x, env)): { cmd: string; args: string[]; verbatim?: boolean } | null {
  if (platform === "win32") {
    if (/["%!\r\n]/.test(bin + REPO_ROOT)) return null;
    // cmd /c start "tiêu đề" /D "thư mục" cmd /k "claude" – cửa sổ mới, giữ lại sau khi thoát
    return { cmd: "cmd.exe", args: ["/d", "/c", `start "Claude Code" /D "${REPO_ROOT}" cmd /k "${bin}"`], verbatim: true };
  }
  const sh = `cd '${REPO_ROOT.replace(/'/g, `'\\''`)}' && '${bin.replace(/'/g, `'\\''`)}'`;
  if (platform === "darwin") {
    const as = sh.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return { cmd: "osascript", args: ["-e", `tell application "Terminal" to do script "${as}"`, "-e", 'tell application "Terminal" to activate'] };
  }
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  for (const t of ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"])
    if (has(t)) return t === "gnome-terminal" ? { cmd: t, args: ["--", "bash", "-c", `${sh}; exec bash`] } : { cmd: t, args: ["-e", "bash", "-c", `${sh}; exec bash`] };
  return null;
}

function findOnPath(exe: string, env: Env = process.env): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) if (isFile(join(dir, exe))) return join(dir, exe);
  return null;
}

export function openClaudeLogin(): { opened: boolean; command: string; reason?: string } {
  const bin = findClaudeBin();
  if (!bin) return { opened: false, command: "claude", reason: "Chưa cài Claude Code" };
  probe = null;
  const c = loginTerminalCommand(bin);
  if (!c) return { opened: false, command: bin, reason: "Không mở được cửa sổ dòng lệnh trên máy này" };
  try {
    spawn(c.cmd, c.args, { cwd: REPO_ROOT, detached: true, stdio: "ignore", windowsVerbatimArguments: c.verbatim }).on("error", () => undefined).unref();
    return { opened: true, command: bin };
  } catch (e) {
    return { opened: false, command: bin, reason: (e as Error).message };
  }
}
