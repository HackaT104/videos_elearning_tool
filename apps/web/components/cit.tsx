"use client";
import { useApi } from "@/lib/hooks";

export function CitLight() {
  const { data } = useApi<{ ok: boolean; voices?: number; error?: string; url: string; mock: boolean }>("/tts/status", 5000);
  if (!data) return <span className="text-xs text-soft">Đang kiểm tra CIT…</span>;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${data.ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {data.ok ? `CIT Voice Studio sẵn sàng · ${data.voices} giọng` : "Hãy mở CIT Voice Studio"} <span className="text-soft">({data.url})</span>
      {data.mock && <b className="text-amber-700">· chế độ giọng GIẢ LẬP</b>}
    </span>
  );
}
