"use client";
import { useEffect, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Msg } from "@/components/ui";

type Item = { id: string; source: "project" | "library"; name: string; size: number; path: string | null };
type Music = { file: string; source: "project" | "library"; volumeDb: number; duck: boolean; fadeIn: number; fadeOut: number; license?: string };
type View = { project: Item[]; library: Item[]; libraryDir: string; music: Music | null; stale: string[] };

const MAX = 40 * 1024 * 1024;
const DEF = { volumeDb: -20, duck: true, fadeIn: 1, fadeOut: 1 };

/** "Nhạc nền và âm lượng": giọng luôn được chuẩn hoá −16 LUFS; nhạc nền tuỳ chọn, tự hạ khi có giọng. */
export function MusicSettings({ pid }: { pid: string }) {
  const v = useApi<View>(`/projects/${pid}/music`);
  const a = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [m, setM] = useState<Music | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (v.data && !dirty) setM(v.data.music);
  }, [v.data, dirty]);
  const items = [...(v.data?.project ?? []), ...(v.data?.library ?? [])];
  const cur = m ? items.find((x) => x.id === m.file && x.source === m.source) : undefined;
  const edit = (patch: Partial<Music>) => {
    setM((x) => (x ? { ...x, ...patch } : x));
    setDirty(true);
  };
  const pick = (val: string) => {
    if (!val) {
      setM(null);
      setDirty(true);
      return;
    }
    const [source, ...rest] = val.split(":");
    setM((x) => ({ ...DEF, ...(x ?? {}), source: source as Music["source"], file: rest.join(":") }));
    setDirty(true);
  };
  const save = () =>
    a.run(async () => {
      v.setData(await api<View>(`/projects/${pid}/music`, { method: "PATCH", json: { music: m } }));
      setDirty(false);
    }, m ? "Đã lưu nhạc nền – áp dụng ở lần render tới" : "Đã tắt nhạc nền");
  const upload = (f: File) =>
    a.run(async () => {
      if (f.size > MAX) throw new Error("Nhạc quá lớn (tối đa 40 MB)");
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<Item>(`/projects/${pid}/music`, { method: "POST", body: fd });
      await v.reload();
      pick(`project:${r.id}`);
    }, "Đã tải nhạc lên – bấm Lưu nhạc nền để dùng");
  const remix = () =>
    a.run(async () => {
      const r = await api<{ jobs: unknown[] }>(`/projects/${pid}/music/remix`, { method: "POST" });
      await v.reload();
      return r;
    }, `Đã xếp hàng trộn lại tiếng cho ${v.data?.stale.length ?? 0} video`);
  const openLib = () => a.run(() => api("/open-folder", { method: "POST", json: { path: v.data?.libraryDir } }));

  return (
    <div className="card mb-4">
      <h2 className="mb-1 font-semibold">Nhạc nền và âm lượng</h2>
      <p className="mb-3 text-xs text-soft">Giọng đọc luôn được chuẩn hoá về −16 LUFS (đỉnh −1,5 dBTP) khi render, để mọi video to đều nhau. Nhạc nền là tuỳ chọn: nhạc nằm dưới giọng và tự hạ xuống khi có lời đọc.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 text-sm">
          <label className="block text-xs" htmlFor="music-pick">Nhạc nền</label>
          <select id="music-pick" className="input mt-0.5" value={m ? `${m.source}:${m.file}` : ""} onChange={(e) => pick(e.target.value)}>
            <option value="">Không dùng nhạc nền</option>
            {v.data?.project.length ? <optgroup label="Tải lên dự án này">{v.data.project.map((x) => <option key={x.id} value={`project:${x.id}`}>{x.name}</option>)}</optgroup> : null}
            {v.data?.library.length ? <optgroup label="Thư viện nhạc (am-nhac)">{v.data.library.map((x) => <option key={x.id} value={`library:${x.id}`}>{x.name}</option>)}</optgroup> : null}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={a.busy} onClick={() => file.current?.click()}>Tải nhạc lên</button>
            <input ref={file} type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" className="sr-only" aria-label="Tải file nhạc nền MP3 hoặc WAV" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            <button type="button" className="btn" disabled={a.busy || !v.data} onClick={openLib}>Mở thư mục nhạc</button>
            <button type="button" className="btn" disabled={a.busy} onClick={() => v.reload()}>Làm mới</button>
          </div>
          <p className="mt-1 text-xs text-soft">MP3 hoặc WAV, tối đa 40 MB. Nhạc dùng chung cho mọi dự án: chép vào thư mục <code className="break-all">{v.data?.libraryDir ?? "am-nhac"}</code> rồi bấm Làm mới.</p>
          {cur?.path && <audio className="mt-2 h-8 w-full" src={fileUrl(cur.path)} controls preload="none" aria-label={`Nghe thử ${cur.name}`} />}
        </div>
        {m && (
          <div className="min-w-0 text-sm">
            <label className="block">Mức nhạc so với giọng: <b className="tabular-nums">{m.volumeDb} dB</b>
              <input type="range" min={-35} max={-8} step={1} value={m.volumeDb} onChange={(e) => edit({ volumeDb: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-brand)]" />
              <span className="text-xs text-soft">−35 rất nhỏ · −20 mặc định · −8 khá to (dễ lấn giọng).</span>
            </label>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={m.duck} onChange={(e) => edit({ duck: e.target.checked })} /> Tự hạ nhạc khi có giọng đọc</label>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="text-xs">Hiện dần (s)<input type="number" min={0} max={10} step={0.5} className="input mt-0.5 w-20" value={m.fadeIn} onChange={(e) => edit({ fadeIn: Number(e.target.value) })} /></label>
              <label className="text-xs">Tắt dần (s)<input type="number" min={0} max={10} step={0.5} className="input mt-0.5 w-20" value={m.fadeOut} onChange={(e) => edit({ fadeOut: Number(e.target.value) })} /></label>
            </div>
            <label className="mt-2 block text-xs">Giấy phép / nguồn nhạc
              <input className="input mt-0.5" placeholder="Ví dụ: Pixabay Content License – tác giả X" value={m.license ?? ""} onChange={(e) => edit({ license: e.target.value })} />
            </label>
            <p className="mt-1 text-xs text-soft">Chỉ dùng nhạc bạn có quyền dùng cho mục đích thương mại. Ghi nguồn ở đây để đưa vào danh mục khi xuất.</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={a.busy || !dirty} onClick={save}>Lưu nhạc nền</button>
        {!!v.data?.stale.length && !dirty && (
          <button type="button" className="btn" disabled={a.busy} onClick={remix} title="Chỉ trộn lại tiếng, giữ nguyên hình (video render trước bản này sẽ được render lại)">Trộn lại tiếng cho {v.data.stale.length} video đã render</button>
        )}
      </div>
      <Msg msg={a.msg} />
    </div>
  );
}
