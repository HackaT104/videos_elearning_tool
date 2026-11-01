"use client";
import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead } from "@/components/ui";

type Theme = { id: string; name: string; description: string; dark: boolean; colors: Record<string, string> };
type Styles = { previews: { key: string; styles: { style: string; file: string }[] } | null; job: { id: number; status: string; progress: number; message: string | null } | null };

export default function PhongCach() {
  const { project, reload } = useProject();
  const pid = project!.id;
  const meta = useApi<{ themes: Theme[] }>("/meta");
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`, 5000);
  const styles = useApi<Styles>(`/projects/${pid}/styles`, 3000);
  const [sample, setSample] = useState<string>("");
  const [picked, setPicked] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const a = useAction();
  const s = project!.settings;
  useEffect(() => setPicked(s.style), [s.style]);
  const shots = styles.data?.previews;
  const busy = !!styles.data?.job;
  const stamp = shots ? shots.styles.length : 0;

  const regenerate = () =>
    a.run(async () => {
      await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "theme-preview", keys: [sample || vids.data?.[0]?.key || null] } });
      styles.reload();
    }, "Đang dựng lại 10 mẫu từ video đã chọn…");
  const confirm = () =>
    a.run(async () => {
      await api(`/projects/${pid}`, { method: "PATCH", json: { settings: { style: picked, styleConfirmed: true }, applyToVideos: true } });
      reload();
      vids.reload();
    }, "Đã chọn phong cách cho cả dự án – có thể sang bước Giọng đọc CIT");
  const setProject = (settings: Record<string, string>) => a.run(async () => { await api(`/projects/${pid}`, { method: "PATCH", json: { settings, applyToVideos: true } }); reload(); vids.reload(); }, "Đã áp dụng cho cả dự án");
  const setVideo = (key: string, patch: Record<string, string>) =>
    a.run(async () => {
      const row = await api<any>(`/projects/${pid}/videos/${encodeURIComponent(key)}`);
      await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PUT", json: { ...row.data, ...patch } });
      vids.reload();
    });
  const rerender = (v: VideoSum) =>
    a.run(async () => {
      const other = v.engine === "remotion" ? "hyperframes" : "remotion";
      const row = await api<any>(`/projects/${pid}/videos/${encodeURIComponent(v.key)}`);
      await api(`/projects/${pid}/videos/${encodeURIComponent(v.key)}`, { method: "PUT", json: { ...row.data, engine: other } });
      await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "render", keys: [v.key] } });
      vids.reload();
    }, "Đã xếp hàng render bằng bộ dựng còn lại (giữ nguyên giọng và timing)");

  return (
    <div>
      <PageHead step={5} title="Chọn phong cách video">
        {s.styleConfirmed ? <Badge tone="green">Đã chọn: {meta.data?.themes.find((t) => t.id === s.style)?.name}</Badge> : <Badge tone="amber">Chưa chọn – bắt buộc trước khi sản xuất</Badge>}
      </PageHead>
      <Msg msg={a.msg} />
      <div className="card mb-4">
        <p className="mb-3 text-sm text-soft">
          10 mẫu dưới đây được dựng từ <b>chính một cảnh trong video của bạn</b>, cùng nội dung, chỉ khác phong cách. Bấm vào mẫu để phóng to, chọn một mẫu rồi bấm
          <b> Dùng phong cách này</b>. Có thể đổi riêng từng video ở cuối trang.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">Dựng mẫu từ video
            <select className="input mt-0.5 w-72" value={sample} onChange={(e) => setSample(e.target.value)}>
              {vids.data?.map((v) => <option key={v.key} value={v.key}>{v.key} – {v.title}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy || a.busy || !vids.data?.length} onClick={regenerate}>{busy ? "Đang dựng 10 mẫu…" : "Dựng lại 10 mẫu"}</button>
          {busy && <span className="text-xs text-soft">{styles.data?.job?.status === "queued" ? "Đang chờ lượt…" : "Đang dựng… (khoảng 1 phút)"}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {meta.data?.themes.map((t) => {
            const shot = shots?.styles.find((x) => x.style === t.id);
            const sel = picked === t.id;
            return (
              <div key={t.id} className={`rounded-lg border-2 p-2 transition ${sel ? "border-brand ring-2 ring-brand/30" : "border-line"}`}>
                <button type="button" className="block w-full overflow-hidden rounded" style={{ background: t.colors.bg }} onClick={() => (shot ? setZoom(shot.file) : setPicked(t.id))} aria-label={`Xem lớn mẫu ${t.name}`}>
                  <div className="aspect-video">
                    {shot ? (
                      <img src={`${fileUrl(shot.file)}&v=${stamp}-${busy ? 1 : 0}`} alt={t.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center gap-2 p-4">
                        {["ink", "accent", "alt", "money", "warn"].map((k) => <span key={k} className="h-7 w-7 rounded-full border border-black/10" style={{ background: t.colors[k] }} />)}
                      </div>
                    )}
                  </div>
                </button>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{t.name} {s.styleConfirmed && s.style === t.id && <Badge tone="green">đang dùng</Badge>}</div>
                    <div className="text-xs text-soft">{t.description}</div>
                  </div>
                  <button className={`btn shrink-0 ${sel ? "btn-primary" : ""}`} onClick={() => setPicked(t.id)}>{sel ? "✓ Đã chọn" : "Chọn"}</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={!picked || a.busy} onClick={confirm}>Dùng phong cách này cho cả dự án</button>
          <span className="text-xs text-soft">Áp dụng cho mọi video; đổi lại bất kỳ lúc nào (chỉ cần "Chỉ dựng lại hình", giữ nguyên giọng).</span>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)} role="dialog" aria-label="Xem lớn">
          <img src={fileUrl(zoom)} alt="Mẫu phóng to" className="max-h-full max-w-full rounded" />
        </div>
      )}

      <div className="card mb-4">
        <h2 className="mb-2 font-semibold">Bộ dựng cho cả dự án</h2>
        <div className="flex flex-wrap gap-2">
          {(["hyperframes", "remotion"] as const).map((e) => (
            <button key={e} className={`btn ${s.engine === e ? "btn-primary" : ""}`} onClick={() => setProject({ engine: e })}>
              {e === "hyperframes" ? "HyperFrames (HTML + GSAP) – mặc định" : "Remotion (React)"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-soft">Hai bộ dựng cho cùng hình và cùng tiếng; đổi bộ dựng không phải làm lại giọng.</p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Đổi riêng từng video</h2>
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
