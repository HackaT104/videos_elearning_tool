"use client";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead, VideoPicker } from "@/components/ui";
import { ScenePrompt } from "@/components/scene-prompt";
import { useClaudeCode } from "@/components/claude-code";

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
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<HTMLVideoElement>(null);
  const a = useAction();
  const claude = useApi<{ available: boolean }>("/claude/status", 15000);
  const cc = useClaudeCode((m) => a.setMsg({ ok: true, text: m }));
  if (!data) return <div>Đang tải…</div>;
  const qa = data.qa;
  const v = data.data;
  const job = data.summary.job;
  const approve = () => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PATCH", json: { approve: true, override } }); reload(); }, "Đã duyệt – video sẽ được xuất ở bước 9");
  const starts: { id: string; start: number; dur: number }[] = data.timing?.scenes ?? [];
  const pick = (sid: string) => {
    setScene(sid);
    const t = starts.find((x) => x.id === sid);
    if (t && player.current) player.current.currentTime = t.start + 0.05;
  };
  const onTime = () => {
    const t = player.current?.currentTime ?? 0;
    setPlaying(starts.find((x) => t >= x.start && t < x.start + x.dur)?.id ?? null);
  };
  const thumb = (sid: string) => qa?.frames?.find((f) => f.scene === sid && /cuối cảnh/.test(f.label ?? ""))?.file;
  // không có Claude API → cùng việc đó vào hàng đợi cho Claude Code (gói đã đăng ký)
  const custom = (sid: string) =>
    claude.data?.available
      ? a.run(() => api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "ai-script", keys: [key], payload: { custom: true, scene: sid } } }), `AI đang viết mã cảnh tùy biến ${sid} (lint + chạy thử tự động)`)
      : cc.ask({ pid, kind: "custom-scene", videoKey: key, sceneId: sid });
  const errors = qa?.items.filter((i) => i.severity === "error") ?? [];
  const warns = qa?.items.filter((i) => i.severity !== "error") ?? [];
  return (
    <div>
      <PageHead step={8} title={`Duyệt · ${v.title}`}>
        {data.approved ? <Badge tone="green">Đã duyệt</Badge> : (
          <>
            {qa && !qa.ok && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Bỏ qua lỗi QA</label>}
            <button className="btn btn-primary" disabled={!data.summary.rendered || a.busy} onClick={approve}>Duyệt video</button>
          </>
        )}
      </PageHead>
      {list.data && <VideoPicker pid={pid} videos={list.data} current={key} base="duyet" />}
      <Msg msg={a.msg ?? (cc.msg && !cc.msg.ok ? cc.msg : null)} />
      {cc.dialog}
      {job && <div className="msg mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{job.kind === "revise" ? "AI đang sửa cảnh" : "Đang chạy"}: {job.message} <span className="num">({Math.round(job.progress)}%)</span></div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <div className="card mb-4">
            {data.summary.rendered && qa?.rendered ? (
              <video ref={player} onTimeUpdate={onTime} key={qa.renderedAt} className="w-full rounded-lg bg-black" controls preload="metadata" src={`${fileUrl(qa.rendered)}&t=${qa.renderedAt}`}>
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
          <div className="card mb-4 p-0">
            <div className="px-5 pt-4 sm:px-5">
              <h2 className="text-base font-semibold">Các cảnh</h2>
              <p className="text-[13px] text-soft">Chọn một cảnh để nhảy tới đoạn đó trong video, xem chỗ AI tự quyết và nhờ AI sửa riêng cảnh này.</p>
            </div>
            <ul className="mt-2 divide-y divide-line/70">
              {v.scenes.map((s: any) => {
                const sel = s.id === scene;
                const list = [...new Set([...(s.assumptions ?? []), ...(qa?.assumptions?.[s.id] ?? [])])] as string[];
                const img = thumb(s.id);
                return (
                  <li key={s.id} className={sel ? "bg-[#f8faf9]" : ""}>
                    <button type="button" aria-expanded={sel} onClick={() => pick(s.id)} className="row-link flex w-full items-center gap-3 px-4 py-2.5 text-left sm:px-5">
                      <span className="relative block aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-[#e9eeec]">
                        {img && <img src={fileUrl(img)} alt="" className="shot h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold"><span className="num">{s.id}</span>{playing === s.id && <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-label="đang phát" />}</span>
                        <span className="block truncate text-sm">{s.title}</span>
                        <span className="block text-[12px] text-soft">{s.design?.template === "custom" ? "cảnh tùy biến" : s.design?.template ?? "tự động"}{list.length ? ` · ${list.length} chỗ cần duyệt` : ""}{s.history?.length ? ` · đã sửa ${s.history.length} lần` : ""}</span>
                      </span>
                    </button>
                    {sel && (
                      <div className="px-4 pb-4 sm:px-5">
                        {list.map((x, k) => <div key={k} className="assume mt-1">{x}</div>)}
                        <div className="mt-3"><ScenePrompt pid={pid} vkey={key} scene={s} busy={!!job} onQueued={reload} /></div>
                        <button className="mt-2 text-[12px] text-soft underline" onClick={() => custom(s.id)}>{claude.data?.available === false ? "Hoặc để Claude Code viết lại cảnh này từ đầu (mã tùy biến)" : "Hoặc để AI viết lại cảnh này từ đầu (mã tùy biến)"}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
