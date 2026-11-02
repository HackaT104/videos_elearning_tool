// Điều khiển ứng dụng trên máy tính: thoát hẳn (worker + CIT/ZeroTTS/Claude Code; launcher/concurrently tắt nốt giao diện).
import { stopCit, stopZerotts } from "@cvs/tts";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLoopbackAddr = (a?: string | null) => !!a && (a === "::1" || /^(::ffff:)?127\.\d+\.\d+\.\d+$/.test(a));
const hostOf = (v: string) => {
  try {
    return new URL(v.includes("://") ? v : `http://${v}`).hostname;
  } catch {
    return "";
  }
};

/**
 * Yêu cầu đến từ chính máy này? Worker chỉ nghe 127.0.0.1 nên mọi yêu cầu đều qua proxy Next (localhost);
 * vì vậy xét thêm Host gốc (x-forwarded-host), Origin, Sec-Fetch-Site và bắt buộc JSON (trang lạ không gửi được nếu không qua preflight CORS).
 */
export function isLocalRequest(remote: string | undefined, h: { get(name: string): string | null | undefined }): boolean {
  if (!isLoopbackAddr(remote)) return false;
  if (!(h.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return false;
  const fwdFor = h.get("x-forwarded-for");
  if (fwdFor && fwdFor.split(",").some((ip) => !isLoopbackAddr(ip.trim()))) return false;
  for (const k of ["x-forwarded-host", "origin", "host"]) {
    const v = h.get(k);
    if (v && !LOOPBACK_HOSTS.has(hostOf(v))) return false;
  }
  const site = h.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/** Thay được trong test. */
export const appExit = { exit: (code: number) => process.exit(code) as never };

let quitting = false;
/** Trả lời yêu cầu xong rồi mới thoát; trình xử lý "exit" (index.ts, claude-code-runner) dừng nốt tiến trình con. */
export function quitApp() {
  if (quitting) return;
  quitting = true;
  console.log("Thoát ứng dụng theo yêu cầu");
  setTimeout(() => {
    stopCit();
    stopZerotts();
    appExit.exit(0);
  }, 300);
}
