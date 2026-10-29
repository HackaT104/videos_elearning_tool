"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead } from "@/components/ui";

export default function Xuat() {
  const { project } = useProject();
  const pid = project!.id;
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`);
  const [res, setRes] = useState<{ dir: string; files: string[]; skipped: { key: string; reason: string }[]; catalog: string } | null>(null);
  const a = useAction();
  const ready = vids.data?.filter((v) => v.include && !v.existing && v.approved) ?? [];
  return (
    <div>
      <PageHead step={9} title="Xuất">
        <button className="btn" onClick={() => a.run(() => api("/open-folder", { method: "POST", json: { path: project!.out } }))}>📂 Mở thư mục</button>
        <button className="btn btn-primary" disabled={a.busy} onClick={() => a.run(async () => setRes(await api(`/projects/${pid}/export`, { method: "POST" })), "Đã xuất")}>Xuất {ready.length} video đã duyệt</button>
      </PageHead>
      <Msg msg={a.msg} />
      <div className="card mb-4 text-sm">
        <div>Thư mục: <code>{project!.out}</code></div>
        <div className="mt-1 text-soft">Cấu trúc: <code>out/Cap_do_1/…</code>, <code>out/Cap_do_2/…</code>; tên file theo mã video. Kèm <code>DANH_MUC_VIDEO.txt</code> (UTF-8 BOM, CRLF): mã, thời lượng, tiêu đề, giọng, phong cách.</div>
        <div className="mt-1 text-soft">Chỉ video đã duyệt ở bước 8 mới được xuất (QA chặn xuất nếu không đạt).</div>
      </div>
      {res && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Đã xuất {res.files.length} video</h2>
          <ul className="mb-2 text-xs">{res.files.map((f) => <li key={f} className="font-mono">{f}</li>)}</ul>
          {res.skipped.map((s) => <div key={s.key} className="text-xs"><Badge tone="amber">bỏ qua</Badge> {s.key}: {s.reason}</div>)}
          <div className="mt-2 text-xs">Danh mục: <code>{res.catalog}</code></div>
        </div>
      )}
    </div>
  );
}
