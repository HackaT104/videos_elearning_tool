"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject } from "@/lib/project";
import { Msg, PageHead } from "@/components/ui";

type Item = { path: string; label: string; bytes: number };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function DonDep() {
  const { project } = useProject();
  const pid = project!.id;
  const { data, reload } = useApi<Item[]>(`/projects/${pid}/cleanup`);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const a = useAction();
  useEffect(() => setSel(new Set(data?.map((d) => d.path) ?? [])), [data]);
  const total = data?.filter((d) => sel.has(d.path)).reduce((s, d) => s + d.bytes, 0) ?? 0;
  const go = () => {
    if (!confirm(`Chuyển ${sel.size} mục (${mb(total)}) vào thư mục _luu_tru? (không xóa hẳn)`)) return;
    a.run(async () => { const r = await api<{ archivedTo: string }>(`/projects/${pid}/cleanup`, { method: "POST", json: { paths: [...sel] } }); await reload(); return r; }, "Đã chuyển vào _luu_tru");
  };
  return (
    <div>
      <PageHead step={10} title="Dọn dẹp">
        <button className="btn btn-danger" disabled={!sel.size || a.busy} onClick={go}>Chuyển {sel.size} mục vào _luu_tru ({mb(total)})</button>
      </PageHead>
      <Msg msg={a.msg} />
      <div className="card">
        <p className="mb-2 text-sm text-soft">Giọng cũ, file tạm, bộ nhớ đệm xem trước, bản render thử. Có xác nhận trước; mọi thứ được chuyển vào <code>_luu_tru/&lt;thời điểm&gt;</code> thay vì xóa hẳn.</p>
        <table className="tbl">
          <tbody>
            {data?.map((d) => (
              <tr key={d.path}>
                <td className="w-8"><input type="checkbox" checked={sel.has(d.path)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(d.path) : n.delete(d.path); return n; })} /></td>
                <td>{d.label}<div className="font-mono text-xs text-soft">{d.path}</div></td>
                <td className="text-right text-sm">{mb(d.bytes)}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td className="text-soft">Không có gì cần dọn.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
