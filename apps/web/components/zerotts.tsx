"use client";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Progress } from "@/components/ui";

type Manager = { installed: boolean; running: boolean; managed: boolean; installing: boolean; progress: number; message: string; error: string | null; int8: boolean; fake: boolean };
type Status = { ok: boolean; voices?: number; fake?: boolean; error?: string; url: string; mock: boolean; manager: Manager; repo: string };

/** Trạng thái ZeroTTS (giọng thứ hai, cài khi người dùng bấm) + nút cài / khởi động lại. */
export function ZerottsLight({ full = false }: { full?: boolean }) {
  const { data, reload } = useApi<Status>("/zerotts/status", 3000);
  const a = useAction();
  if (!data) return <span className="text-xs text-soft">Đang kiểm tra ZeroTTS…</span>;
  const m = data.manager;
  const starting = /khởi động/i.test(m.message) && !data.ok;
  const dot = data.ok ? "bg-brand" : m.installing || starting ? "bg-warn animate-pulse" : m.installed ? "bg-danger" : "bg-line";
  const text = data.ok
    ? `ZeroTTS đang chạy · ${data.voices} giọng${m.int8 ? " · bản int8" : ""}`
    : m.installing
      ? `${m.message} (${m.progress}%)`
      : starting
        ? "Đang khởi động ZeroTTS (nạp mô hình)…"
        : m.installed
          ? "ZeroTTS đang tắt"
          : "Chưa cài ZeroTTS";
  const post = (path: string) => a.run(async () => { await api(path, { method: "POST" }); reload(); });
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-3 py-1 text-xs shadow-[0_0_0_1px_rgb(19_34_43/0.12)] ${full ? "w-full rounded-lg py-2" : ""}`} role="status">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
      <span>{text}</span>
      {(data.mock || data.fake) && <b className="text-amber-700">· giọng GIẢ LẬP</b>}
      {!data.ok && !m.installing && !m.installed && (
        <button className="btn py-0.5 text-xs" disabled={a.busy} onClick={() => post("/zerotts/install")}>Cài ZeroTTS (tải ~0,3–0,9 GB)</button>
      )}
      {!data.ok && !m.installing && m.installed && !starting && (
        <button className="btn py-0.5 text-xs" disabled={a.busy} onClick={() => post("/zerotts/restart")}>Khởi động ZeroTTS</button>
      )}
      {data.ok && full && (
        <button className="btn py-0.5 text-xs" disabled={a.busy} onClick={() => post("/zerotts/restart")}>Khởi động lại</button>
      )}
      {full && <a className="text-soft underline" href={data.repo} target="_blank" rel="noreferrer">ZeroTTS (giấy phép MIT)</a>}
      {m.error && !m.installing && !data.ok && <span className="text-danger">{m.error}</span>}
      {m.installing && full && <div className="w-full"><Progress value={m.progress} /></div>}
    </div>
  );
}
