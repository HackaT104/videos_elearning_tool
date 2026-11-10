// Cảnh hoạt hình vẽ tay: mã cảnh (do Claude viết theo kit Claude Animation Base – p5.js + p5.brush) render TRƯỚC thành clip MP4
// 12 khung/giây (nhịp vẽ tay "on twos", khớp nhịp rung nét 12/s của kit), lưu đệm theo nội dung; HyperFrames/Remotion chỉ phát
// clip như <video> tua theo khung và phủ chữ HTML (theo kịch bản) lên trên.
// Mã cảnh là mã do AI viết: lint cấm mạng/DOM/thời gian thực; trang chạy trong about:blank (setContent), chặn mọi request.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import { FFMPEG } from "@cvs/tts";

const require = createRequire(import.meta.url);
const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "kit");
export const CARTOON_FPS = 12;
export const MAX_CARTOON_CODE = 60_000;
/** Phiên bản bộ vẽ = hash nội dung kit + p5 + p5.brush: sửa nhân vật/kit → clip cũ tự hết hiệu lực. */
export const kitVersion = () => {
  const L = loadLibs();
  return (L.hash ??= createHash("sha1").update(L.p5).update(L.brush).update(L.kit).digest("hex").slice(0, 12));
};

export type CartoonInput = {
  code: string;
  /** Thời lượng cảnh (giây) và mốc câu (giây, tính từ đầu cảnh). */
  dur: number;
  cues: number[];
  ends: number[];
  /** Chế độ nhẹ: bỏ tô màu nước (nhanh ~10 lần trên GPU tích hợp). */
  fast: boolean;
  /** Cho dùng nhân vật Clawd (linh vật của Anthropic) – mặc định tắt. */
  clawd: boolean;
  /** Màu của phong cách video (hex) cho bảng màu cảnh. */
  theme: Record<string, string>;
};

// ---------- kiểm mã cảnh ----------
const FORBIDDEN: [RegExp, string][] = [
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|navigator|sendBeacon)\b/, "Cấm mạng (fetch/XHR/WebSocket…)"],
  [/\bimport\s*\(|\bimport\s+[\w{*]|\brequire\s*\(/, "Cấm import/require – kit đã nạp sẵn mọi hàm"],
  [/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/, "Cấm eval/new Function"],
  [/\b(document|window|globalThis|localStorage|sessionStorage|indexedDB|location)\b/, "Cấm truy cập trang/DOM (document, window…)"],
  [/Math\.random\s*\(/, "Cấm Math.random – dùng hash(i) hoặc jit()/random() của kit (tất định)"],
  [/\bDate\b|\bperformance\b/, "Cấm Date/performance – mọi thứ là hàm của t"],
  [/\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, "Cấm timer/requestAnimationFrame"],
  [/\b(letter|sfx|text|textFont|loadFont|loadImage|createCanvas|createGraphics|noLoop|loop|redraw)\s*\(/, "Không gọi hàm này trong cảnh (chữ do ứng dụng phủ lên; canvas do kit quản lý)"],
  [/\bwhile\s*\(\s*(true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)/, "Cấm vòng lặp vô hạn"],
];

/** Lỗi của mã cảnh (rỗng = đạt). Cảnh phải định nghĩa function scene(t) vẽ toàn khung tại t (giây, 0..DUR). */
export function lintCartoon(code: string, o: { clawd?: boolean } = {}): string[] {
  const errs: string[] = [];
  if (!code.trim()) return ["Mã cảnh rỗng"];
  if (code.length > MAX_CARTOON_CODE) errs.push(`Mã cảnh dài quá ${MAX_CARTOON_CODE / 1000}k ký tự`);
  if (!/\bfunction\s+scene\s*\(\s*t\b/.test(code)) errs.push("Thiếu function scene(t) { … } (vẽ toàn khung tại thời điểm t)");
  if (/\bshots\s*\(/.test(code)) errs.push("Không gọi shots() – ứng dụng tự gọi scene(t) cho cả cảnh");
  if (!o.clawd && /\bclawd\s*\(/.test(code)) errs.push("Nhân vật Clawd đang tắt trong dự án – dùng kysu(x, y, u, {...})");
  if (/<\/script/i.test(code)) errs.push("Mã không được chứa </script");
  const noComments = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const [re, msg] of FORBIDDEN) if (re.test(noComments)) errs.push(msg);
  return errs;
}

// ---------- trang dựng ----------
let libs: { p5: string; brush: string; kit: string; hash?: string } | null = null;
/** Thư mục gói (p5 không export lib/ – đi lên từ file chính tới thư mục có package.json đúng tên). */
function pkgFile(name: string, rel: string): string {
  let d = dirname(require.resolve(name));
  while (!existsSync(join(d, "package.json")) || JSON.parse(readFileSync(join(d, "package.json"), "utf8")).name !== name) {
    const up = dirname(d);
    if (up === d) throw new Error(`Không tìm thấy gói ${name}`);
    d = up;
  }
  return join(d, rel);
}
function loadLibs() {
  libs ??= {
    p5: readFileSync(pkgFile("p5", "lib/p5.min.js"), "utf8"),
    brush: readFileSync(pkgFile("p5.brush", "dist/p5.brush.js"), "utf8"),
    kit: ["core.js", "clawd.js", "character.js", "timeline.js", "cvs.js"].map((f) => `// ${f}\n${readFileSync(join(KIT, f), "utf8")}`).join("\n;\n"),
  };
  return libs;
}
const inline = (js: string) => `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;

/** HTML tự chứa (không tải gì từ ngoài): p5 + p5.brush + kit + mã cảnh; canvas #out 1920×1080. */
export function cartoonHtml(i: CartoonInput): string {
  const L = loadLibs();
  const cfg = { dur: i.dur, cues: i.cues, ends: i.ends, fast: i.fast, clawd: i.clawd, theme: i.theme };
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}.p5Canvas{display:none!important}</style>
${inline(`const PROJECT = { duration: ${Number(i.dur.toFixed(3))}, bpm: 100, offset: 0 }; const CVS = ${JSON.stringify(cfg)};`)}
${inline(L.p5)}
${inline(L.brush)}
</head><body><canvas id="out" width="1920" height="1080"></canvas>
${inline(L.kit)}
${inline(`${i.code}\n;shots([[0, (t) => scene(t)]]);`)}
</body></html>`;
}

/** Mã đệm của clip: đổi mã, thời lượng, mốc câu, chế độ, màu → vẽ lại. */
export function cartoonKey(i: CartoonInput, fps = CARTOON_FPS): string {
  return createHash("sha1").update(JSON.stringify([kitVersion(), fps, i.code, i.dur.toFixed(3), i.cues.map((c) => c.toFixed(3)), i.ends.map((c) => c.toFixed(3)), i.fast, i.clawd, i.theme])).digest("hex").slice(0, 16);
}

// ---------- trình duyệt ----------
/** GPU: Windows dùng D3D11 (GPU tích hợp nhanh hơn CPU ~10–30 lần); CVS_CARTOON_GL=soft ép render bằng CPU (SwiftShader). */
function glArgs(): string[] {
  const mode = process.env.CVS_CARTOON_GL ?? "auto";
  if (mode === "soft") return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  if (process.platform === "win32") return ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];
  return ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
}

async function openPage(browser: Browser, i: CartoonInput) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // trang tự chứa: chặn mọi request (mã AI viết không được tải/gửi gì ra ngoài)
  await page.route("**/*", (r) => r.abort());
  await page.setContent(cartoonHtml(i), { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction("window.ready === true", null, { timeout: 120_000 }).catch(() => errors.push("Kit không khởi động được (p5/p5.brush)"));
  const gpu: string = await page.evaluate("gpuInfo()").catch(() => "?") as string;
  return { page, errors, gpu };
}

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch({ executablePath: process.env.CVS_CHROMIUM_PATH || undefined, args: glArgs() });
}

async function frameAt(page: import("playwright").Page, t: number, q = 0.9): Promise<Buffer> {
  const url = (await page.evaluate(([t, q]) => (globalThis as any).renderAt(t, "image/jpeg", q), [t, q] as const)) as string;
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

export type CartoonCheck = { errors: string[]; ms: number[]; gpu: string; frames: { t: number; jpg: Buffer }[] };

/** Thử vẽ vài khung (bắt lỗi chạy, đo tốc độ, ảnh để soát) – dùng khi nhận mã cảnh từ AI. */
export async function checkCartoon(i: CartoonInput, times?: number[]): Promise<CartoonCheck> {
  const errs = lintCartoon(i.code, { clawd: i.clawd });
  if (errs.length) return { errors: errs, ms: [], gpu: "", frames: [] };
  const ts = times ?? [0.05, ...i.cues.map((c, k) => Math.min(i.dur - 0.05, (c + i.ends[k]) / 2)), i.dur - 0.1].filter((t, k, a) => t >= 0 && a.indexOf(t) === k).slice(0, 8);
  const browser = await launch();
  try {
    const { page, errors, gpu } = await openPage(browser, i);
    const frames: CartoonCheck["frames"] = [];
    const ms: number[] = [];
    for (const t of errors.length ? [] : ts) {
      const t0 = Date.now();
      try {
        frames.push({ t, jpg: await frameAt(page, t, 0.8) });
      } catch (e) {
        errors.push(`t=${t.toFixed(2)}s: ${(e as Error).message.split("\n")[0]}`);
        break;
      }
      ms.push(Date.now() - t0);
      if (errors.length) break;
    }
    return { errors: [...new Set(errors)].map((e) => e.slice(0, 400)), ms, gpu, frames };
  } finally {
    await browser.close();
  }
}

export type CartoonProgress = { frame: number; total: number; msPerFrame: number; gpu: string };

/** Render clip MP4 (H.264, 12 khung/giây, không tiếng) vào outFile; có sẵn (cùng mã đệm) thì bỏ qua. */
export async function renderCartoon(i: CartoonInput, outFile: string, o: { onProgress?: (p: CartoonProgress) => void; shouldStop?: () => boolean } = {}): Promise<{ file: string; cached: boolean; gpu: string }> {
  if (existsSync(outFile)) return { file: outFile, cached: true, gpu: "" };
  const errs = lintCartoon(i.code, { clawd: i.clawd });
  if (errs.length) throw new Error(`Mã cảnh hoạt hình lỗi: ${errs.join("; ")}`);
  mkdirSync(dirname(outFile), { recursive: true });
  const part = `${outFile}.part.mp4`;
  const total = Math.max(1, Math.ceil(i.dur * CARTOON_FPS));
  const browser = await launch();
  const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(CARTOON_FPS), "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-g", String(CARTOON_FPS), "-r", String(CARTOON_FPS), "-movflags", "+faststart", part], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d));
  const done = new Promise<void>((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg lỗi: ${ffErr.slice(-400)}`)))));
  let gpu = "";
  try {
    const p = await openPage(browser, i);
    gpu = p.gpu;
    if (p.errors.length) throw new Error(`Cảnh hoạt hình lỗi khi nạp: ${p.errors[0]}`);
    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      if (o.shouldStop?.()) throw new Error("Đã dừng");
      const jpg = await frameAt(p.page, Math.min(i.dur - 1e-3, f / CARTOON_FPS));
      if (p.errors.length) throw new Error(`Cảnh hoạt hình lỗi ở khung ${f}: ${p.errors[0]}`);
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 6 === 0 || f === total - 1) o.onProgress?.({ frame: f + 1, total, msPerFrame: Math.round((Date.now() - t0) / (f + 1)), gpu });
    }
  } catch (e) {
    ff.stdin.destroy();
    await done.catch(() => {});
    rmSync(part, { force: true });
    throw e;
  } finally {
    await browser.close();
  }
  ff.stdin.end();
  await done;
  renameSync(part, outFile);
  return { file: outFile, cached: false, gpu };
}

/** Ước tính thời gian render (giây) theo tốc độ đo được. */
export const estimateSeconds = (dur: number, msPerFrame: number) => Math.round((dur * CARTOON_FPS * msPerFrame) / 1000);
