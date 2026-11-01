"use client";
import { useRef } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Msg } from "@/components/ui";

export type ProjectAsset = { id: string; url: string; w: number; h: number; name: string; size: number };

const MAX = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** "Ảnh của cảnh": tải ảnh lên dự án (PNG/JPG/WebP/SVG ≤ 10 MB) hoặc chọn ảnh đã có → cảnh dùng template image-focus. */
export function SceneImage({ pid, sceneId, current, onPick }: { pid: string; sceneId: string; current?: string; onPick: (id: string) => void }) {
  const list = useApi<ProjectAsset[]>(`/projects/${pid}/assets`);
  const file = useRef<HTMLInputElement>(null);
  const a = useAction();
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
        <span className="text-[12px] text-soft">PNG, JPG, WebP hoặc SVG, tối đa 10 MB. Ảnh chụp màn hình, ảnh hiện trường – cảnh sẽ khoanh vùng và phóng to theo lời thoại.</span>
      </div>
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
