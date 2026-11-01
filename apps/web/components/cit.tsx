"use client";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

type Manager = { installed: boolean; running: boolean; managed: boolean; installing: boolean; progress: number; message: string; error: string | null; version: string };
type Status = { ok: boolean; voices?: number; error?: string; url: string; mock: boolean; manager: Manager; terms: string };

/** Trạng thái CIT Voice Studio (thành phần bắt buộc nằm trong ứng dụng) + nút cài / khởi động lại. */
export function CitLight({ full = false }: { full?: boolean }) {
  const { data, reload } = useApi<Status>("/tts/status", 4000);
  const a = useAction();
  if (!data) return <span className="text-xs text-soft">Đang kiểm tra CIT…</span>;
  const m = data.manager;
  const dot = data.ok ? "bg-brand" : m.installing || /khởi động/i.test(m.message) ? "bg-warn animate-pulse" : "bg-danger";
  const text = data.ok
    ? `CIT Voice Studio đang chạy · ${data.voices} giọng`
    : m.installing
      ? `${m.message} (${m.progress}%)`
      : /khởi động/i.test(m.message)
        ? "Đang khởi động CIT Voice Studio…"
        : m.installed
          ? "CIT Voice Studio đang tắt"
          : "Chưa cài CIT Voice Studio";
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 rounded-full bg-white px-3 py-1 text-xs shadow-[0_0_0_1px_rgb(19_34_43/0.12)] ${full ? "w-full rounded-lg py-2" : ""}`}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
      <span>{text}</span>
      {data.mock && <b className="text-amber-700">· giọng GIẢ LẬP</b>}
      {!data.ok && !m.installing && !m.installed && (
        <button className="btn py-0.5 text-xs" disabled={a.busy} onClick={() => a.run(async () => { await api("/cit/install", { method: "POST" }); reload(); })}>Cài CIT (~480 MB)</button>
      )}
      {!data.ok && !m.installing && m.installed && (
        <button className="btn py-0.5 text-xs" disabled={a.busy} onClick={() => a.run(async () => { await api("/cit/restart", { method: "POST" }); reload(); })}>Khởi động CIT</button>
      )}
      {data.ok && full && (
        <button className="btn py-0.5 text-xs" disabled={a.busy} onClick={() => a.run(async () => { await api("/cit/restart", { method: "POST" }); reload(); })}>Khởi động lại</button>
      )}
      {full && <a className="text-soft underline" href={data.terms} target="_blank" rel="noreferrer">Điều khoản CIT</a>}
      {m.error && !data.ok && <span className="text-danger">{m.error}</span>}
    </span>
  );
}
