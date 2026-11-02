"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Check, ErrorBox, Msg, Progress } from "@/components/ui";

type Step = { id: string; label: string; state: "wait" | "run" | "ok" | "warn" | "fail"; detail?: string; pct?: number };
type Status = { done: boolean; running: boolean; ok: boolean | null; steps: Step[]; log: string[] };

const MARK = { ok: "ok", warn: "warn", fail: "bad", wait: "off", run: "off" } as const;

/** Lần đầu mở bản cài: tải trình duyệt, kiểm tra ffmpeg, cài CIT… có tiến độ, thay cho cửa sổ dòng lệnh. */
export default function FirstRunPage() {
  const { data: d, error, setData } = useApi<Status>("/setup/status", 1000);
  const a = useAction();
  const started = useRef(false);
  const start = () => a.run(async () => setData(await api<Status>("/setup/run", { method: "POST", json: {} })));

  useEffect(() => {
    if (d && !d.done && !d.running && d.ok === null && !started.current) {
      started.current = true;
      start();
    }
  });

  const success = !!d && !d.running && (d.ok ?? d.done) === true;
  const failed = !!d && !d.running && d.ok === false;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-semibold leading-tight sm:text-[26px]">{success ? "Đã chuẩn bị xong" : "Đang chuẩn bị lần đầu"}</h1>
      <p className="mt-1 mb-5 text-soft">
        Ứng dụng tải các thành phần cần để dựng video (trình duyệt Chromium, giọng đọc CIT Voice Studio…) vào thư mục dữ liệu trên máy. Cần Internet; mất vài phút, chỉ làm một lần.
      </p>
      <ErrorBox error={error} />
      <ol className="card space-y-3" aria-live="polite">
        {(d?.steps.length ? d.steps : []).map((s) => (
          <li key={s.id} className="flex gap-3">
            <span className="mt-0.5">
              {s.state === "run" ? <span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-brand border-t-transparent motion-reduce:animate-none" role="img" aria-label="đang làm" /> : <Check s={MARK[s.state]} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${s.state === "wait" ? "text-soft" : ""}`}>{s.label}</div>
              {s.state === "run" && (
                <div className="mt-1.5">
                  <Progress value={s.pct ?? 0} />
                </div>
              )}
              {s.detail && <div className={`mt-0.5 break-words text-[13px] ${s.state === "fail" ? "text-danger" : "text-soft"}`}>{s.detail}</div>}
            </div>
          </li>
        ))}
        {!d?.steps.length && <li className="text-soft">{d?.done ? "Máy này đã chuẩn bị xong từ trước." : "Đang bắt đầu…"}</li>}
      </ol>
      <Msg msg={a.msg} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {success && <Link href="/" className="btn btn-primary">Vào ứng dụng</Link>}
        {failed && <button className="btn btn-primary" disabled={a.busy} onClick={start}>Thử lại</button>}
        {success && <button className="btn" disabled={a.busy} onClick={start}>Kiểm tra lại</button>}
        {!success && <Link href="/" className="ml-auto text-[13px] text-soft underline-offset-2 hover:underline">Bỏ qua, vào ứng dụng</Link>}
      </div>
      {!!d?.log.length && (
        <details className="mt-4 text-[13px]">
          <summary className="cursor-pointer text-soft">Chi tiết kỹ thuật</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-white/80">{d.log.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
