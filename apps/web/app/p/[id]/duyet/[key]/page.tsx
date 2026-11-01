"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead, VideoPicker } from "@/components/ui";

type QaItem = { kind: string; severity: string; scene?: string; message: string };
type Row = { data: any; qa: { ok: boolean; items: QaItem[]; assumptions: Record<string, string[]>; sheet?: string; frames?: { file: string; label?: string; scene?: string }[]; rendered?: string; renderer?: string; renderedAt?: string } | null; approved: boolean; summary: VideoSum; timing: any };

export default function Duyet() {
  const { project } = useProject();
  const pid = project!.id;
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const list = useApi<VideoSum[]>(`/projects/${pid}/videos`);
  const { data, reload } = useApi<Row>(`/projects/${pid}/videos/${encodeURIComponent(key)}`, 4000);
  const [override, setOverride] = useState(false);
  const [scene, setScene] = useState("s1");
  const [note, setNote] = useState("");
  const a = useAction();
  if (!data) return <div>Đang tải…</div>;
  const qa = data.qa;
  const v = data.data;
  const job = data.summary.job;
  const approve = () => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PATCH", json: { approve: true, override } }); reload(); }, "Đã duyệt – video sẽ được xuất ở bước 9");
  const revise = () => a.run(async () => { await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "revise", keys: [key], payload: { scene, note } } }); setNote(""); reload(); }, `AI đang sửa ${scene} theo ghi chú – sau đó bấm "Chỉ dựng lại hình" ở bước 7 để render lại`);
  const custom = (sid: string) => a.run(() => api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "ai-script", keys: [key], payload: { custom: true, scene: sid } } }), `AI đang viết mã cảnh tùy biến ${sid} (lint + chạy thử tự động)`);
  const errors = qa?.items.filter((i) => i.severity === "error") ?? [];
  const warns = qa?.items.filter((i) => i.severity !== "error") ?? [];
  return (
    <div>
      <PageHead step={8} title={`Duyệt · ${v.title}`}>
        {data.approved ? <Badge tone="green">Đã duyệt</Badge> : (
          <>
            {qa && !qa.ok && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Bỏ qua lỗi QA</label>}
            <button className="btn btn-primary" disabled={!data.summary.rendered || a.busy} onClick={approve}>✓ Duyệt</button>
          </>
        )}
      </PageHead>
      {list.data && <VideoPicker pid={pid} videos={list.data} current={key} base="duyet" />}
      <Msg msg={a.msg} />
      {job && <div className="mb-3 rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">Đang chạy: {job.kind} · {job.message} ({Math.round(job.progress)}%)</div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <div className="card mb-4">
            {data.summary.rendered && qa?.rendered ? (
              <video key={qa.renderedAt} className="w-full rounded bg-black" controls preload="metadata" src={`${fileUrl(qa.rendered)}&t=${qa.renderedAt}`}>
                <track kind="subtitles" srcLang="vi" label="Tiếng Việt" src={`/api/projects/${pid}/videos/${encodeURIComponent(key)}/vtt`} default />
              </video>
            ) : <div className="flex aspect-video items-center justify-center rounded bg-[#e9eeec] text-soft">Chưa render – chạy ở bước 7</div>}
            {qa?.renderer && <div className="mt-1 text-xs text-soft">Bộ dựng: {qa.renderer} · {qa.renderedAt && new Date(qa.renderedAt).toLocaleString("vi-VN")} · <a className="underline" href={fileUrl(qa.rendered!, true)}>Tải MP4</a></div>}
          </div>
          {qa?.sheet && (
            <div className="card mb-4">
              <h2 className="mb-2 font-semibold">Ảnh ghép khung cuối các cảnh</h2>
              <img src={`${fileUrl(qa.sheet)}&t=${Date.parse((qa as any).checkedAt ?? "") || 0}`} alt="Ảnh ghép" className="w-full rounded" />
            </div>
          )}
          {qa?.frames && (
            <details className="card">
              <summary className="cursor-pointer font-semibold">Tất cả khung QA ({qa.frames.length})</summary>
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                {qa.frames.map((f, i) => <figure key={i}><img src={fileUrl(f.file)} alt={f.label} className="rounded-lg border border-line" /><figcaption className="text-xs text-soft">{f.label}</figcaption></figure>)}
              </div>
            </details>
          )}
        </div>
        <div>
          <div className="card mb-4">
            <h2 className="mb-2 font-semibold">Báo cáo QA {qa ? (qa.ok ? <Badge tone="green">đạt</Badge> : <Badge tone="red">{errors.length} lỗi</Badge>) : <Badge>chưa chạy</Badge>}</h2>
            {errors.map((i, k) => <div key={k} className="mb-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-danger">[{i.kind}{i.scene ? ` · ${i.scene}` : ""}] {i.message}</div>)}
            {warns.map((i, k) => <div key={k} className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">[{i.kind}{i.scene ? ` · ${i.scene}` : ""}] {i.message}</div>)}
            {qa && qa.items.length === 0 && <div className="text-sm text-brand-dark">Không phát hiện lỗi: bố cục, chữ ≥ 28 px, số liệu khớp nguồn, âm thanh AAC, không im lặng &gt; 2,5 s, thời lượng khớp.</div>}
          </div>
          <div className="card mb-4">
            <h2 className="mb-2 font-semibold">AI / template tự quyết – cần duyệt</h2>
            {v.scenes.map((s: any) => {
              const list = [...new Set([...(s.assumptions ?? []), ...(qa?.assumptions?.[s.id] ?? [])])];
              return (
                <div key={s.id} className="mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium"><span className="num rounded-md bg-ink px-1.5 py-0.5 text-[12px] text-white">{s.id}</span> {s.title} <span className="text-xs text-soft">· {s.design?.template ?? "tự động"}</span>
                    <button className="ml-auto text-xs text-brand underline" onClick={() => custom(s.id)}>AI viết cảnh tùy biến</button></div>
                  {list.length ? list.map((x, k) => <div key={k} className="assume mt-1">{x}</div>) : <div className="text-xs text-soft">Không có</div>}
                  {s.notes?.length > 0 && <div className="mt-1 text-xs text-soft">Ghi chú đã gửi: {s.notes.join(" · ")}</div>}
                </div>
              );
            })}
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Ghi chú sửa</h2>
            <div className="flex gap-2">
              <select className="input w-24 shrink-0 self-start" value={scene} onChange={(e) => setScene(e.target.value)}>{v.scenes.map((s: any) => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
              <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: hủy tín chỉ theo chỉ dẫn của chủ dự án, không phải người mua; đổi mũi tên sang hướng ngược lại" />
            </div>
            <button className="btn btn-primary mt-2" disabled={!note || a.busy} onClick={revise}>Gửi ghi chú – AI sửa đúng cảnh đó</button>
          </div>
        </div>
      </div>
    </div>
  );
}
