"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject } from "@/lib/project";
import { Msg, PageHead } from "@/components/ui";

type Item = { path: string; label: string; bytes: number };
type Archive = { dir: string; project: string; items: Item[] };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const sum = (xs: Item[] | null | undefined, sel: Set<string>) => xs?.filter((d) => sel.has(d.path)).reduce((s, d) => s + d.bytes, 0) ?? 0;

/** Danh sách có ô chọn + nút mở thư mục từng mục. */
function List({ items, sel, setSel, open, empty }: { items?: Item[] | null; sel: Set<string>; setSel: (f: (s: Set<string>) => Set<string>) => void; open: (p: string) => void; empty: string }) {
  return (
    <table className="tbl">
      <tbody>
        {items?.map((d) => (
          <tr key={d.path}>
            <td className="w-8"><input type="checkbox" aria-label={d.label} checked={sel.has(d.path)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(d.path) : n.delete(d.path); return n; })} /></td>
            <td className="min-w-0">{d.label}<div className="break-all font-mono text-xs text-soft">{d.path}</div></td>
            <td className="whitespace-nowrap text-right text-sm num">{mb(d.bytes)}</td>
            <td className="w-24 text-right"><button className="btn" onClick={() => open(d.path)}>Mở</button></td>
          </tr>
        ))}
        {items?.length === 0 && <tr><td className="text-soft">{empty}</td></tr>}
      </tbody>
    </table>
  );
}

export default function DonDep() {
  const { project } = useProject();
  const pid = project!.id;
  const { data, reload } = useApi<Item[]>(`/projects/${pid}/cleanup`);
  const arc = useApi<Archive>(`/projects/${pid}/cleanup/archive`);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [asel, setAsel] = useState<Set<string>>(new Set());
  const a = useAction();
  useEffect(() => setSel(new Set(data?.map((d) => d.path) ?? [])), [data]);
  useEffect(() => setAsel(new Set()), [arc.data]);
  const total = sum(data, sel);
  const atotal = sum(arc.data?.items, asel);
  const refresh = async () => { await reload(); await arc.reload(); };
  const open = (path: string) => a.run(() => api("/open-folder", { method: "POST", json: { path } }));
  const archive = () => {
    if (!confirm(`Chuyển ${sel.size} mục (${mb(total)}) vào thư mục _luu_tru? (chưa xoá hẳn, vẫn khôi phục được)`)) return;
    a.run(async () => { await api(`/projects/${pid}/cleanup`, { method: "POST", json: { paths: [...sel] } }); await refresh(); }, "Đã chuyển vào _luu_tru");
  };
  const remove = (paths: string[], bytes: number) => {
    if (!confirm(`XOÁ HẲN ${paths.length} mục (${mb(bytes)})?\nKhông khôi phục được. Video đã render và kịch bản không bị ảnh hưởng.`)) return;
    a.run(async () => { const r = await api<{ deleted: number }>(`/projects/${pid}/cleanup/delete`, { method: "POST", json: { paths } }); await refresh(); return r; }, `Đã xoá hẳn ${paths.length} mục`);
  };
  return (
    <div>
      <PageHead step={10} title="Dọn dẹp">
        {arc.data && <button className="btn" onClick={() => open(arc.data!.project)}>Mở thư mục dự án</button>}
      </PageHead>
      <Msg msg={a.msg} />
      <div className="card mb-4">
        <p className="mb-2 text-sm text-soft">Giọng cũ, file tạm, bộ nhớ đệm xem trước, bản render thử. Bấm <b>Mở</b> để xem trong thư mục trước khi dọn. Chuyển vào <code>_luu_tru</code> để còn khôi phục được, hoặc xoá hẳn để giải phóng ổ đĩa.</p>
        <List items={data} sel={sel} setSel={setSel} open={open} empty="Không có gì cần dọn." />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!sel.size || a.busy} onClick={archive}>Chuyển {sel.size} mục vào _luu_tru ({mb(total)})</button>
          <button className="btn btn-danger" disabled={!sel.size || a.busy} onClick={() => remove([...sel], total)}>Xoá hẳn {sel.size} mục đã chọn</button>
        </div>
      </div>
      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Đã lưu trữ (_luu_tru)</h2>
          {arc.data && <button className="btn" onClick={() => open(arc.data!.dir)}>Mở thư mục _luu_tru</button>}
        </div>
        <List items={arc.data?.items} sel={asel} setSel={setAsel} open={open} empty="Chưa có gì trong _luu_tru." />
        {!!arc.data?.items.length && (
          <div className="mt-3">
            <button className="btn btn-danger" disabled={!asel.size || a.busy} onClick={() => remove([...asel], atotal)}>Xoá hẳn {asel.size} mục đã chọn ({mb(atotal)})</button>
          </div>
        )}
      </div>
    </div>
  );
}
