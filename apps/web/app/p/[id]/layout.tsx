"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { ProjectCtx, type Project } from "@/lib/project";
import { ErrorBox } from "@/components/ui";

export type Progress = { uploaded: boolean; videos: number; reading: number; styleConfirmed: boolean; style: string; citOk: boolean; rendered: number; approved: number };

// Thứ tự hợp lý: chuẩn hoá cách đọc và chọn phong cách xong mới tạo giọng, rồi mới sản xuất.
const STEPS: { slug: string; label: string; state: (p: Progress) => "done" | "warn" | "todo"; hint?: (p: Progress) => string }[] = [
  { slug: "nguon", label: "1 · Tải tài liệu", state: (p) => (p.uploaded ? "done" : "todo") },
  { slug: "phan-tich", label: "2 · Phân tích", state: (p) => (p.videos ? "done" : "todo"), hint: (p) => `${p.videos} video` },
  { slug: "doc", label: "3 · Chuẩn hoá cách đọc", state: (p) => (!p.videos ? "todo" : p.reading ? "warn" : "done"), hint: (p) => (p.reading ? `${p.reading} câu cần soát` : "đã chuẩn") },
  { slug: "kich-ban", label: "4 · Kịch bản", state: (p) => (p.videos ? "done" : "todo") },
  { slug: "phong-cach", label: "5 · Chọn phong cách", state: (p) => (p.styleConfirmed ? "done" : p.videos ? "warn" : "todo"), hint: (p) => (p.styleConfirmed ? "đã chọn" : "chưa chọn") },
  { slug: "giong", label: "6 · Giọng đọc CIT", state: (p) => (p.citOk ? "done" : "warn"), hint: (p) => (p.citOk ? "CIT sẵn sàng" : "chưa mở CIT") },
  { slug: "san-xuat", label: "7 · Sản xuất", state: (p) => (p.videos && p.rendered >= p.videos ? "done" : "todo"), hint: (p) => `${p.rendered}/${p.videos} đã render` },
  { slug: "duyet", label: "8 · Xem & duyệt", state: (p) => (p.videos && p.approved >= p.videos ? "done" : "todo"), hint: (p) => `${p.approved}/${p.videos} đã duyệt` },
  { slug: "xuat", label: "9 · Xuất", state: () => "todo" },
  { slug: "don-dep", label: "10 · Dọn dẹp", state: () => "todo" },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const { data, error, reload } = useApi<Project>(`/projects/${id}`);
  const prog = useApi<Progress>(`/projects/${id}/progress`, 5000);
  const curIdx = STEPS.findIndex((s) => path?.includes(`/${s.slug}`));
  const next = curIdx >= 0 ? STEPS[curIdx + 1] : undefined;
  return (
    <ProjectCtx.Provider value={{ project: data, reload: () => { reload(); prog.reload(); } }}>
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit min-w-0 lg:sticky lg:top-4">
          <div className="mb-2 lg:mb-3">
            <div className="text-xs text-soft">{data?.course} · {data?.levels.join(", ")}</div>
            <div className="font-semibold leading-tight">{data?.name ?? "…"}</div>
          </div>
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
            {STEPS.map((s, i) => {
              const st = prog.data ? s.state(prog.data) : "todo";
              const active = i === curIdx;
              return (
                <Link key={s.slug} href={`/p/${id}/${s.slug}`} className={`flex shrink-0 items-center gap-2 rounded px-2 py-1.5 text-sm lg:shrink ${active ? "bg-brand text-white" : "bg-white lg:bg-transparent lg:hover:bg-white"}`}>
                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${st === "done" ? "bg-emerald-500 text-white" : st === "warn" ? "bg-amber-400 text-amber-950" : "border border-slate-300"}`}>{st === "done" ? "✓" : st === "warn" ? "!" : ""}</span>
                  <span className="min-w-0 flex-1 whitespace-nowrap lg:whitespace-normal">{s.label}{prog.data && s.hint && <span className={`hidden text-[11px] lg:block ${active ? "text-white/80" : "text-soft"}`}>{s.hint(prog.data)}</span>}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">
          <ErrorBox error={error} />
          {data && children}
          {next && (
            <div className="mt-6 flex justify-stretch sm:justify-end [&>a]:w-full [&>a]:justify-center sm:[&>a]:w-auto">
              <Link href={`/p/${id}/${next.slug}`} className="btn btn-primary">Bước tiếp theo: {next.label} →</Link>
            </div>
          )}
        </section>
      </div>
    </ProjectCtx.Provider>
  );
}
