// Gọi API (proxy tới worker). Lỗi → ném Error với thông báo tiếng Việt từ máy chủ.
export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 500 && typeof data === "string" && /ECONNREFUSED|socket hang up/i.test(data)) throw new Error("Worker chưa chạy – hãy mở bằng KHOI_DONG.cmd");
    throw new Error(data?.error ?? `Lỗi ${res.status}`);
  }
  return data as T;
}

export const fileUrl = (path: string, download = false) => `/api/files?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;

export const fmtSec = (s: number) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};
