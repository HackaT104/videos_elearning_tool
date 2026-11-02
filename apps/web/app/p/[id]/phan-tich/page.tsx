"use client";
import Link from "next/link";
import { useState } from "react";
import { api, fmtSec } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead, STATUS_LABEL } from "@/components/ui";
import { DocAnalysis } from "@/components/doc-plan";

export default function PhanTich() {
  const { project } = useProject();
  const pid = project!.id;
  const { data, reload } = useApi<VideoSum[]>(`/projects/${pid}/videos`, 4000);
  const meta = useApi<{ ai: boolean }>("/meta");
  const a = useAction();
  const flag = (key: string, f: Record<string, boolean>) => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PATCH", json: f }); reload(); });
  const pending = project!.files.filter((f) => f.kind === "outline" || f.kind === "topic");
  const todo = data?.filter((v) => v.include && !v.existing) ?? [];
  const docs = project!.files.filter((f) => /\.docx$/i.test(f.summary?.stored ?? "")).slice(-3).reverse();
  return (
    <div>
      <PageHead step={2} title="Phân tích – danh sách video">
        <Link href={`/p/${pid}/san-xuat`} className="btn btn-primary">Sang sản xuất</Link>
      </PageHead>
      {project!.warnings.length > 0 && (
        <div className="assume mb-3 text-sm">⚠ Trùng tên file giữa các cấp độ (mã video đã có tiền tố cấp độ nên không ghi đè): {project!.warnings.join("; ")}</div>
      )}
      {docs.map((f) => <DocAnalysis key={f.id} pid={pid} fileId={f.id} ai={!!meta.data?.ai} />)}
      <div className="card mb-4 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Làm</th><th>Đã có sẵn</th><th>Mã video</th><th>Tiêu đề</th><th>Cấp</th><th>Cảnh</th><th>Kịch bản</th><th>Ước tính / thật</th><th>Trạng thái</th><th></th></tr>
          </thead>
          <tbody>
            {data?.map((v) => (
              <tr key={v.key} className={v.existing ? "opacity-50" : ""}>
                <td><input type="checkbox" checked={v.include} onChange={(e) => flag(v.key, { include: e.target.checked })} /></td>
                <td><input type="checkbox" checked={v.existing} onChange={(e) => flag(v.key, { existing: e.target.checked })} /></td>
                <td className="num text-[13px] font-medium">{v.key}</td>
                <td>{v.title} {v.aiWritten && <Badge tone="amber">AI viết</Badge>}</td>
                <td>{v.level}</td>
                <td>{v.scenes}</td>
                <td>{fmtSec(v.scriptSeconds)}</td>
                <td>{fmtSec(v.seconds)} {v.estimated ? <span className="text-xs text-soft">(ước tính)</span> : <Badge tone="blue">giọng thật</Badge>}</td>
                <td><Badge tone={STATUS_LABEL[v.status]?.[1]}>{STATUS_LABEL[v.status]?.[0] ?? v.status}</Badge></td>
                <td><Link className="text-brand underline" href={`/p/${pid}/kich-ban/${encodeURIComponent(v.key)}`}>Kịch bản</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <div className="mt-2 text-sm text-soft">Cần làm: <b>{todo.length}</b> video · Đã có sẵn: {data.filter((v) => v.existing).length} · Bỏ qua: {data.filter((v) => !v.include).length}</div>}
        {data && todo.length > 0 && <div className="mt-1 text-xs text-soft">Còn thiếu so với tài liệu: {todo.filter((v) => !v.rendered).map((v) => v.key).join(", ") || "không"}</div>}
        <Msg msg={a.msg} />
      </div>
      {pending.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Dàn ý / chủ đề – cần viết kịch bản</h2>
          {!meta.data?.ai && <div className="assume mb-2">Chưa cấu hình ANTHROPIC_API_KEY trong .env – không thể viết kịch bản bằng AI.</div>}
          {pending.map((f) => <AiWrite key={f.id} pid={pid} file={f} disabled={!meta.data?.ai} />)}
        </div>
      )}
    </div>
  );
}

function AiWrite({ pid, file, disabled }: { pid: string; file: any; disabled: boolean }) {
  const [sec, setSec] = useState(120);
  const [aud, setAud] = useState("nhân viên doanh nghiệp");
  const [name, setName] = useState(`MO1_U1.1_${file.id.slice(0, 1).charCodeAt(0) % 9 + 1}`);
  const a = useAction();
  const s = file.summary;
  return (
    <div className="mb-3 rounded-lg border border-line p-3">
      <div className="text-sm"><b>{file.name}</b> · {file.level} · <Badge tone="amber">{file.kind === "outline" ? "Dàn ý" : "Chủ đề"}</Badge></div>
      {s.outline ? (
        <div className="mt-1 text-xs text-soft">{s.outline.title}: {s.outline.items.map((i: any) => i.heading).join(" · ")}</div>
      ) : (
        <div className="mt-1 line-clamp-3 text-xs text-soft">{s.topic}</div>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">Tên file video<input className="input mt-0.5 w-40" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="text-xs">Thời lượng (giây)<input type="number" className="input mt-0.5 w-24" value={sec} onChange={(e) => setSec(Number(e.target.value))} /></label>
        <label className="text-xs">Đối tượng<input className="input mt-0.5 w-56" value={aud} onChange={(e) => setAud(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={disabled || a.busy} onClick={() => a.run(() => api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "ai-script", payload: { kind: file.kind, outline: s.outline, topic: s.topic, level: file.level, targetSeconds: sec, audience: aud, fileName: name } } }), "Đã xếp hàng: AI đang viết kịch bản (xem ở bước 7). Phần AI viết sẽ được đánh dấu vàng để duyệt.")}>
          Viết kịch bản bằng AI
        </button>
      </div>
      <div className="mt-1 text-xs text-soft">{file.kind === "topic" ? "AI lập dàn ý → viết kịch bản; bạn duyệt ở bước 3 trước khi làm giọng." : "AI viết lời thoại theo dàn ý; bạn duyệt ở bước 3 trước khi làm giọng."}</div>
      <Msg msg={a.msg} />
    </div>
  );
}
