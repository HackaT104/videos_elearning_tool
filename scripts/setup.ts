// Cài đặt lần đầu (KHOI_DONG.cmd gọi): tải trình duyệt cho Playwright/HyperFrames/Remotion, kiểm tra phông, ffmpeg, CIT, dựng giao diện.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { THEMES, checkThemeFonts, fontFaceCss } from "@cvs/themes";
import { CitClient, FFMPEG, FFPROBE, findCitExecutable, installCit, installZerotts, run, zerottsInstalled } from "@cvs/tts";

const ROOT = join(import.meta.dirname, "..");
const fontsOnly = process.argv.includes("--fonts-only");
const ok = (s: string) => console.log(`  ✓ ${s}`);
const warn = (s: string) => console.log(`  ⚠ ${s}`);
const sh = (cmd: string, args: string[], cwd = ROOT) => spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" }).status === 0;

console.log("\n[1] Phông chữ tiếng Việt (cmap) + phông ký hiệu");
let fontsOk = true;
for (const t of Object.values(THEMES)) {
  const r = await checkThemeFonts(t);
  await fontFaceCss(t);
  if (r.ok) ok(`${t.name}: đủ ký tự tiếng Việt`);
  else {
    fontsOk = false;
    warn(`${t.name}: thiếu ${r.missing.map((m) => `${m.family} ${m.weight}: ${m.chars}`).join("; ")}`);
  }
}
if (fontsOnly) process.exit(fontsOk ? 0 : 1);

console.log("\n[2] File mẫu (fixtures) + ffmpeg / ffprobe");
sh("npx", ["tsx", "scripts/make-fixtures.ts"]) ? ok("fixtures/*.docx, *.xlsx") : warn("Không tạo được file mẫu");
for (const b of [FFMPEG, FFPROBE]) {
  const r = await run(b, ["-version"]).catch(() => null);
  r && r.code === 0 ? ok(r.stdout.toString().split("\n")[0]) : warn(`Không chạy được ${b}`);
}

console.log("\n[3] Trình duyệt Chromium");
sh("npx", ["playwright", "install", "chromium"], join(ROOT, "packages", "engine-hf")) ? ok("Playwright Chromium (xem trước + render dự phòng)") : warn("Không cài được Chromium cho Playwright");
sh("npx", ["hyperframes", "browser", "ensure"], join(ROOT, "packages", "engine-hf")) ? ok("HyperFrames browser") : warn("HyperFrames chưa có trình duyệt – sẽ dùng render dự phòng");
try {
  const { ensureBrowser } = await import("@remotion/renderer");
  await ensureBrowser();
  ok("Remotion Chrome Headless Shell");
} catch (e) {
  warn(`Remotion chưa tải được trình duyệt: ${(e as Error).message} (đặt CVS_REMOTION_BROWSER trong .env nếu cần)`);
}

console.log("\n[4] CIT Voice Studio (thành phần bắt buộc, cài kèm ứng dụng)");
if ((await new CitClient().status()).ok) ok("Đang chạy sẵn trên máy");
else if (findCitExecutable()) ok(`Đã cài: ${findCitExecutable()}`);
else {
  try {
    let last = -10;
    const exe = await installCit((p, m) => { if (p - last >= 10 || p === 100) { last = p; console.log(`    ${p}% ${m}`); } });
    ok(`Đã cài vào ${exe}`);
  } catch (e) {
    warn(`Không tự cài được CIT Voice Studio: ${(e as Error).message}. Tải tay tại https://github.com/Cuongyd196/cit-voice-studio/releases rồi chạy lại.`);
  }
}
console.log("    Dùng CIT Voice Studio là đồng ý Điều khoản sử dụng: https://github.com/Cuongyd196/cit-voice-studio/blob/main/DIEU-KHOAN.md");
if (process.env.CVS_ZEROTTS_AUTO_INSTALL === "1") {
  console.log("\n[4b] ZeroTTS (giọng thứ hai, MIT – tuỳ chọn vì CVS_ZEROTTS_AUTO_INSTALL=1)");
  if (zerottsInstalled()) ok("Đã cài ZeroTTS");
  else {
    try {
      let last = -10;
      const model = await installZerotts((p, m) => { if (p - last >= 10 || p === 100) { last = p; console.log(`    ${p}% ${m}`); } });
      ok(`Đã cài ZeroTTS (mô hình: ${model})`);
    } catch (e) {
      warn(`Không cài được ZeroTTS: ${(e as Error).message}. Có thể cài sau trên trang Giọng đọc.`);
    }
  }
}
console.log(process.env.ANTHROPIC_API_KEY ? "  ✓ Có ANTHROPIC_API_KEY" : "  ⚠ Chưa có ANTHROPIC_API_KEY trong .env – thiết kế cảnh dùng chế độ tự động, không viết kịch bản bằng AI.");

console.log("\n[5] Dựng giao diện");
sh("pnpm", ["--filter", "@cvs/web", "build"]) ? ok("Đã dựng giao diện") : (warn("Dựng giao diện lỗi"), process.exit(1));
console.log("\nCài đặt xong.\n");
