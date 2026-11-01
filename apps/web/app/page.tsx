"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { ErrorBox, Msg, PageHead } from "@/components/ui";
import { useRouter } from "next/navigation";

type P = { id: string; name: string; course: string; levels: string[]; created_at: string; videos: number };

export default function Home() {
  const { data, error } = useApi<P[]>("/projects");
  const health = useApi<{ ok: boolean; ai: boolean; storage: string }>("/health");
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [levels, setLevels] = useState<string[]>(["L1"]);
  const a = useAction();
  const router = useRouter();
  const toggle = (l: string) => setLevels((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l].sort()));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
      <section className="min-w-0">
        <PageHead title="Dự án">{data && data.length > 0 && <span className="num text-[13px] text-soft">{data.length} dự án</span>}</PageHead>
        <ErrorBox error={error ?? health.error} />
        {data && data.length > 0 && (
          <ul className="card divide-y divide-line/70 p-0">
            {data.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}/nguon`} className="row-link grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_110px_16px] sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                    <span className="num block text-[12px] text-soft">{p.course} · {p.levels.join(", ")}</span>
                  </span>
                  <span className="num text-right text-[13px] sm:text-left">{p.videos} video</span>
                  <span className="num hidden text-[13px] text-soft sm:block">{new Date(p.created_at).toLocaleDateString("vi-VN")}</span>
                  <svg className="hidden text-soft sm:block" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && data.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
            <div className="text-[15px] font-semibold">Chưa có dự án</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-soft">Tạo dự án đầu tiên: đặt tên khoá học, mã khoá và cấp độ, rồi tải tài liệu Word hoặc Excel lên.</p>
          </div>
        )}
      </section>
      <aside className="card h-fit lg:sticky lg:top-4">
        <h2 className="mb-4 text-base font-semibold">Tạo dự án mới</h2>
        <label className="label" htmlFor="np-name">Tên khoá học</label>
        <input id="np-name" className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tín chỉ carbon và Tiêu chuẩn VCS" />
        <label className="label" htmlFor="np-code">Mã khoá (tiền tố mã video)</label>
        <input id="np-code" className="input mb-3" value={course} onChange={(e) => setCourse(e.target.value.toUpperCase())} placeholder="CAR" />
        <div className="label">Cấp độ</div>
        <div className="mb-5 grid grid-cols-3 gap-1.5" role="group" aria-label="Cấp độ">
          {(["L1", "L2", "L3"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={levels.includes(l)} onClick={() => toggle(l)} className={`seg ${levels.includes(l) ? "is-on" : ""}`}>
              <span className="font-semibold">{l}</span>
              <span className="text-[12px] opacity-75">{l === "L1" ? "Cơ bản" : l === "L2" ? "Trung cấp" : "Chuyên sâu"}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary w-full justify-center" disabled={a.busy || !name || !course || !levels.length} onClick={() => a.run(async () => { const p = await api<P>("/projects", { method: "POST", json: { name, course, levels } }); router.push(`/p/${p.id}/nguon`); })}>
          Tạo dự án
        </button>
        <Msg msg={a.msg} />
        {health.data && (
          <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-[12px]">
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-soft">Lưu trữ</dt><dd className="min-w-0 truncate text-right" title={health.data.storage}>{health.data.storage}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-soft">Claude</dt><dd className="text-right">{health.data.ai ? "đã kết nối" : <Link className="text-brand underline" href="/claude">chưa đăng nhập</Link>}</dd></div>
          </dl>
        )}
      </aside>
    </div>
  );
}
