// Cài đặt lần đầu cho nhà phát triển (KHOI_DONG.cmd / `pnpm run cai-dat`): cùng các bước với trang "Đang chuẩn bị lần đầu"
// của bản cài (apps/worker/src/setup.ts), thêm file mẫu + dựng giao diện.
import { runSetup, type SetupStep } from "../apps/worker/src/setup";

const fontsOnly = process.argv.includes("--fonts-only");
const shown = new Map<string, string>();
const show = (steps: SetupStep[]) => {
  for (const s of steps) {
    const line = s.state === "run" ? `… ${s.label}${s.pct ? ` ${s.pct}%` : ""}` : s.state === "wait" ? "" : `${s.state === "ok" ? "✓" : "⚠"} ${s.label}${s.detail ? `: ${s.detail}` : ""}`;
    const key = s.state === "run" ? `${s.state}${Math.floor((s.pct ?? 0) / 10)}` : s.state;
    if (line && shown.get(s.id) !== key) {
      shown.set(s.id, key);
      console.log(`  ${line}`);
    }
  }
};
const r = await runSetup({ dev: true, fontsOnly, onChange: show });
if (!fontsOnly) {
  console.log("    Dùng CIT Voice Studio là đồng ý Điều khoản sử dụng: https://github.com/Cuongyd196/cit-voice-studio/blob/main/DIEU-KHOAN.md");
  console.log(process.env.ANTHROPIC_API_KEY ? "  ✓ Có ANTHROPIC_API_KEY" : "  ⚠ Chưa có ANTHROPIC_API_KEY trong .env – thiết kế cảnh dùng chế độ tự động, không viết kịch bản bằng AI.");
}
if (fontsOnly) process.exit(r.steps[0]?.state === "ok" ? 0 : 1);
console.log(r.ok ? "\nCài đặt xong.\n" : "\nCó bước lỗi – xem phía trên.\n");
process.exit(r.ok ? 0 : 1);
