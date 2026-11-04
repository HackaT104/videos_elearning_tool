// Gọi Claude API (Anthropic SDK). Khóa lấy từ ANTHROPIC_API_KEY trong .env.
// Mặc định claude-opus-5-5, thinking adaptive, streaming; bật fallbacks phía máy chủ khi bị từ chối (refusal).

import Anthropic from "@anthropic-ai/sdk";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_MODEL = process.env.CVS_CLAUDE_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** Gọi khi đổi cách đăng nhập (khoá mới, đăng nhập/đăng xuất tài khoản) để tạo lại client. */
export function resetClaudeClient() {
  client = null;
  blocked = null;
}

/** Tài khoản API hết tiền / khoá sai → tạm coi như chưa có Claude (giao diện chuyển sang đường Claude Code). Tự hết sau 10 phút để nạp tiền xong là dùng lại được. */
let blocked: { reason: string; until: number } | null = null;
export function aiBlockedReason(): string | null {
  if (blocked && Date.now() > blocked.until) blocked = null;
  return blocked?.reason ?? null;
}
function block(reason: string): never {
  blocked = { reason, until: Date.now() + 10 * 60_000 };
  throw new AiError(reason);
}

function hasProfile(): boolean {
  const dir = process.env.ANTHROPIC_CONFIG_DIR ?? (process.platform === "win32" ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Anthropic") : join(homedir(), ".config", "anthropic"));
  try {
    return readdirSync(join(dir, "credentials")).some((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
}

/** Có thông tin đăng nhập Claude: khoá API, mã truy cập, hoặc hồ sơ đăng nhập tài khoản Anthropic (ant auth login). */
/**
 * Người dùng chọn có cho dùng Claude API hay không (worker đặt theo cài đặt; mặc định của ứng dụng là KHÔNG – dùng gói Claude
 * qua Claude Code). Tắt thì mọi việc AI đi đường Claude Code, kể cả khi máy có khoá API / đăng nhập Console.
 */
let apiAllowed = true;
export function setApiAllowed(v: boolean) {
  apiAllowed = v;
}
export function apiIsAllowed() {
  return apiAllowed;
}

export function aiAvailable(): boolean {
  if (!apiAllowed) return false;
  if (aiBlockedReason()) return false;
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || hasProfile());
}

export class AiError extends Error {}

export type AskOptions = {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  model?: string;
};

/** Một lượt hỏi – trả về văn bản cuối (streaming để tránh timeout với đầu ra dài). */
export async function ask(o: AskOptions): Promise<string> {
  const c = claude();
  try {
    const stream = c.beta.messages.stream({
      model: o.model ?? DEFAULT_MODEL,
      max_tokens: o.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: o.effort ?? "high" },
      system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: o.content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new AiError(`Claude từ chối yêu cầu (${msg.stop_details?.category ?? "không rõ"})`);
    if (msg.stop_reason === "max_tokens") throw new AiError("Câu trả lời của Claude bị cắt (max_tokens)");
    return msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) block("Khoá Claude API không hợp lệ hoặc đã bị thu hồi – vào mục Claude AI để đổi khoá, hoặc dùng Claude Code (gói đã đăng ký)");
    if (e instanceof Anthropic.APIError && /credit balance/i.test(e.message))
      block("Tài khoản Claude API đã hết tiền (credit) – nạp thêm ở console.anthropic.com → Billing, hoặc bấm \"Gửi cho Claude Code\" để dùng gói đã đăng ký");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude API đang giới hạn tốc độ – thử lại sau ít phút");
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("Không kết nối được Claude API – kiểm tra mạng");
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude API lỗi ${e.status}: ${e.message}`);
    throw e;
  }
}

/** Lấy khối JSON đầu tiên trong câu trả lời (có thể nằm trong ```json … ```). */
export function extractJson<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.search(/[{[]/);
  if (start < 0) throw new AiError("Claude không trả về JSON");
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let str = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (str) {
      if (ch === "\\") i++;
      else if (ch === '"') str = false;
      continue;
    }
    if (ch === '"') str = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(raw.slice(start, i + 1)) as T;
  }
  throw new AiError("JSON của Claude không đóng ngoặc");
}

/** Hỏi và parse JSON; nếu validate trả lỗi thì gửi lại kèm lỗi (tối đa `retries` vòng). */
export async function askJson<T>(o: AskOptions, validate: (v: T) => string[] = () => [], retries = 2): Promise<T> {
  let content = o.content;
  let lastErr = "";
  for (let i = 0; i <= retries; i++) {
    const text = await ask({ ...o, content });
    try {
      const v = extractJson<T>(text);
      const errs = validate(v);
      if (errs.length === 0) return v;
      lastErr = errs.join("\n");
    } catch (e) {
      lastErr = (e as Error).message;
    }
    const base = typeof o.content === "string" ? [{ type: "text" as const, text: o.content }] : o.content;
    content = [...base, { type: "text", text: `Lần trả lời trước không hợp lệ:\n${lastErr}\nHãy trả lại DUY NHẤT JSON đã sửa.` }];
  }
  throw new AiError(`Claude không trả về JSON hợp lệ sau ${retries + 1} lần: ${lastErr}`);
}
