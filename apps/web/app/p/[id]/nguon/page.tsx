"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject } from "@/lib/project";
import { Badge, Msg, PageHead } from "@/components/ui";
import { DocAnalysis } from "@/components/doc-plan";
import { StyleRefsCard } from "@/components/style-gen";

const FIELDS: [string, string][] = [["code", "Mã video"], ["title", "Tiêu đề"], ["scene", "Cảnh"], ["start", "Bắt đầu"], ["end", "Kết thúc"], ["visual", "Mô tả hình"], ["onscreen", "Chữ trên màn hình"], ["vo", "Lời thoại"], ["notes", "Ghi chú"]];
type Sheet = { sheet: string; headers: string[]; auto: Record<string, number>; missing: string[] };

export default function Nguon() {
  const { project, reload } = useProject();
  const [level, setLevel] = useState(project!.levels[0] ?? "L1");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [sheets, setSheets] = useState<Record<string, Sheet[]>>({});
  const [maps, setMaps] = useState<Record<string, Record<string, number>>>({});
  const [results, setResults] = useState<any[]>([]);
  const a = useAction();
  const meta = useApi<{ ai: boolean }>("/meta");

  const addFiles = async (list: FileList | File[]) => {
    const fs = [...list].filter((f) => /\.(docx|xlsx)$/i.test(f.name));
    setFiles((x) => [...x, ...fs]);
    for (const f of fs.filter((f) => /\.xlsx$/i.test(f.name))) {
      const fd = new FormData();
      fd.append("file", f);
      const h = await api<Sheet[]>("/xlsx-headers", { method: "POST", body: fd });
      setSheets((s) => ({ ...s, [f.name]: h }));
      setMaps((m) => ({ ...m, ...Object.fromEntries(h.map((s) => [s.sheet, s.auto])) }));
    }
  };
  const upload = () =>
    a.run(async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("level", level);
      fd.append("columnMaps", JSON.stringify(maps));
      const r = await api<any[]>(`/projects/${project!.id}/upload`, { method: "POST", body: fd });
      setResults(r);
      setFiles([]);
      setSheets({});
      reload();
    }, "Đã tải lên và bóc tài liệu");

  return (
    <div>
      <PageHead step={1} title="Tải tài liệu (Word/Excel)" />
      <div className="card mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">Cấp độ của các file này:</label>
          <select className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value)}>
            {project!.levels.map((l) => <option key={l}>{l}</option>)}
          </select>
          <span className="text-xs text-soft">Mã video luôn có tiền tố cấp độ để tránh trùng tên giữa các cấp.</span>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center ${drag ? "border-brand bg-brand-tint" : "border-line"}`}
        >
          <input type="file" multiple accept=".docx,.xlsx" className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <div className="text-base font-medium">Kéo-thả file .docx / .xlsx vào đây, hoặc bấm để chọn</div>
          <div className="mt-1 text-sm text-soft">Kịch bản đầy đủ · dàn ý (outline) · chủ đề + yêu cầu – ứng dụng tự nhận diện</div>
          <div className="mt-1 text-[13px] text-soft">Tài liệu phong cách (ZIP, PDF, HTML, ảnh) tải ở ô <b className="font-medium text-ink">Tài liệu phong cách</b> bên dưới.</div>
        </label>
        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2">📄 {f.name} <span className="text-soft">({Math.round(f.size / 1024)} KB)</span>
                <button className="text-xs text-danger" onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}>bỏ</button></li>
            ))}
          </ul>
        )}
        {Object.entries(sheets).map(([fname, list]) => (
          <div key={fname} className="mt-4">
            <div className="mb-1 text-sm font-semibold">Ghép cột – {fname}</div>
            {list.map((s) => (
              <div key={s.sheet} className="mb-3 overflow-x-auto rounded-lg border border-line p-2">
                <div className="mb-1 text-xs font-medium">Sheet «{s.sheet}» {s.missing.length > 0 && <Badge tone="amber">thiếu: {s.missing.join(", ")}</Badge>}</div>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                  {FIELDS.map(([f, label]) => (
                    <label key={f} className="text-xs">{label}
                      <select className="input mt-0.5" value={maps[s.sheet]?.[f] ?? ""} onChange={(e) => setMaps((m) => ({ ...m, [s.sheet]: { ...m[s.sheet], [f]: Number(e.target.value) || (undefined as any) } }))}>
                        <option value="">—</option>
                        {s.headers.map((h, i) => h && <option key={i} value={i + 1}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" disabled={!files.length || a.busy} onClick={upload}>{a.busy ? "Đang bóc…" : `Tải lên & phân tích (${files.length})`}</button>
        </div>
        <Msg msg={a.msg} />
      </div>
      {results.length > 0 && (
        <div className="card mb-4">
          <h2 className="mb-2 font-semibold">Kết quả bóc</h2>
          {results.map((r, i) => (
            <div key={i} className="mb-2 text-sm">
              <b>{r.name}</b> → {r.error ? <span className="text-danger">{r.error}</span> : (<>
                <Badge tone={r.kind === "script" ? "green" : "amber"}>{r.kind === "script" ? "Kịch bản đầy đủ" : r.kind === "outline" ? "Dàn ý" : "Chủ đề + yêu cầu"}</Badge>{" "}
                {r.videos.length} video {r.videos.join(", ")}
                {r.kind !== "script" && <> · <Link className="text-brand underline" href={`/p/${project!.id}/phan-tich`}>Viết kịch bản bằng AI ở bước 2</Link></>}
                {r.warnings?.map((w: string, k: number) => <div key={k} className="text-xs text-amber-800">⚠ {w}</div>)}
              </>)}
            </div>
          ))}
        </div>
      )}
      {results.filter((r) => r.fileId && /\.docx$/i.test(r.name)).map((r) => <DocAnalysis key={r.fileId} pid={project!.id} fileId={r.fileId} ai={!!meta.data?.ai} />)}
      <StyleRefsCard pid={project!.id} />
      <div className="card">
        <h2 className="mb-2 font-semibold">Tài liệu đã tải</h2>
        <table className="tbl">
          <thead><tr><th>File</th><th>Cấp độ</th><th>Loại</th><th>Video</th><th>Thời điểm</th></tr></thead>
          <tbody>
            {project!.files.map((f) => (
              <tr key={f.id}><td>{f.name}</td><td>{f.level}</td><td>{({ script: "Kịch bản", outline: "Dàn ý", topic: "Chủ đề + yêu cầu" } as Record<string, string>)[f.kind] ?? f.kind}</td><td className="text-xs">{f.summary?.videos?.join(", ")}{f.summary?.plan && <> · <Link className="text-brand underline" href={`/p/${project!.id}/phan-tich`}>Claude đã phân tích</Link></>}</td><td className="text-xs text-soft">{new Date(f.created_at).toLocaleString("vi-VN")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
