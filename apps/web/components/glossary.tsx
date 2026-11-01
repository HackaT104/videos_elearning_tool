"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Msg } from "./ui";

type G = { id: number; term: string; reading: string; caseSensitive: boolean; note?: string };

export function GlossaryEditor({ project, onChange }: { project: string | null; onChange?: () => void }) {
  const { data, reload } = useApi<{ shared: G[]; project: G[]; defaults: G[] }>(`/glossary${project ? `?project=${project}` : ""}`);
  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [cs, setCs] = useState(true);
  const [scope, setScope] = useState<"project" | "shared">(project ? "project" : "shared");
  const a = useAction();
  const add = () => a.run(async () => { await api("/glossary", { method: "POST", json: { term, reading, caseSensitive: cs, project: scope === "project" ? project : null } }); setTerm(""); setReading(""); await reload(); onChange?.(); }, "Đã thêm");
  const del = (id: number) => a.run(async () => { await api(`/glossary/${id}`, { method: "DELETE" }); await reload(); onChange?.(); });
  const Table = ({ rows, title, editable }: { rows: G[]; title: string; editable: boolean }) => (
    <div className="mb-3">
      <div className="mb-1 text-[13px] font-medium text-soft">{title} <span className="num">({rows.length})</span></div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
        <table className="tbl"><tbody>
          {rows.map((g, i) => (
            <tr key={g.id ?? i}><td className="font-medium">{g.term}</td><td><span className="text-soft">đọc là</span> {g.reading}</td><td className="text-xs text-soft">{g.caseSensitive ? "phân biệt hoa/thường" : ""}</td>
              <td>{editable && <button className="min-h-8 px-1 text-[12px] text-danger" onClick={() => del(g.id)}>Xoá</button>}</td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">Cụm từ<input className="input mt-0.5 w-40" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="VM0047" /></label>
        <label className="text-xs">Cách đọc<input className="input mt-0.5 w-64" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="vê em không không bốn bảy" /></label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Phân biệt hoa/thường</label>
        {project && (
          <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value as any)}>
            <option value="project">Cho dự án này</option><option value="shared">Dùng chung mọi dự án</option>
          </select>
        )}
        <button className="btn btn-primary" disabled={!term || !reading || a.busy} onClick={add}>Thêm</button>
      </div>
      <Msg msg={a.msg} />
      {data && (<>
        {project && <Table rows={data.project} title="Thuật ngữ của dự án" editable />}
        <Table rows={data.shared} title="Thuật ngữ dùng chung" editable />
        <details><summary className="cursor-pointer text-xs text-soft">Bảng mặc định (mục 4) – {data.defaults.length} mục</summary><Table rows={data.defaults} title="Mặc định" editable={false} /></details>
      </>)}
    </div>
  );
}
