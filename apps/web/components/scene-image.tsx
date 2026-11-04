"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Msg } from "@/components/ui";

type Credit = { source: string; creator: string; license: string; licenseName: string; licenseUrl: string; url: string; title: string };
export type ProjectAsset = { id: string; url: string; w: number; h: number; name: string; size: number; ext?: string; credit?: Credit };
type StockResult = Credit & { id: string; thumb: string; width: number; height: number };
const SOURCE: Record<string, string> = { openverse: "Openverse", wikimedia: "Wikimedia Commons", pexels: "Pexels" };

/** Nhãn giấy phép: BY/BY-SA phải ghi tác giả (ứng dụng tự thêm dòng ghi nguồn trên cảnh); BY-SA còn là chia sẻ tương tự. */
function LicenseBadge({ c }: { c: Pick<Credit, "license" | "licenseName"> }) {
  const attr = c.license === "CC BY" || c.license === "CC BY-SA";
  return (
    <span title={c.licenseName + (c.license === "CC BY-SA" ? " – chia sẻ tương tự: bản phái sinh của ảnh phải dùng cùng giấy phép" : attr ? " – phải ghi tác giả" : " – không bắt buộc ghi tác giả")}
      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${attr ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
      {c.license}{c.license === "CC BY-SA" ? " · chia sẻ tương tự" : ""}
    </span>
  );
}

/** Tìm ảnh miễn phí (Openverse, Wikimedia Commons, Pexels nếu có khoá) – chỉ giấy phép dùng thương mại được. */
function StockSearch({ pid, sceneId, onImported }: { pid: string; sceneId: string; onImported: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ results: StockResult[]; errors: string[]; sources: string[] } | null>(null);
  const a = useAction();
  const search = () => a.run(async () => setRes(await api(`/projects/${pid}/stock/search?q=${encodeURIComponent(q)}`)));
  const pick = (x: StockResult) =>
    a.run(async () => {
      const r = await api<ProjectAsset>(`/projects/${pid}/stock/import`, { method: "POST", json: { source: x.source, id: x.id } });
      onImported(r.id);
    }, "Đã nhập ảnh kèm ghi nguồn và gắn vào cảnh – bấm Lưu thay đổi để dựng lại");
  return (
    <div className="mt-2 rounded-lg bg-paper p-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(); }}>
        <label className="sr-only" htmlFor={`stock-${sceneId}`}>Từ khoá tìm ảnh</label>
        <input id={`stock-${sceneId}`} className="input min-w-0 flex-1" placeholder="Từ khoá, ví dụ: wind turbine, nhà máy, rừng" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={a.busy || !q.trim()}>{a.busy && !res ? "Đang tìm…" : "Tìm"}</button>
      </form>
      <p className="mt-1 text-[12px] text-soft">Chỉ hiện ảnh dùng thương mại được: CC0, PDM (không bắt buộc ghi tác giả), CC BY, CC BY-SA (phải ghi tác giả – ứng dụng tự thêm dòng nguồn trên cảnh và trong credits.txt khi xuất). Từ khoá tiếng Anh cho nhiều kết quả hơn.</p>
      {res && <p className="mt-1 text-[12px] text-soft">Nguồn đã tìm: {res.sources.map((s) => SOURCE[s] ?? s).join(", ")}{res.sources.includes("pexels") ? "" : " · thêm khoá Pexels ở trang Cài đặt để tìm cả Pexels"}</p>}
      {res?.errors.map((e) => <p key={e} className="mt-1 text-[12px] text-danger">{e}</p>)}
      {res && !res.results.length && !res.errors.length && <p className="mt-2 text-sm text-soft">Không có ảnh phù hợp – thử từ khoá khác.</p>}
      {!!res?.results.length && (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="Kết quả tìm ảnh">
          {res.results.map((x) => (
            <li key={`${x.source}:${x.id}`} className="min-w-0 overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_rgb(19_34_43/0.1),0_1px_2px_rgb(19_34_43/0.06)]">
              <img src={x.thumb} alt={x.title} loading="lazy" referrerPolicy="no-referrer" className="h-[96px] w-full bg-paper object-cover" />
              <div className="space-y-1 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-1"><LicenseBadge c={x} /><span className="text-[11px] text-soft">{SOURCE[x.source]}</span></div>
                <div className="truncate text-[12px]" title={`${x.title} – ${x.creator}`}>{x.creator || "không rõ tác giả"}</div>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn px-2 py-1 text-[12px]" disabled={a.busy} onClick={() => pick(x)} aria-label={`Dùng ảnh ${x.title || x.id} của ${x.creator || "không rõ tác giả"}`}>Dùng ảnh này</button>
                  <a className="text-[11px] text-soft underline" href={x.url} target="_blank" rel="noreferrer">nguồn</a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Msg msg={a.msg} />
    </div>
  );
}

const MAX = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** "Ảnh của cảnh": tải ảnh lên dự án (PNG/JPG/WebP/SVG ≤ 10 MB) hoặc chọn ảnh đã có → cảnh dùng template image-focus. */
export function SceneImage({ pid, sceneId, current, onPick }: { pid: string; sceneId: string; current?: string; onPick: (id: string) => void }) {
  const list = useApi<ProjectAsset[]>(`/projects/${pid}/assets`);
  const file = useRef<HTMLInputElement>(null);
  const a = useAction();
  const [stock, setStock] = useState(false);
  const upload = (f: File) =>
    a.run(async () => {
      if (f.size > MAX) throw new Error("Ảnh quá lớn (tối đa 10 MB)");
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<ProjectAsset>(`/projects/${pid}/assets`, { method: "POST", body: fd });
      await list.reload();
      onPick(r.id);
    }, "Đã tải ảnh lên và gắn vào cảnh – bấm Lưu thay đổi để dựng lại");
  const remove = (x: ProjectAsset) =>
    a.run(async () => {
      if (!confirm(`Xoá ảnh "${x.name}" khỏi dự án? Cảnh đang dùng ảnh này sẽ hiện khung trống.`)) return;
      await api(`/projects/${pid}/assets/${x.id}`, { method: "DELETE" });
      await list.reload();
    });
  const items = list.data ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0" id={`si-${sceneId}`}>Ảnh của cảnh</span>
        <button type="button" className="btn" disabled={a.busy} onClick={() => file.current?.click()}>{a.busy ? "Đang tải…" : "Tải ảnh lên"}</button>
        <input ref={file} type="file" accept={ACCEPT} className="sr-only" aria-label={`Tải ảnh cho cảnh ${sceneId}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        <button type="button" className="btn" aria-expanded={stock} onClick={() => setStock((x) => !x)}>{stock ? "Đóng tìm ảnh" : "Tìm ảnh miễn phí"}</button>
        <span className="text-[12px] text-soft">PNG, JPG, WebP hoặc SVG, tối đa 10 MB. Ảnh chụp màn hình, ảnh hiện trường – cảnh sẽ khoanh vùng và phóng to theo lời thoại.</span>
      </div>
      {stock && <StockSearch pid={pid} sceneId={sceneId} onImported={async (id) => { await list.reload(); onPick(id); }} />}
      {items.length > 0 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-labelledby={`si-${sceneId}`}>
          {items.map((x) => {
            const on = x.id === current;
            return (
              <li key={x.id} className="relative shrink-0">
                <button
                  type="button"
                  aria-pressed={on}
                  title={`${x.name} · ${x.w}×${x.h}`}
                  onClick={() => onPick(x.id)}
                  className={`block w-[132px] overflow-hidden rounded-lg bg-white text-left transition-shadow duration-150 ${on ? "shadow-[0_0_0_2px_var(--color-brand)]" : "shadow-[0_0_0_1px_rgb(19_34_43/0.1),0_1px_2px_rgb(19_34_43/0.06)]"}`}
                >
                  <img src={x.url} alt="" loading="lazy" className="h-[80px] w-full bg-paper object-contain" />
                  <span className="block truncate px-2 py-1 text-[12px] text-soft">{on ? "✓ " : ""}{x.name}</span>
                  {x.credit && <span className="block px-2 pb-1"><LicenseBadge c={x.credit} /></span>}
                </button>
                <button type="button" aria-label={`Xoá ảnh ${x.name}`} disabled={a.busy} onClick={() => remove(x)} className="absolute right-1 top-1 h-6 w-6 rounded-md bg-white/90 text-[12px] text-danger shadow-[0_0_0_1px_rgb(19_34_43/0.1)]">✕</button>
              </li>
            );
          })}
        </ul>
      )}
      <Msg msg={a.msg} />
    </div>
  );
}
