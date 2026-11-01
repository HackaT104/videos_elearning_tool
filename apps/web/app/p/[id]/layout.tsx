"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { ProjectCtx, type Project } from "@/lib/project";
import { ErrorBox } from "@/components/ui";

export type Progress = { uploaded: boolean; videos: number; reading: number; styleConfirmed: boolean; style: string; citOk: boolean; rendered: number; approved: number };
type State = "done" | "warn" | "todo";

// Thứ tự hợp lý: chuẩn hoá cách đọc và chọn phong cách xong mới tạo giọng, rồi mới sản xuất.
const STEPS: { slug: string; label: string; state: (p: Progress) => State; hint?: (p: Progress) => string }[] = [
  { slug: "nguon", label: "Tải tài liệu", state: (p) => (p.uploaded ? "done" : "todo") },
  { slug: "phan-tich", label: "Phân tích", state: (p) => (p.videos ? "done" : "todo"), hint: (p) => `${p.videos} video` },
  { slug: "doc", label: "Chuẩn hoá cách đọc", state: (p) => (!p.videos ? "todo" : p.reading ? "warn" : "done"), hint: (p) => (p.reading ? `${p.reading} câu cần soát` : "đã chuẩn") },
  { slug: "kich-ban", label: "Kịch bản", state: (p) => (p.videos ? "done" : "todo") },
  { slug: "phong-cach", label: "Chọn phong cách", state: (p) => (p.styleConfirmed ? "done" : p.videos ? "warn" : "todo"), hint: (p) => (p.styleConfirmed ? "đã chọn" : "chưa chọn") },
  { slug: "giong", label: "Giọng đọc CIT", state: (p) => (p.citOk ? "done" : "warn"), hint: (p) => (p.citOk ? "CIT sẵn sàng" : "CIT chưa chạy") },
  { slug: "san-xuat", label: "Sản xuất", state: (p) => (p.videos && p.rendered >= p.videos ? "done" : "todo"), hint: (p) => `${p.rendered}/${p.videos} đã render` },
  { slug: "duyet", label: "Xem và duyệt", state: (p) => (p.videos && p.approved >= p.videos ? "done" : "todo"), hint: (p) => `${p.approved}/${p.videos} đã duyệt` },
  { slug: "xuat", label: "Xuất", state: () => "todo" },
  { slug: "don-dep", label: "Dọn dẹp", state: () => "todo" },
];

/** Nút trên đường ray: rỗng = chưa làm, xanh có ✓ = xong, hổ phách = cần xem. */
function Node({ st, n }: { st: State; n: number }) {
  if (st === "done")
    return (
      <span className="rail-node bg-brand text-white" aria-label="xong">
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  if (st === "warn") return <span className="rail-node bg-warn text-ink" aria-label="cần xem">!</span>;
  return <span className="rail-node num bg-ink-2 text-white/55 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]">{n}</span>;
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const { data, error, reload } = useApi<Project>(`/projects/${id}`);
  const prog = useApi<Progress>(`/projects/${id}/progress`, 5000);
  const curIdx = STEPS.findIndex((s) => path?.includes(`/${s.slug}`));
  const next = curIdx >= 0 ? STEPS[curIdx + 1] : undefined;
  const done = prog.data ? STEPS.filter((s) => s.state(prog.data!) === "done").length : 0;
  return (
    <ProjectCtx.Provider value={{ project: data, reload: () => { reload(); prog.reload(); } }}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-7">
        <aside className="-mx-4 -mt-5 min-w-0 bg-ink text-white sm:-mt-6 lg:sticky lg:top-4 lg:mx-0 lg:mt-0 lg:h-fit lg:rounded-xl lg:shadow-[0_1px_2px_rgb(19_34_43/0.2),0_12px_32px_-12px_rgb(19_34_43/0.45)]">
          <div className="flex items-end justify-between gap-3 px-4 pt-3 lg:block lg:px-5 lg:pt-5">
            <div className="min-w-0">
              <div className="num truncate text-[12px] text-white/55">{data ? `${data.course} · ${data.levels.join(", ")}` : " "}</div>
              <div className="truncate text-[15px] font-semibold leading-snug lg:whitespace-normal">{data?.name ?? "…"}</div>
            </div>
            <div className="num shrink-0 text-[12px] text-white/55 lg:mt-3">{done}/10 bước xong</div>
          </div>
          <nav aria-label="Các bước của dự án" className="rail mt-2 flex overflow-x-auto px-2 pb-2 lg:mt-4 lg:block lg:overflow-visible lg:px-3 lg:pb-4">
            {STEPS.map((s, i) => {
              const st: State = prog.data ? s.state(prog.data) : "todo";
              const active = i === curIdx;
              return (
                <Link
                  key={s.slug}
                  href={`/p/${id}/${s.slug}`}
                  aria-current={active ? "step" : undefined}
                  className={`rail-step ${active ? "is-active" : ""}`}
                >
                  <Node st={st} n={i + 1} />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-[13px] font-medium lg:whitespace-normal">{s.label}</span>
                    {prog.data && s.hint && <span className={`num hidden text-[12px] lg:block ${st === "warn" ? "text-[#f0b65a]" : "text-white/50"}`}>{s.hint(prog.data)}</span>}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">
          <ErrorBox error={error} />
          {data && children}
          {next && (
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="hidden text-[13px] text-soft sm:inline">Xong bước này?</span>
              <Link href={`/p/${id}/${next.slug}`} className="btn btn-primary w-full justify-center sm:w-auto">
                Sang bước {curIdx + 2}: {next.label}
              </Link>
            </div>
          )}
        </section>
      </div>
    </ProjectCtx.Provider>
  );
}
