"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export type UpdateStatus = {
  current: string;
  repo: string;
  latest: { version: string; notes: string; url: string } | null;
  available: boolean;
  lastCheck: string | null;
  autoCheck: boolean;
  hasToken: boolean;
  tokenFromEnv: boolean;
  canInstall: boolean;
  checking: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  message: string;
};

/** Thoát / cập nhật chỉ làm được ngay trên máy tính chạy ứng dụng (không qua Wi-Fi). */
export function useIsLocal() {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)), []);
  return local;
}

/** Góc phải thanh trên: "Có bản mới x.y.z – Cập nhật" + menu Cài đặt / Thoát ứng dụng. */
export function AppMenu() {
  const { data } = useApi<UpdateStatus>("/update/status", 60_000);
  const local = useIsLocal();
  const [quit, setQuit] = useState<"no" | "busy" | "done">("no");
  const [err, setErr] = useState<string | null>(null);

  async function doQuit() {
    if (!window.confirm("Thoát Course Video Studio?\nViệc đang chạy sẽ tạm dừng và tự chạy tiếp ở lần mở sau.")) return;
    setQuit("busy");
    try {
      await api("/app/quit", { method: "POST", json: {} });
      setQuit("done");
      setTimeout(() => window.close(), 800);
    } catch (e) {
      setErr((e as Error).message);
      setQuit("no");
    }
  }

  if (quit === "done")
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-paper p-6 text-center text-ink" role="status">
        <div>
          <div className="text-[20px] font-semibold">Đã thoát Course Video Studio</div>
          <p className="mt-1 text-soft">Có thể đóng cửa sổ này. Mở lại bằng biểu tượng Course Video Studio trên Start Menu hoặc màn hình nền.</p>
        </div>
      </div>
    );

  return (
    <div className="ml-auto flex items-center gap-3 text-[13px]">
      {data?.available && data.latest && (
        <Link href="/cai-dat" className="hidden rounded-md bg-white/12 px-2 py-1 font-medium text-white transition-colors duration-150 hover:bg-white/20 sm:inline">
          Có bản mới {data.latest.version} – Cập nhật
        </Link>
      )}
      <details className="menu">
        <summary className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-white/70 hover:text-white" aria-label="Menu ứng dụng">
          {data?.available && <span className="inline-block h-2 w-2 rounded-full bg-[#9be7c8]" aria-label="có bản mới" />}
          Ứng dụng
        </summary>
        <div className="menu-pop text-ink">
          {data?.available && data.latest && (
            <Link href="/cai-dat">
              Có bản mới {data.latest.version} – Cập nhật
              <small>Đang dùng {data.current}</small>
            </Link>
          )}
          <Link href="/cai-dat">
            Cài đặt &amp; cập nhật
            <small>Phiên bản {data?.current ?? "…"}</small>
          </Link>
          {local && (
            <button type="button" onClick={doQuit} disabled={quit === "busy"}>
              {quit === "busy" ? "Đang thoát…" : "Thoát ứng dụng"}
              <small>Dừng ứng dụng, giọng đọc CIT/ZeroTTS chạy kèm</small>
            </button>
          )}
          {err && <div className="px-2.5 py-1.5 text-[12px] text-danger">{err}</div>}
        </div>
      </details>
    </div>
  );
}

/** "Phiên bản x.y.z" ở chân trang. */
export function AppVersion() {
  const { data } = useApi<{ version?: string }>("/health");
  return data?.version ? <span className="num">Phiên bản {data.version}</span> : null;
}
