"use client";
import { useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { waitJob } from "@/lib/jobs";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead } from "@/components/ui";

type Theme = { id: string; name: string; description: string; dark: boolean; colors: Record<string, string> };

export default function PhongCach() {
  const { project, reload } = useProject();
  const pid = project!.id;
  const meta = useApi<{ themes: Theme[] }>("/meta");
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`, 5000);
  const [sample, setSample] = useState<string>("");
  const [shots, setShots] = useState<{ style: string; file: string }[]>([]);
  const [stamp, setStamp] = useState(0);
  const a = useAction();
  const preview = () => a.run(async () => {
    const [job] = await api<any[]>(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "theme-preview", keys: [sample || null] } });
    const j = await waitJob(job.id);
    setShots(j.result);
    setStamp(Date.now());
  });
  const setProject = (settings: Record<string, string>) => a.run(async () => { await api(`/projects/${pid}`, { method: "PATCH", json: { settings, applyToVideos: true } }); reload(); vids.reload(); }, "Đã áp dụng cho cả dự án");
  const setVideo = (key: string, patch: Record<string, string>) => a.run(async () => {
    const row = await api<any>(`/projects/${pid}/videos/${encodeURIComponent(key)}`);
    await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PUT", json: { ...row.data, ...patch } });
    vids.reload();
  });
  const rerender = (v: VideoSum) => a.run(async () => {
    const other = v.engine === "remotion" ? "hyperframes" : "remotion";
    const row = await api<any>(`/projects/${pid}/videos/${encodeURIComponent(v.key)}`);
    await api(`/projects/${pid}/videos/${encodeURIComponent(v.key)}`, { method: "PUT", json: { ...row.data, engine: other } });
    await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "render", keys: [v.key] } });
    vids.reload();
  }, "Đã xếp hàng render bằng bộ dựng còn lại (giữ nguyên giọng và timing)");
  return (
    <div>
      <PageHead step={6} title="Phong cách & bộ dựng" />
      <Msg msg={a.msg} />
      <div className="card mb-4">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">Khung mẫu
            <select className="input mt-0.5 w-72" value={sample} onChange={(e) => setSample(e.target.value)}>
              <option value="">Khung mẫu chuẩn (so sánh trái/phải)</option>
              {vids.data?.map((v) => <option key={v.key} value={v.key}>{v.key} – cảnh đầu đã dựng</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={a.busy} onClick={preview}>{a.busy ? "Đang dựng 5 kiểu…" : "Dựng cùng khung theo 5 kiểu"}</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {meta.data?.themes.map((t) => {
            const shot = shots.find((s) => s.style === t.id);
            const active = project!.settings.style === t.id;
            return (
              <div key={t.id} className={`rounded-lg border-2 p-2 ${active ? "border-brand" : "border-line"}`}>
                <div className="aspect-video overflow-hidden rounded bg-slate-100" style={{ background: t.colors.bg }}>
                  {shot ? <img src={`${fileUrl(shot.file)}&t=${stamp}`} alt={t.name} className="h-full w-full object-cover" /> : (
                    <div className="flex h-full items-center justify-center gap-2 p-4">
                      {["ink", "accent", "alt", "money", "warn"].map((k) => <span key={k} className="h-8 w-8 rounded-full border border-black/10" style={{ background: t.colors[k] }} />)}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{t.name} {active && <Badge tone="green">đang dùng</Badge>}</div><div className="text-xs text-soft">{t.description}</div></div>
                  <button className="btn shrink-0" disabled={active} onClick={() => setProject({ style: t.id })}>Chọn</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card mb-4">
        <h2 className="mb-2 font-semibold">Bộ dựng cho cả dự án</h2>
        <div className="flex gap-2">
          {(["hyperframes", "remotion"] as const).map((e) => (
            <button key={e} className={`btn ${project!.settings.engine === e ? "btn-primary" : ""}`} onClick={() => setProject({ engine: e })}>
              {e === "hyperframes" ? "HyperFrames (HTML + GSAP) – mặc định" : "Remotion (React)"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-soft">Hai bộ dựng dùng chung kịch bản JSON, giọng, manifest và timing; mỗi template cảnh viết một lần (SceneSpec) nên đổi bộ dựng không phải làm lại giọng hay thiết kế.</p>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Từng video</h2>
        <table className="tbl">
          <thead><tr><th>Video</th><th>Phong cách</th><th>Bộ dựng</th><th></th></tr></thead>
          <tbody>
            {vids.data?.filter((v) => v.include && !v.existing).map((v) => (
              <tr key={v.key}>
                <td className="font-mono text-xs">{v.key}</td>
                <td><select className="input" value={v.style} onChange={(e) => setVideo(v.key, { style: e.target.value })}>{meta.data?.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                <td><select className="input" value={v.engine} onChange={(e) => setVideo(v.key, { engine: e.target.value })}><option value="hyperframes">HyperFrames</option><option value="remotion">Remotion</option></select></td>
                <td><button className="btn" disabled={!v.rendered || a.busy} onClick={() => rerender(v)}>Dựng lại bằng bộ kia</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
