"use client";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, PageHead } from "@/components/ui";
import { fmtSec } from "@/lib/api";

export default function DuyetIndex() {
  const { project } = useProject();
  const { data } = useApi<VideoSum[]>(`/projects/${project!.id}/videos`, 5000);
  return (
    <div>
      <PageHead step={8} title="Xem & duyệt" />
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Video</th><th>Thời lượng</th><th>QA</th><th>AI tự quyết</th><th>Duyệt</th><th></th></tr></thead>
          <tbody>
            {data?.filter((v) => v.include && !v.existing).map((v) => (
              <tr key={v.key}>
                <td><span className="num text-[13px] font-medium">{v.key}</span> <span className="text-soft">{v.title}</span></td>
                <td>{fmtSec(v.seconds)}</td>
                <td>{v.qaOk === null ? <Badge>chưa QA</Badge> : v.qaOk ? <Badge tone="green">đạt</Badge> : <Badge tone="red">có lỗi</Badge>}</td>
                <td>{v.assumptions ? <Badge tone="amber">{v.assumptions} mục</Badge> : "—"}</td>
                <td>{v.approved ? <Badge tone="green">đã duyệt</Badge> : v.rendered ? <Badge tone="amber">chờ duyệt</Badge> : <Badge>chưa render</Badge>}</td>
                <td><Link className="text-brand underline" href={`/p/${project!.id}/duyet/${encodeURIComponent(v.key)}`}>Mở</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
