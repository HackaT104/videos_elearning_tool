// Trình khởi động bản cài Windows. Lối tắt chạy launch.vbs → node.exe đi kèm chạy tệp này ẨN (không cửa sổ dòng lệnh):
// - dữ liệu ở %LOCALAPPDATA%\Course Video Studio (storage = dự án, runtime = trình duyệt/CIT tải về, edge-profile) – ngoài thư mục cài;
// - đọc thêm biến môi trường từ storage\.env (nếu có);
// - đang chạy rồi → chỉ mở cửa sổ; chưa → mở cửa sổ "Đang khởi động…", chạy worker + giao diện, chờ /api/health;
// - cửa sổ: Microsoft Edge chế độ ứng dụng (--app), không có Edge → trình duyệt mặc định;
// - giám sát: worker hoặc giao diện dừng (vd. "Thoát ứng dụng") → dừng nốt phần còn lại; nhật ký: storage\logs\app.log.
// `node launcher.mjs --quit` (bộ cài/gỡ cài gọi): yêu cầu ứng dụng đang chạy thoát rồi chờ tắt hẳn.
// Chỉ dùng thư viện có sẵn của Node: tệp này chạy trước khi node_modules được nối (junction) lại.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Mọi đường dẫn của bản cài. Dữ liệu luôn nằm ngoài thư mục cài để cập nhật / gỡ cài không mất dự án. */
export function appPaths(env = process.env, appDir = APP_DIR, nodeExe = process.execPath) {
  const data = env.CVS_DATA_DIR || join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Course Video Studio");
  const storage = join(data, "storage");
  const runtime = join(data, "runtime");
  return {
    appDir,
    nodeDir: dirname(nodeExe),
    data,
    storage,
    runtime,
    logFile: join(storage, "logs", "app.log"),
    envFile: join(storage, ".env"),
    marker: join(storage, ".setup-done"),
    edgeProfile: join(data, "edge-profile"),
    lock: join(runtime, "launcher.lock"),
  };
}

/** Biến môi trường cho worker + giao diện. .env của người dùng ghi đè máy; thư mục dữ liệu thì cố định. */
export function buildEnv(base, p, user = {}) {
  const env = { ...base };
  for (const [k, v] of Object.entries(user)) if (v !== "") env[k] = v;
  const def = (k, v) => void (env[k] ||= v);
  def("PLAYWRIGHT_BROWSERS_PATH", join(p.runtime, "browsers"));
  def("CVS_CIT_DIR", join(p.runtime, "cit"));
  def("CVS_ZEROTTS_DIR", join(p.runtime, "zerotts"));
  def("CVS_WEB_PORT", "3000");
  def("CVS_API_PORT", "3001");
  Object.assign(env, { CVS_STORAGE: p.storage, CVS_DESKTOP: "1", TSX_TSCONFIG_PATH: join(p.appDir, "tsconfig.json") });
  // Windows: khoá "Path" không phân biệt hoa thường – sửa đúng khoá đang có, không thêm khoá trùng
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  env[pathKey] = [p.nodeDir, env[pathKey]].filter(Boolean).join(delimiter);
  return env;
}

export function readUserEnv(file) {
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export const startUrl = (p, webPort) => `http://localhost:${webPort}${existsSync(p.marker) ? "/" : "/chuan-bi"}`;

export function edgeCandidates(env = process.env) {
  return [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean).map((d) => join(d, "Microsoft", "Edge", "Application", "msedge.exe"));
}
export const edgeArgs = (url, p) => [`--app=${url}`, `--user-data-dir=${p.edgeProfile}`, "--no-first-run", "--no-default-browser-check"];

/**
 * Bộ cài không chép được symlink/junction của pnpm → khi đóng gói ghi danh sách vào .cvs-links.json ([link, đích], tương đối),
 * lần chạy đầu (mỗi phiên bản) tạo lại bằng junction (không cần quyền quản trị).
 */
export function ensureLinks(appDir = APP_DIR, log = () => undefined) {
  const file = join(appDir, ".cvs-links.json");
  if (!existsSync(file)) return { made: 0, failed: 0 };
  const raw = readFileSync(file, "utf8");
  const stamp = join(appDir, ".cvs-links.ok");
  const hash = createHash("sha1").update(raw).digest("hex");
  if (existsSync(stamp) && readFileSync(stamp, "utf8") === hash) return { made: 0, failed: 0 };
  let made = 0, failed = 0;
  for (const [rel, targetRel] of JSON.parse(raw)) {
    const link = join(appDir, ...String(rel).split("/"));
    const target = join(appDir, ...String(targetRel).split("/"));
    if (!link.startsWith(appDir + sep) || !target.startsWith(appDir + sep) || !existsSync(target)) continue;
    try {
      let st = null;
      try {
        st = lstatSync(link);
      } catch {
        /* chưa có */
      }
      if (st?.isSymbolicLink()) unlinkSync(link);
      else if (st) continue; // đã là thư mục thật
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link, "junction");
      made++;
    } catch (e) {
      failed++;
      if (failed <= 5) log(`Không tạo được liên kết ${rel}: ${e.message}`);
    }
  }
  if (!failed) writeFileSync(stamp, hash);
  log(`Liên kết node_modules: tạo ${made}, lỗi ${failed}`);
  return { made, failed };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ok(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
}
const isRunning = (env) => Promise.all([ok(`http://127.0.0.1:${env.CVS_API_PORT}/api/health`), ok(`http://127.0.0.1:${env.CVS_WEB_PORT}/`)]).then((r) => r.every(Boolean));

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}

function openWindow(url, p, log) {
  if (process.env.CVS_NO_WINDOW === "1") return log(`(CVS_NO_WINDOW) ${url}`);
  const detach = { detached: true, stdio: "ignore" };
  if (process.platform === "win32") {
    const edge = edgeCandidates().find((f) => existsSync(f));
    if (edge) return spawn(edge, edgeArgs(url, p), detach).on("error", (e) => log(`Edge: ${e.message}`)).unref();
    log("Không thấy Microsoft Edge – mở bằng trình duyệt mặc định");
    return spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], detach).unref();
  }
  spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], detach).on("error", () => undefined).unref();
}

/** Khoá một phiên: tiến trình giữ khoá còn sống → false. */
function takeLock(p) {
  try {
    writeFileSync(p.lock, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    let pid = 0;
    try {
      pid = Number(readFileSync(p.lock, "utf8"));
      if (pid && pid !== process.pid) {
        process.kill(pid, 0);
        return false;
      }
    } catch {
      /* tiến trình cũ đã chết */
    }
    writeFileSync(p.lock, String(process.pid));
    return true;
  }
}

const SPLASH = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Course Video Studio</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#f4f6f5;color:#0b1f36;font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:520px;padding:24px;text-align:center}h1{font-size:20px;margin:16px 0 4px}p{color:#5d6e78;margin:0}
.bar{height:6px;border-radius:3px;background:#dce2e0;overflow:hidden;margin:20px auto 0;width:240px}.bar i{display:block;height:100%;width:40%;background:#00469b;border-radius:3px;animation:s 1.2s cubic-bezier(.77,0,.175,1) infinite}
@keyframes s{from{transform:translateX(-100%)}to{transform:translateX(250%)}}@media (prefers-reduced-motion:reduce){.bar i{animation:none;width:100%}}
.err{color:#c7412f}</style>
<main><svg width="56" height="56" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#00469b"/><path d="M200 152v208l168-104z" fill="#fff"/><path d="M120 392h272" stroke="#9be7c8" stroke-width="28" stroke-linecap="round"/></svg>
<h1 id="t">Đang khởi động Course Video Studio…</h1><p id="m">Lần đầu sau khi cài hoặc cập nhật có thể mất đến một phút.</p><div class="bar" id="b"><i></i></div></main>
<script>async function poll(){try{const s=await (await fetch("/state",{cache:"no-store"})).json();
if(s.ready)return location.replace(s.target);if(s.error){document.getElementById("t").textContent="Không khởi động được";const m=document.getElementById("m");m.className="err";m.textContent=s.error;document.getElementById("b").remove();return}}catch{}
setTimeout(poll,700)}poll()</script></html>`;

/** Cửa sổ chờ: máy chủ tạm (127.0.0.1, cổng ngẫu nhiên) – trang hỏi /state cùng nguồn rồi chuyển sang ứng dụng khi sẵn sàng. */
function splash(target) {
  const st = { ready: false, error: "", target };
  const srv = createServer((req, res) => {
    if (req.url === "/state") return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(st));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(SPLASH);
  });
  const listening = new Promise((r) => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${srv.address().port}/`)));
  return { st, listening, close: () => setTimeout(() => srv.close(), 60_000).unref() };
}

async function quitRunning(env, log) {
  try {
    await fetch(`http://127.0.0.1:${env.CVS_API_PORT}/api/app/quit`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(3000) });
  } catch {
    return; // không chạy
  }
  log("Đã yêu cầu ứng dụng thoát (bộ cài)");
  for (let i = 0; i < 30 && (await ok(`http://127.0.0.1:${env.CVS_WEB_PORT}/`) || (await ok(`http://127.0.0.1:${env.CVS_API_PORT}/api/health`))); i++) await sleep(500);
}

async function main() {
  const p = appPaths();
  mkdirSync(dirname(p.logFile), { recursive: true });
  mkdirSync(p.runtime, { recursive: true });
  try {
    if (statSync(p.logFile).size > 5e6) renameSync(p.logFile, `${p.logFile}.1`);
  } catch {
    /* chưa có */
  }
  const log = (s) => appendFileSync(p.logFile, `[${new Date().toISOString()}] [launcher] ${s}\n`);
  if (!existsSync(p.envFile) && existsSync(join(p.appDir, ".env.example"))) copyFileSync(join(p.appDir, ".env.example"), p.envFile);
  const env = buildEnv(process.env, p, readUserEnv(p.envFile));
  if (process.argv.includes("--quit")) return quitRunning(env, log);

  const target = startUrl(p, env.CVS_WEB_PORT);
  if (await isRunning(env)) return openWindow(target, p, log);
  if (!takeLock(p)) {
    // một launcher khác đang khởi động: chờ nó xong rồi chỉ mở cửa sổ
    for (let i = 0; i < 240 && !(await isRunning(env)); i++) await sleep(500);
    return openWindow(target, p, log);
  }
  const releaseLock = () => {
    try {
      if (readFileSync(p.lock, "utf8") === String(process.pid)) unlinkSync(p.lock);
    } catch {
      /* đã xoá */
    }
  };
  process.on("exit", releaseLock);

  const sp = splash(target);
  openWindow(await sp.listening, p, log);
  log(`Khởi động ${JSON.parse(readFileSync(join(p.appDir, "package.json"), "utf8")).version} · dữ liệu ${p.data}`);
  ensureLinks(p.appDir, log);
  // Remotion tải trình duyệt vào <thư mục có package.json gần cwd nhất>/node_modules/.remotion → cwd worker = runtime
  if (!existsSync(join(p.runtime, "package.json"))) writeFileSync(join(p.runtime, "package.json"), '{ "name": "cvs-runtime", "private": true }\n');

  const out = openSync(p.logFile, "a");
  const opts = (cwd) => ({ cwd, env, stdio: ["ignore", out, out], windowsHide: true });
  let tsx;
  try {
    tsx = pathToFileURL(createRequire(join(p.appDir, "package.json")).resolve("tsx")).href;
  } catch (e) {
    sp.st.error = `Bản cài thiếu thư viện (tsx): ${e.message}. Hãy cài lại ứng dụng.`;
    log(sp.st.error);
    return setTimeout(() => process.exit(1), 10_000);
  }
  const worker = spawn(process.execPath, ["--import", tsx, join(p.appDir, "apps", "worker", "src", "index.ts")], opts(p.runtime));
  const web = spawn(process.execPath, [join(p.appDir, "apps", "web", "serve.mjs")], opts(join(p.appDir, "apps", "web")));
  let stopping = false;
  const stopAll = (why) => {
    if (stopping) return;
    stopping = true;
    log(why);
    killTree(worker);
    killTree(web);
    releaseLock();
    if (!sp.st.ready) sp.st.error = `${why}. Xem nhật ký: ${p.logFile}`;
    setTimeout(() => process.exit(0), sp.st.ready ? 500 : 15_000);
  };
  worker.on("exit", (c) => stopAll(`Worker đã dừng (mã ${c})`));
  web.on("exit", (c) => stopAll(`Giao diện đã dừng (mã ${c})`));
  for (const e of [worker, web]) e.on("error", (err) => stopAll(`Không chạy được: ${err.message}`));

  for (let i = 0; i < 360 && !stopping; i++) {
    if (await isRunning(env)) {
      sp.st.ready = true;
      sp.close();
      return log(`Sẵn sàng: ${target}`);
    }
    await sleep(500);
  }
  if (!stopping) stopAll("Quá 3 phút chưa khởi động xong");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    try {
      appendFileSync(appPaths().logFile, `[${new Date().toISOString()}] [launcher] LỖI ${e.stack}\n`);
    } finally {
      process.exit(1);
    }
  });
}
