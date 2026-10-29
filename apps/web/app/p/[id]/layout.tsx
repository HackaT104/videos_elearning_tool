"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { ProjectCtx, type Project } from "@/lib/project";
import { ErrorBox } from "@/components/ui";

const STEPS = [
  ["nguon", "1 · Tải tài liệu"],
  ["phan-tich", "2 · Phân tích"],
  ["kich-ban", "3 · Kịch bản"],
  ["doc", "4 · Soát cách đọc"],
  ["giong", "5 · Giọng & nhịp"],
  ["phong-cach", "6 · Phong cách & bộ dựng"],
  ["san-xuat", "7 · Sản xuất"],
  ["duyet", "8 · Xem & duyệt"],
  ["xuat", "9 · Xuất"],
  ["don-dep", "10 · Dọn dẹp"],
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const { data, error, reload } = useApi<Project>(`/projects/${id}`);
  return (
    <ProjectCtx.Provider value={{ project: data, reload }}>
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit lg:sticky lg:top-4">
          <div className="mb-3">
            <div className="text-xs text-soft">{data?.course} · {data?.levels.join(", ")}</div>
            <div className="font-semibold leading-tight">{data?.name ?? "…"}</div>
          </div>
          <nav className="flex flex-col gap-0.5">
            {STEPS.map(([slug, label]) => (
              <Link key={slug} href={`/p/${id}/${slug}`} className={`rounded px-2 py-1.5 text-sm ${path?.includes(`/${slug}`) ? "bg-brand text-white" : "hover:bg-white"}`}>
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <ErrorBox error={error} />
          {data && children}
        </section>
      </div>
    </ProjectCtx.Provider>
  );
}
