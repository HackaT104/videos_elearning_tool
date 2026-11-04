// Đăng nhập Claude trong ứng dụng – hai cách:
//  1) Tài khoản Anthropic (Claude Console): ứng dụng tự cài CLI `ant` chính thức rồi chạy `ant auth login` (mở trình duyệt để đăng nhập).
//     SDK Anthropic tự đọc hồ sơ đăng nhập đó – không cần chép khoá.
//  2) Dán khoá API: lưu trong storage/secrets/claude.json (chỉ trên máy này).
// Lưu ý: đây là tài khoản API của Anthropic (tính phí theo lượng dùng), không phải gói Claude Pro/Max trên claude.ai.

import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, resetClaudeClient } from "@cvs/ai";
import { STORAGE } from "@cvs/db";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const ANT_VERSION = process.env.CVS_ANT_VERSION || "2.4.0";
const ANT_DIR = join(REPO_ROOT, "vendor", "ant");
const SECRET_FILE = join(STORAGE, "secrets", "claude.json");

export type ClaudeAuthStatus = {
  source: "env-key" | "saved-key" | "env-token" | "profile" | "none";
  label: string;
  profiles: string[];
  antInstalled: boolean;
  login: { running: boolean; url: string | null; message: string };
  model: string;
};

const login = { running: false, url: null as string | null, message: "", proc: null as ChildProcess | null };

function configDir(): string {
  if (process.env.ANTHROPIC_CONFIG_DIR) return process.env.ANTHROPIC_CONFIG_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Anthropic");
  return join(homedir(), ".config", "anthropic");
}

function profiles(): string[] {
  const dir = join(configDir(), "credentials");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
}

export function antPath(): string | null {
  const exe = join(ANT_DIR, process.platform === "win32" ? "ant.exe" : "ant");
  return existsSync(exe) ? exe : null;
}

/** Nạp khoá đã lưu vào môi trường (gọi khi worker khởi động). Khoá trong .env luôn được ưu tiên. */
export function loadSavedClaudeKey() {
  if (process.env.ANTHROPIC_API_KEY || !existsSync(SECRET_FILE)) return;
  try {
    const j = JSON.parse(readFileSync(SECRET_FILE, "utf8"));
    if (j.apiKey) {
      process.env.ANTHROPIC_API_KEY = j.apiKey;
      process.env.CVS_CLAUDE_KEY_SAVED = "1";
    }
  } catch {
    /* file hỏng – bỏ qua */
  }
}

export function claudeAuthStatus(): ClaudeAuthStatus {
  const p = profiles();
  let source: ClaudeAuthStatus["source"] = "none";
  let label = "Chưa đăng nhập Claude";
  if (process.env.ANTHROPIC_API_KEY) {
    source = process.env.CVS_CLAUDE_KEY_SAVED === "1" ? "saved-key" : "env-key";
    label = source === "saved-key" ? "Khoá API đã lưu trong ứng dụng" : "Khoá API trong file .env";
  } else if (process.env.ANTHROPIC_AUTH_TOKEN) {
    source = "env-token";
    label = "Mã truy cập trong .env";
  } else if (p.length) {
    source = "profile";
    label = `Tài khoản Anthropic (hồ sơ: ${p.join(", ")})`;
  }
  return { source, label, profiles: p, antInstalled: !!antPath(), login: { running: login.running, url: login.url, message: login.message }, model: DEFAULT_MODEL };
}

export function saveClaudeKey(apiKey: string) {
  if (!/^sk-ant-[\w-]{20,}$/.test(apiKey.trim())) throw new Error("Khoá API không đúng định dạng (bắt đầu bằng sk-ant-…)");
  mkdirSync(dirname(SECRET_FILE), { recursive: true });
  writeFileSync(SECRET_FILE, JSON.stringify({ apiKey: apiKey.trim(), savedAt: new Date().toISOString() }));
  try {
    chmodSync(SECRET_FILE, 0o600);
  } catch {
    /* Windows */
  }
  process.env.ANTHROPIC_API_KEY = apiKey.trim();
  process.env.CVS_CLAUDE_KEY_SAVED = "1";
  resetClaudeClient();
}

export function clearSavedClaudeKey() {
  rmSync(SECRET_FILE, { force: true });
  if (process.env.CVS_CLAUDE_KEY_SAVED === "1") {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CVS_CLAUDE_KEY_SAVED;
  }
  resetClaudeClient();
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd, stdio: "ignore", windowsHide: true });
    p.on("error", fail);
    p.on("close", (c) => (c === 0 ? ok() : fail(new Error(`${cmd} lỗi (${c})`))));
  });
}

/** Tải CLI `ant` chính thức (github.com/anthropics/anthropic-cli) vào vendor/ant. */
export async function installAnt(): Promise<string> {
  const existing = antPath();
  if (existing) return existing;
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const ext = os === "linux" ? "tar.gz" : "zip";
  const url = `https://github.com/anthropics/anthropic-cli/releases/download/v${ANT_VERSION}/ant_${ANT_VERSION}_${os}_${arch}.${ext}`;
  mkdirSync(ANT_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được CLI ant (HTTP ${res.status}). ${os === "darwin" ? "Trên macOS hãy cài bằng: brew install anthropics/tap/ant" : url}`);
  const file = join(ANT_DIR, `ant.${ext}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  // Windows 10+ có sẵn tar (bsdtar) giải nén được cả .zip
  await run("tar", [ext === "zip" ? "-xf" : "-xzf", file, "-C", ANT_DIR]);
  rmSync(file, { force: true });
  const exe = antPath();
  if (!exe) {
    // một số bản đóng gói ant trong thư mục con
    const found = readdirSync(ANT_DIR, { recursive: true }).map(String).find((f) => /(^|[\\/])ant(\.exe)?$/.test(f));
    if (!found) throw new Error("Giải nén xong nhưng không thấy file ant");
    const { renameSync } = await import("node:fs");
    renameSync(join(ANT_DIR, found), join(ANT_DIR, process.platform === "win32" ? "ant.exe" : "ant"));
  }
  if (process.platform !== "win32") chmodSync(antPath()!, 0o755);
  return antPath()!;
}

/** Bắt đầu đăng nhập: chạy `ant auth login` – trình duyệt trên máy này mở trang đăng nhập Anthropic. */
export async function startClaudeLogin(): Promise<void> {
  if (login.running) return;
  const ant = await installAnt();
  login.running = true;
  login.url = null;
  login.message = "Đang mở trang đăng nhập Anthropic trong trình duyệt của máy tính…";
  const env = { ...process.env };
  // khoá cũ trong môi trường sẽ "che" hồ sơ đăng nhập – bỏ khi chạy lệnh đăng nhập
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const p = spawn(ant, ["auth", "login"], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  login.proc = p;
  const onData = (d: Buffer) => {
    const m = d.toString().match(/https:\/\/\S+/);
    if (m) login.url = m[0];
  };
  p.stdout?.on("data", onData);
  p.stderr?.on("data", onData);
  p.on("close", (code) => {
    login.running = false;
    login.proc = null;
    login.message = code === 0 ? "Đã đăng nhập tài khoản Anthropic" : "Đăng nhập chưa hoàn tất – thử lại";
    if (code === 0) {
      // ưu tiên hồ sơ vừa đăng nhập: bỏ khoá đã lưu nếu có
      if (process.env.CVS_CLAUDE_KEY_SAVED === "1") clearSavedClaudeKey();
      resetClaudeClient();
    }
  });
}

export async function claudeLogout() {
  clearSavedClaudeKey();
  const ant = antPath();
  if (ant) await run(ant, ["auth", "logout"]).catch(() => undefined);
  resetClaudeClient();
}

/** Gọi thử Claude một lần để kiểm tra đăng nhập. */
export async function testClaude(): Promise<{ ok: boolean; model?: string; message: string }> {
  try {
    const c = new Anthropic();
    const r = await c.messages.create({ model: DEFAULT_MODEL, max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Trả lời đúng một từ: Sẵn sàng" }] });
    const text = r.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    return { ok: true, model: r.model, message: `Claude trả lời: ${text.trim()}` };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, message: "Thông tin đăng nhập không hợp lệ hoặc đã hết hạn – đăng nhập lại" };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, message: "Tài khoản không có quyền dùng model này" };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, message: "Không kết nối được Claude API – kiểm tra mạng" };
    return { ok: false, message: (e as Error).message };
  }
}

/** Trang đăng nhập hiện "Authentication code – Paste this into Anthropic CLI" → người dùng dán mã vào ứng dụng, ứng dụng chuyển cho `ant auth login`. */
export function submitClaudeLoginCode(code: string): { ok: boolean; message: string } {
  const c = code.trim();
  if (!login.running || !login.proc?.stdin) return { ok: false, message: "Chưa có lượt đăng nhập nào đang chờ – bấm Đăng nhập tài khoản Anthropic trước" };
  if (!/^[A-Za-z0-9_\-#.~]{10,400}$/.test(c)) return { ok: false, message: "Mã không hợp lệ – bấm Copy code trên trang đăng nhập rồi dán lại" };
  login.proc.stdin.write(`${c}\n`);
  login.message = "Đã gửi mã, đang hoàn tất đăng nhập…";
  return { ok: true, message: login.message };
}
