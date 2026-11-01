"use client";
import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead } from "@/components/ui";

type Theme = { id: string; name: string; description: string; dark: boolean; colors: Record<string, string>; fonts: { display: string; body: string; displayWeight: number } };
type FontPair = { id: string; name: string; description: string; display: string; body: string; displayWeight: number; generic: string };
type Styles = { previews: { key: string; styles: { style: string; file: string }[] } | null; job: { id: number; status: string; progress: number; message: string | null } | null };

export default function PhongCach() {
  const { project, reload } = useProject();
  const pid = project!.id;
  const meta = useApi<{ themes: Theme[]; fonts: FontPair[] }>("/meta");
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`, 5000);
  const styles = useApi<Styles>(`/projects/${pid}/styles`, 3000);
  const [sample, setSample] = useState<string>("");
  const [picked, setPicked] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const a = useAction();
  const s = project!.settings;
  useEffect(() => setPicked(s.style), [s.style]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  const shots = styles.data?.previews;
  const busy = !!styles.data?.job;
  const stamp = shots ? shots.styles.length : 0;
  const nThemes = meta.data?.themes.length;

  const regenerate = () =>
    a.run(async () => {
      await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "theme-preview", keys: [sample || vids.data?.[0]?.key || null] } });
      styles.reload();
    }, "Đang dựng lại các mẫu từ video đã chọn…");
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
        {s.styleConfirmed ? <Badge tone="green">Đã chọn: {meta.data?.themes.find((t) => t.id === s.style)?.name}</Badge> : <Badge tone="amber">Chưa chọn, bắt buộc trước khi sản xuất</Badge>}
      </PageHead>
      <Msg msg={a.msg} />
      <div className="card mb-4">
        <p className="mb-3 text-sm text-soft">
          {nThemes ? `${nThemes} mẫu` : "Các mẫu"} dưới đây được dựng từ <b>chính một cảnh trong video của bạn</b>, cùng nội dung, chỉ khác phong cách. Bấm vào mẫu để phóng to, chọn một mẫu rồi bấm
          <b> Dùng phong cách này</b>. Có thể đổi riêng từng video ở cuối trang.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="label mb-0">Dựng mẫu từ video
            <select className="input mt-1 w-full sm:w-80" value={sample} onChange={(e) => setSample(e.target.value)}>
              {vids.data?.map((v) => <option key={v.key} value={v.key}>{v.key} – {v.title}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy || a.busy || !vids.data?.length} onClick={regenerate}>{busy ? "Đang dựng các mẫu…" : "Dựng lại các mẫu"}</button>
          {busy && <span className="text-xs text-soft">{styles.data?.job?.status === "queued" ? "Đang chờ lượt…" : "Đang dựng… (khoảng 2 phút)"}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {meta.data?.themes.map((t) => {
            const shot = shots?.styles.find((x) => x.style === t.id);
            const sel = picked === t.id;
            return (
              <div key={t.id} className={`style-card ${sel ? "is-picked" : ""}`}>
                <button type="button" className="block w-full overflow-hidden rounded-lg" style={{ background: t.colors.bg }} onClick={() => (shot ? setZoom(shot.file) : setPicked(t.id))} aria-label={`Xem lớn mẫu ${t.name}`}>
                  <div className="aspect-video">
                    {shot ? (
                      <img src={`${fileUrl(shot.file)}&v=${stamp}-${busy ? 1 : 0}`} alt={t.name} className="shot h-full w-full rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center gap-2 p-4">
                        {["ink", "accent", "alt", "money", "warn"].map((k) => <span key={k} className="h-7 w-7 rounded-full border border-black/10" style={{ background: t.colors[k] }} />)}
                      </div>
                    )}
                  </div>
                </button>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">{t.name} {s.styleConfirmed && s.style === t.id && <Badge tone="green">đang dùng</Badge>}</div>
                    <div className="text-[12px] leading-snug text-soft">{t.description}</div>
                  </div>
                  <button className={`btn shrink-0 ${sel ? "btn-primary" : ""}`} aria-pressed={sel} onClick={() => setPicked(t.id)}>{sel ? "Đã chọn" : "Chọn"}</button>
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
        <div className="zoom fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true" aria-label="Xem lớn mẫu phong cách">
          <img src={fileUrl(zoom)} alt="Mẫu phóng to" className="max-h-full max-w-full rounded-xl shadow-2xl" />
          <button className="btn absolute right-4 top-4" style={{ marginTop: "env(safe-area-inset-top)" }} onClick={() => setZoom(null)}>Đóng</button>
        </div>
      )}

      <FontPicker themes={meta.data?.themes} fonts={meta.data?.fonts} styleId={picked ?? s.style} current={s.font ?? "theo-phong-cach"} busy={a.busy} onPick={(font) => setProject({ font })} />

      <div className="card mb-4">
        <h2 className="mb-2 text-base font-semibold">Bộ dựng cho cả dự án</h2>
        <div className="flex flex-wrap gap-2">
          {(["hyperframes", "remotion"] as const).map((e) => (
            <button key={e} className={`btn ${s.engine === e ? "btn-primary" : ""}`} onClick={() => setProject({ engine: e })}>
              {e === "hyperframes" ? "HyperFrames (HTML + GSAP), mặc định" : "Remotion (React)"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-soft">Hai bộ dựng cho cùng hình và cùng tiếng; đổi bộ dựng không phải làm lại giọng.</p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 text-base font-semibold">Đổi riêng từng video</h2>
        <table className="tbl">
          <thead><tr><th>Video</th><th>Phong cách</th><th>Font chữ</th><th>Bộ dựng</th><th></th></tr></thead>
          <tbody>
            {vids.data?.filter((v) => v.include && !v.existing).map((v) => (
              <tr key={v.key}>
                <td className="num text-[13px] font-medium">{v.key}</td>
                <td><select className="input" value={v.style} onChange={(e) => setVideo(v.key, { style: e.target.value })}>{meta.data?.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                <td><select className="input" value={v.font ?? "theo-phong-cach"} onChange={(e) => setVideo(v.key, { font: e.target.value === "theo-phong-cach" ? (undefined as unknown as string) : e.target.value })}><option value="theo-phong-cach">Theo phong cách</option>{meta.data?.fonts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
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

const SAMPLE_TITLE = "Thẩm định tín chỉ carbon";
const SAMPLE_BODY = "Mỗi tấn CO₂ giảm được ghi nhận sau kỳ giám sát ngày 01/01/2027.";

/** Chọn cặp phông cho video. Mỗi ô là một khung hình thu nhỏ dùng màu của phong cách đang chọn. */
function FontPicker({ themes, fonts, styleId, current, busy, onPick }: { themes?: Theme[]; fonts?: FontPair[]; styleId: string; current: string; busy: boolean; onPick: (id: string) => void }) {
  const th = themes?.find((t) => t.id === styleId);
  if (!th || !fonts) return null;
  const options: (FontPair & { isDefault?: boolean })[] = [
    { id: "theo-phong-cach", name: "Theo phong cách", description: `Giữ phông của "${th.name}": ${th.fonts.display}${th.fonts.body !== th.fonts.display ? ` + ${th.fonts.body}` : ""}.`, display: th.fonts.display, body: th.fonts.body, displayWeight: th.fonts.displayWeight, generic: "sans-serif", isDefault: true },
    ...fonts,
  ];
  const c = th.colors;
  return (
    <div className="card mb-4">
      {/* CSS @font-face cho phần xem trước; trình duyệt chỉ tải phần ký tự cần */}
      <link rel="stylesheet" href="/api/fonts.css" precedence="font-preview" />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Font chữ trong video</h2>
          <p className="text-[13px] text-soft">{options.length - 1} cặp phông tiêu đề + nội dung, đều đủ dấu tiếng Việt và nhúng sẵn khi render. Xem trước bằng màu của phong cách đang chọn.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((f) => {
          const sel = current === f.id;
          return (
            <button key={f.id} type="button" disabled={busy} aria-pressed={sel} onClick={() => !sel && onPick(f.id)} className={`style-card text-left ${sel ? "is-picked" : ""}`}>
              <div className="aspect-[16/7] overflow-hidden rounded-lg px-4 py-3" style={{ background: c.bg, color: c.ink, outline: "1px solid oklch(0 0 0 / 0.08)", outlineOffset: -1 }}>
                <div className="text-[22px] leading-tight" style={{ fontFamily: `'${f.display}', ${f.generic}`, fontWeight: f.displayWeight }}>{SAMPLE_TITLE}</div>
                <div className="mt-1.5 h-[3px] w-10 rounded-full" style={{ background: c.accent }} />
                <div className="mt-2 text-[13px] leading-snug" style={{ fontFamily: `'${f.body}', sans-serif`, color: c.inkSoft }}>{SAMPLE_BODY}</div>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{f.name}{sel && <Badge tone="green">đang dùng</Badge>}</div>
                  <div className="text-[12px] leading-snug text-soft">{f.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-soft">Đổi font áp dụng cho mọi video của dự án (có thể đổi riêng từng video ở bảng cuối trang). Video đã render cần "Dựng lại hình" ở bước Sản xuất, giữ nguyên giọng.</p>
    </div>
  );
}
