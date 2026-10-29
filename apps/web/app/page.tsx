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
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <PageHead title="Dự án" />
        <ErrorBox error={error ?? health.error} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((p) => (
            <Link key={p.id} href={`/p/${p.id}/nguon`} className="card hover:border-brand">
              <div className="text-xs text-soft">{p.course} · {p.levels.join(", ")}</div>
              <div className="text-lg font-semibold">{p.name}</div>
              <div className="mt-1 text-sm text-soft">{p.videos} video · tạo {new Date(p.created_at).toLocaleDateString("vi-VN")}</div>
            </Link>
          ))}
          {data && data.length === 0 && <div className="text-soft">Chưa có dự án nào – tạo dự án mới ở bên phải.</div>}
        </div>
      </section>
      <aside className="card h-fit">
        <h2 className="mb-3 text-lg font-semibold">1 · Dự án mới</h2>
        <label className="label">Tên khóa học</label>
        <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tín chỉ carbon & Tiêu chuẩn VCS" />
        <label className="label">Mã khóa (tiền tố mã video)</label>
        <input className="input mb-3" value={course} onChange={(e) => setCourse(e.target.value.toUpperCase())} placeholder="CAR" />
        <label className="label">Cấp độ</label>
        <div className="mb-4 flex gap-2">
          {["L1", "L2", "L3"].map((l) => (
            <label key={l} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={levels.includes(l)} onChange={() => toggle(l)} /> {l === "L1" ? "Cơ bản (L1)" : l === "L2" ? "Trung cấp (L2)" : "Chuyên sâu (L3)"}
            </label>
          ))}
        </div>
        <button className="btn btn-primary" disabled={a.busy || !name || !course} onClick={() => a.run(async () => { const p = await api<P>("/projects", { method: "POST", json: { name, course, levels } }); router.push(`/p/${p.id}/nguon`); })}>
          Tạo dự án
        </button>
        <Msg msg={a.msg} />
        {health.data && (
          <div className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-soft">
            <div>Lưu trữ: {health.data.storage}</div>
            <div>Claude API: {health.data.ai ? "đã cấu hình" : "chưa có ANTHROPIC_API_KEY (thiết kế cảnh dùng chế độ tự động)"}</div>
          </div>
        )}
      </aside>
    </div>
  );
}
