"use client";
import Link from "next/link";
import type { ReactNode } from "react";

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div role="status" className={`msg mt-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-brand-tint text-brand-dark" : "bg-red-50 text-danger"}`}>
      {msg.text}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="msg rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>;
}

const TONES = {
  slate: "bg-[#eef1f0] text-soft",
  green: "bg-brand-tint text-brand-dark",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-danger",
  blue: "bg-sky-50 text-sky-800",
} as const;

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium ${TONES[tone]}`}>{children}</span>;
}

/** Tiêu đề trang. Bước là một trình tự thật (1–10) nên được đánh số, ghi bằng chữ thường. */
export function PageHead({ step, title, children }: { step?: number; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {step ? <div className="num mb-0.5 text-[13px] font-medium text-brand">Bước {step} / 10</div> : null}
        <h1 className="text-[22px] font-semibold leading-tight sm:text-[26px]">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Dấu trạng thái của một điều kiện: dùng cả màu lẫn hình (✓ ! ✕ –) để không phụ thuộc vào màu. */
export function Check({ s }: { s: "ok" | "warn" | "bad" | "off" }) {
  const cls = { ok: "bg-brand text-white", warn: "bg-warn text-ink", bad: "bg-danger text-white", off: "bg-[#e4e9e7] text-soft" }[s];
  const label = { ok: "đạt", warn: "cần xem", bad: "chưa đạt", off: "không bắt buộc" }[s];
  return (
    <span className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${cls}`} role="img" aria-label={label}>
      {s === "ok" ? <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : s === "warn" ? "!" : s === "bad" ? "✕" : "–"}
    </span>
  );
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "red" | "amber" }) {
  const v = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className={`bar ${tone === "red" ? "danger" : tone === "amber" ? "warn" : ""}`} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

export const STATUS_LABEL: Record<string, [string, keyof typeof TONES]> = {
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
    <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {videos.map((v) => (
        <Link
          key={v.key}
          href={`/p/${pid}/${base}/${encodeURIComponent(v.key)}`}
          title={v.title}
          className={`num shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150 ${current === v.key ? "bg-ink text-white" : "bg-surface text-soft shadow-[0_0_0_1px_rgb(19_34_43/0.1)] hover:text-ink"}`}
        >
          {v.key}
        </Link>
      ))}
    </div>
  );
}

/** Lời nhắc khi mọi video đã duyệt mà dự án chưa được lưu ra ngoài. */
export function SaveBanner({ children }: { children: ReactNode }) {
  return (
    <div className="msg mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-tint px-4 py-3 text-brand-dark shadow-[0_0_0_1px_rgb(11_122_92/0.18)]" role="status">
      <div className="min-w-0">
        <div className="font-semibold">Video đã xong – chọn nơi lưu dự án</div>
        <div className="text-[13px]">Chọn một thư mục trên máy (ổ D:, OneDrive, ổ mạng…); ứng dụng chép video theo cấp độ kèm danh mục vào đó.</div>
      </div>
      {children}
    </div>
  );
}

