// Chuẩn bị lần đầu: phông, ffmpeg, trình duyệt (Playwright / HyperFrames / Remotion), CIT Voice Studio.
// Dùng chung cho trang "Đang chuẩn bị lần đầu" của bản cài (qua /api/setup/*) và lệnh `pnpm run cai-dat` (scripts/setup.ts).
// Bản cài đặt PLAYWRIGHT_BROWSERS_PATH, CVS_CIT_DIR… vào thư mục dữ liệu và chạy worker với cwd = thư mục runtime,
// nên trình duyệt của Remotion (tải theo cwd) cũng nằm ngoài thư mục cài.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { REPO_ROOT, STORAGE } from "@cvs/db";
import { THEMES, checkThemeFonts, fontFaceCss } from "@cvs/themes";
import { CitClient, FFMPEG, FFPROBE, citManagerState, findCitExecutable, installCit, installZerotts, run, zerottsInstalled } from "@cvs/tts";

export type SetupState = "wait" | "run" | "ok" | "warn" | "fail";
export type SetupStep = { id: string; label: string; state: SetupState; detail?: string; pct?: number };

export const SETUP_MARKER = join(STORAGE, ".setup-done");
export const setupDone = () => existsSync(SETUP_MARKER);

const engineHf = createRequire(join(REPO_ROOT, "packages", "engine-hf", "package.json"));
const binOf = (pkg: string, file: string) => join(dirname(engineHf.resolve(`${pkg}/package.json`)), file);

/** Chạy một CLI Node (không qua npx – bản cài không có npx trên PATH), đọc "%" trong output làm tiến độ. */
function runNodeCli(args: string[], cwd: string, onPct: (pct: number) => void, log: (s: string) => void): Promise<boolean> {
  return new Promise((ok) => {
    const p = spawn(process.execPath, args, { cwd, env: { ...process.env, HYPERFRAMES_NO_UPDATE_CHECK: "1", CI: "1" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const onData = (d: Buffer) => {
      const s = d.toString();
      log(s);
      const m = [...s.matchAll(/(\d{1,3})(?:\.\d+)?\s?%/g)].pop();
      if (m) onPct(Math.min(100, Number(m[1])));
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("error", (e) => (log(String(e)), ok(false)));
    p.on("close", (code) => ok(code === 0));
  });
}

type Opts = {
  /** Lệnh `pnpm run cai-dat` của nhà phát triển: thêm file mẫu + dựng giao diện. */
  dev?: boolean;
  fontsOnly?: boolean;
  onChange?: (steps: SetupStep[]) => void;
  log?: (s: string) => void;
};

export async function runSetup(opts: Opts = {}): Promise<{ ok: boolean; steps: SetupStep[] }> {
  const log = opts.log ?? (() => undefined);
  const ids: [string, string][] = [
    ["fonts", "Phông chữ tiếng Việt"],
    ...(opts.fontsOnly ? [] : ([
      ...(opts.dev ? [["fixtures", "File mẫu (fixtures)"]] : []),
      ["ffmpeg", "ffmpeg / ffprobe"],
      ["playwright", "Trình duyệt Chromium (xem trước, render dự phòng)"],
      ["hyperframes", "Trình duyệt cho HyperFrames"],
      ["remotion", "Trình duyệt cho Remotion"],
      ["cit", "Giọng đọc CIT Voice Studio"],
      ...(process.env.CVS_ZEROTTS_AUTO_INSTALL === "1" ? [["zerotts", "Giọng thứ hai ZeroTTS"]] : []),
      ...(opts.dev ? [["web", "Dựng giao diện"]] : []),
    ] as [string, string][])),
  ];
  const steps: SetupStep[] = ids.map(([id, label]) => ({ id, label, state: "wait" }));
  const set = (id: string, patch: Partial<SetupStep>) => {
    Object.assign(steps.find((s) => s.id === id)!, patch);
    opts.onChange?.(steps.map((s) => ({ ...s })));
  };
  const step = async (id: string, fn: (pct: (n: number, detail?: string) => void) => Promise<[SetupState, string?]>) => {
    if (!steps.some((s) => s.id === id)) return;
    set(id, { state: "run", pct: 0 });
    log(`\n[${id}]\n`);
    try {
      const [state, detail] = await fn((n, detail) => set(id, { pct: n, ...(detail ? { detail } : {}) }));
      set(id, { state, detail, pct: 100 });
    } catch (e) {
      set(id, { state: "fail", detail: (e as Error).message });
    }
  };

  await step("fonts", async () => {
    const missing: string[] = [];
    for (const t of Object.values(THEMES)) {
      const r = await checkThemeFonts(t);
      await fontFaceCss(t);
      if (!r.ok) missing.push(`${t.name}: thiếu ${r.missing.map((m) => `${m.family} ${m.weight}: ${m.chars}`).join("; ")}`);
    }
    return missing.length ? ["warn", missing.join(" · ")] : ["ok", "Đủ ký tự tiếng Việt cho mọi chủ đề"];
  });
  await step("fixtures", async () =>
    (await runNodeCli(["--import", "tsx", join(REPO_ROOT, "scripts", "make-fixtures.ts")], REPO_ROOT, () => undefined, log)) ? ["ok", "fixtures/*.docx, *.xlsx"] : ["warn", "Không tạo được file mẫu"],
  );
  await step("ffmpeg", async () => {
    const out: string[] = [];
    for (const b of [FFMPEG, FFPROBE]) {
      const r = await run(b, ["-version"]).catch(() => null);
      if (!r || r.code !== 0) throw new Error(`Không chạy được ${b}`);
      out.push(r.stdout.toString().match(/^(\S+) version (\S+)/)?.slice(1).join(" ") ?? b);
    }
    return ["ok", out.join(" · ")];
  });
  await step("playwright", async (pct) =>
    (await runNodeCli([binOf("playwright", "cli.js"), "install", "chromium"], REPO_ROOT, pct, log))
      ? ["ok", process.env.PLAYWRIGHT_BROWSERS_PATH ? `Trong ${process.env.PLAYWRIGHT_BROWSERS_PATH}` : "Đã có Chromium"]
      : [opts.dev ? "warn" : "fail", "Không tải được Chromium – kiểm tra Internet rồi thử lại"],
  );
  await step("hyperframes", async (pct) =>
    (await runNodeCli([binOf("hyperframes", join("bin", "hyperframes.mjs")), "browser", "ensure"], REPO_ROOT, pct, log))
      ? ["ok", "Đã có trình duyệt"]
      : ["warn", "Chưa có – HyperFrames sẽ dùng render dự phòng"],
  );
  await step("remotion", async (pct) => {
    const { ensureBrowser } = await import("@remotion/renderer");
    const st = await ensureBrowser({
      browserExecutable: process.env.CVS_REMOTION_BROWSER || null,
      onBrowserDownload: () => ({ version: null, onProgress: (p) => pct(Math.round(p.percent * 100)) }),
    });
    return ["ok", st.type === "user-defined-path" ? `Dùng ${st.path}` : "Chrome Headless Shell"];
  });
  await step("cit", async (pct) => {
    // worker có thể đang tự cài CIT lúc khởi động → chờ, không cài trùng
    while (citManagerState().installing) {
      const s = citManagerState();
      pct(s.progress, s.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if ((await new CitClient({ retries: 0 }).status()).ok) return ["ok", "Đang chạy"];
    const found = findCitExecutable();
    if (found) return ["ok", "Đã cài"];
    const exe = await installCit((p, m) => pct(p, m));
    return ["ok", `Đã cài vào ${exe}`];
  });
  await step("zerotts", async (pct) => {
    if (zerottsInstalled()) return ["ok", "Đã cài"];
    const model = await installZerotts((p, m) => pct(p, m));
    return ["ok", `Mô hình: ${model}`];
  });
  await step("web", async () => {
    const ok = await new Promise<boolean>((r) => {
      const p = spawn("pnpm", ["--filter", "@cvs/web", "build"], { cwd: REPO_ROOT, stdio: "inherit", shell: process.platform === "win32" });
      p.on("error", () => r(false));
      p.on("close", (c) => r(c === 0));
    });
    if (!ok) throw new Error("Dựng giao diện lỗi");
    return ["ok"];
  });

  const ok = !steps.some((s) => s.state === "fail");
  if (ok && !opts.fontsOnly) {
    mkdirSync(STORAGE, { recursive: true });
    writeFileSync(SETUP_MARKER, JSON.stringify({ at: new Date().toISOString() }));
  }
  return { ok, steps };
}

// ---------- trạng thái cho trang "Đang chuẩn bị lần đầu" ----------
const st = { running: false, steps: [] as SetupStep[], ok: null as boolean | null, log: [] as string[] };

export function setupStatus() {
  return { done: setupDone(), running: st.running, ok: st.ok, steps: st.steps, log: st.log.slice(-30) };
}

/** Chạy nền (một lần một lúc); giao diện đọc tiến độ qua setupStatus(). */
export function startSetup() {
  if (st.running) return;
  st.running = true;
  st.ok = null;
  st.log = [];
  runSetup({
    onChange: (s) => (st.steps = s),
    log: (s) => {
      for (const l of s.split(/\r?\n|\r/)) if (l.trim()) st.log.push(l.trim().slice(0, 300));
      if (st.log.length > 200) st.log.splice(0, st.log.length - 200);
    },
  })
    .then((r) => (st.ok = r.ok))
    .catch((e) => (st.log.push(String(e)), (st.ok = false)))
    .finally(() => (st.running = false));
}
