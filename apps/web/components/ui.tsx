"use client";
import Link from "next/link";
import type { ReactNode } from "react";

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <div className={`mt-2 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>;
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "amber" | "red" | "blue"; children: ReactNode }) {
  const c = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800", blue: "bg-sky-100 text-sky-800" }[tone];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function PageHead({ step, title, children }: { step?: number; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {step ? <div className="text-xs font-semibold uppercase tracking-wider text-brand">Bước {step}</div> : null}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "red" | "amber" }) {
  const c = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-brand";
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
      <div className={`h-full ${c} transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const STATUS_LABEL: Record<string, [string, "slate" | "green" | "amber" | "red" | "blue"]> = {
  new: ["Mới", "slate"],
  script: ["Có kịch bản", "slate"],
  voiced: ["Có giọng", "blue"],
  designed: ["Đã dựng cảnh", "blue"],
  rendered: ["Đã render", "green"],
  approved: ["Đã duyệt", "green"],
  failed: ["Lỗi", "red"],
};

export function VideoPicker({ pid, videos, current, base }: { pid: string; videos: { key: string; title: string }[]; current?: string; base: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1">
      {videos.map((v) => (
        <Link key={v.key} href={`/p/${pid}/${base}/${encodeURIComponent(v.key)}`} className={`rounded border px-2 py-1 text-xs ${current === v.key ? "border-brand bg-brand text-white" : "border-line bg-white hover:bg-slate-50"}`} title={v.title}>
          {v.key}
        </Link>
      ))}
    </div>
  );
}
