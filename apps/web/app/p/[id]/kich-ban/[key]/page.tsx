"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Scene, Video } from "@cvs/core";
import { api, fmtSec } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead, VideoPicker } from "@/components/ui";
import { ScenePrompt } from "@/components/scene-prompt";

type Meta = { templates: { id: string; label: string; when: string; example: unknown }[] };

export default function KichBan() {
  const { project } = useProject();
  const pid = project!.id;
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const list = useApi<VideoSum[]>(`/projects/${pid}/videos`);
  const row = useApi<{ data: Video; timing: any }>(`/projects/${pid}/videos/${encodeURIComponent(key)}`);
  const meta = useApi<Meta>("/meta");
  const [v, setV] = useState<Video | null>(null);
  const [dirty, setDirty] = useState(false);
  const a = useAction();
  useEffect(() => { if (row.data) { setV(structuredClone(row.data.data)); setDirty(false); } }, [row.data]);
  if (!v) return <div>Đang tải…</div>;
  const upd = (fn: (x: Video) => void) => { const n = structuredClone(v); fn(n); setV(n); setDirty(true); };
  const save = () => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PUT", json: v }); await row.reload(); }, "Đã lưu");
  const renorm = () => a.run(async () => { if (dirty) await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PUT", json: v }); await api(`/projects/${pid}/videos/${encodeURIComponent(key)}/renormalize`, { method: "POST" }); await row.reload(); }, "Đã chuẩn hóa lại cách đọc (giữ các câu đã sửa tay)");
  return (
    <div>
      <PageHead step={4} title={`Kịch bản · ${v.title}`}>
        <button className="btn" onClick={renorm} disabled={a.busy}>Chuẩn hóa lại cách đọc</button>
        <button className="btn btn-primary" onClick={save} disabled={a.busy || !dirty}>{dirty ? "Lưu thay đổi" : "Đã lưu"}</button>
      </PageHead>
      {list.data && <VideoPicker pid={pid} videos={list.data} current={key} base="kich-ban" />}
      <Msg msg={a.msg} />
      {v.aiWritten && <div className="assume mb-3 text-sm">Kịch bản này do AI viết từ dàn ý/chủ đề – hãy đọc duyệt toàn bộ lời thoại trước khi làm giọng.</div>}
      <div className="card mb-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">Tiêu đề<input className="input mt-0.5" value={v.title} onChange={(e) => upd((x) => { x.title = e.target.value; })} /></label>
        <label className="text-sm md:col-span-2">Nguồn (in ở cảnh cuối)<input className="input mt-0.5" value={v.sources ?? ""} onChange={(e) => upd((x) => { x.sources = e.target.value; })} /></label>
        {v.context && <details className="md:col-span-3 text-sm"><summary className="cursor-pointer text-soft">Ngữ cảnh tài liệu (bảng số liệu, mô tả infographic) – dùng cho bước dựng cảnh</summary><pre className="mt-1 whitespace-pre-wrap text-xs">{v.context}</pre></details>}
      </div>
      {v.scenes.map((s, si) => (
        <SceneEditor key={s.id} scene={s} T={row.data?.timing?.scenes?.[si]} templates={meta.data?.templates ?? []} onChange={(fn) => upd((x) => fn(x.scenes[si]))} prompt={<ScenePrompt pid={pid} vkey={key} scene={s} busy={dirty} onQueued={row.reload} />} />
      ))}
      <button className="btn" onClick={() => upd((x) => { const n = x.scenes.length + 1; const last = x.scenes.at(-1); x.scenes.push({ id: `s${n}`, scriptStart: last?.scriptEnd ?? 0, scriptEnd: (last?.scriptEnd ?? 0) + 20, title: `Cảnh ${n}`, visual: "", onscreen: [], sentences: [] }); })}>+ Thêm cảnh</button>
    </div>
  );
}

function SceneEditor({ scene: s, T, templates, onChange, prompt }: { scene: Scene; T: any; templates: Meta["templates"]; onChange: (fn: (s: Scene) => void) => void; prompt: React.ReactNode }) {
  const [params, setParams] = useState(JSON.stringify(s.design?.params ?? {}, null, 1));
  const [perr, setPerr] = useState<string | null>(null);
  useEffect(() => setParams(JSON.stringify(s.design?.params ?? {}, null, 1)), [s.design]);
  return (
    <div className="card mb-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="num rounded-md bg-ink px-2 py-0.5 text-[12px] font-medium text-white">{s.id}</span>
        <input className="input w-64 font-semibold" value={s.title} onChange={(e) => onChange((x) => { x.title = e.target.value; })} />
        <span className="text-xs text-soft">Kịch bản {fmtSec(s.scriptStart)}–{fmtSec(s.scriptEnd)}{T ? ` · video ${T.start.toFixed(1)}–${(T.start + T.dur).toFixed(1)} s${T.estimated ? " (ước tính)" : ""}` : ""}</span>
      </div>
      {(s.assumptions?.length ?? 0) > 0 && (
        <div className="assume mb-2"><b>Cần duyệt – AI/template tự quyết:</b><ul className="ml-4 list-disc">{s.assumptions!.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Mô tả hình<textarea className="input mt-0.5" rows={2} value={s.visual} onChange={(e) => onChange((x) => { x.visual = e.target.value; })} /></label>
        <label className="text-sm">Chữ trên màn hình (mỗi dòng một mục)<textarea className="input mt-0.5" rows={2} value={s.onscreen.join("\n")} onChange={(e) => onChange((x) => { x.onscreen = e.target.value.split("\n"); })} /></label>
      </div>
      <table className="tbl mt-3">
        <thead><tr><th className="w-8">#</th><th>Lời thoại (hiển thị)</th><th>Cách đọc (gửi TTS)</th><th className="w-24">Mốc</th><th className="w-8"></th></tr></thead>
        <tbody>
          {s.sentences.map((x, k) => (
            <tr key={k}>
              <td className="text-xs text-soft">{k + 1}</td>
              <td><textarea className="input" rows={2} value={x.text} onChange={(e) => onChange((y) => { y.sentences[k].text = e.target.value; })} /></td>
              <td><textarea className={`input ${x.tts !== x.text ? "bg-sky-50" : ""}`} rows={2} value={x.tts} onChange={(e) => onChange((y) => { y.sentences[k].tts = e.target.value; y.sentences[k].ttsLocked = true; })} />
                {x.ttsLocked && <Badge tone="blue">sửa tay</Badge>}</td>
              <td className="text-xs text-soft">{T ? `${T.cues[k]?.toFixed(2)}–${T.ends[k]?.toFixed(2)}` : ""}</td>
              <td><button className="text-xs text-danger" onClick={() => onChange((y) => { y.sentences.splice(k, 1); })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn mt-2" onClick={() => onChange((y) => { y.sentences.push({ text: "", tts: "" }); })}>+ Câu</button>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-soft">Thiết kế cảnh: <b>{s.design?.template ?? "tự động"}</b> {s.design?.by ? `(${s.design.by === "ai" ? "AI" : s.design.by === "user" ? "người dùng" : "tự động"})` : ""}</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-[260px_1fr]">
          <div>
            <select className="input" value={s.design?.template ?? ""} onChange={(e) => onChange((y) => { const t = templates.find((t) => t.id === e.target.value); y.design = e.target.value ? { template: e.target.value, params: (y.design?.template === e.target.value ? y.design.params : (t?.example as any)) ?? {}, by: "user" } : undefined; })}>
              <option value="">— tự động / AI chọn —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.label}</option>)}
              <option value="custom">custom · cảnh tùy biến (AI viết mã)</option>
            </select>
            <div className="mt-1 text-xs text-soft">{templates.find((t) => t.id === s.design?.template)?.when}</div>
          </div>
          {s.design && s.design.template !== "custom" && (
            <div>
              <textarea className="input font-mono text-xs" rows={8} value={params} onChange={(e) => setParams(e.target.value)} onBlur={() => { try { const p = JSON.parse(params); setPerr(null); onChange((y) => { y.design = { ...y.design!, params: p, by: "user" }; }); } catch (e) { setPerr((e as Error).message); } }} />
              {perr && <div className="text-xs text-danger">JSON lỗi: {perr}</div>}
              <div className="text-xs text-soft">"at": {"{cue: chỉ số câu (0…), f: 0–1}"} – phần tử xuất hiện khi giọng nói tới đoạn đó.</div>
            </div>
          )}
        </div>
      </details>
      <div className="mt-3 border-t border-line pt-3">{prompt}</div>
    </div>
  );
}
