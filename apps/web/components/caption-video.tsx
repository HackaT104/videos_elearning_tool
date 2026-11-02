"use client";
// Trình phát duyệt video có phụ đề nhiều ngôn ngữ: nút CC + menu ngôn ngữ (Tắt / Tiếng Việt / English…), cỡ chữ và vị trí chỉnh tại chỗ
// (chỉ trên máy này, không lưu vào dự án). Cỡ chữ ::cue theo bề rộng thật của trình phát; vị trí bằng VTTCue line/snapToLines.
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { SubtitleSettings } from "@cvs/core/overlay";

type Lang = { code: string; name: string; native: string };
type Local = { lang: string; size: number; position: "bottom" | "top"; offset: number };
const KEY = "cvs-cc";

function loadLocal(): Partial<Local> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const CaptionVideo = forwardRef<HTMLVideoElement | null, { src: string; vtt: string; ver?: string; langs: Lang[]; sub: SubtitleSettings; onTimeUpdate?: () => void }>(function CaptionVideo({ src, vtt, ver = "", langs, sub, onTimeUpdate }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => video.current!, []);
  const id = useId().replace(/:/g, "");
  const avail = langs.filter((l) => sub.languages.includes(l.code));
  // mặc định: bật tiếng Việt khi phụ đề "trong trình phát"; gắn cứng/tắt → CC tắt (tránh hai lớp chữ)
  const [st, setSt] = useState<Local>({ lang: sub.mode === "player" ? "vi" : "off", size: sub.size, position: sub.position, offset: sub.offset });
  const [w, setW] = useState(960);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  useEffect(() => {
    const l = loadLocal();
    setSt((s) => ({ ...s, ...l, lang: l.lang && (l.lang === "off" || avail.some((x) => x.code === l.lang)) ? l.lang : s.lang }));
  }, []);
  const set = (p: Partial<Local>) =>
    setSt((s) => {
      const n = { ...s, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {
        /* trình duyệt chặn lưu – vẫn dùng được */
      }
      return n;
    });
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // bật đúng một track; đặt vị trí từng cue (line âm = tính từ đáy, theo số dòng)
  const fontPx = Math.max(10, (st.size * w) / 1920);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const apply = () => {
      const lineH = fontPx * 1.35;
      const n = Math.round(((st.offset / 100) * (el.clientHeight || (w * 9) / 16)) / lineH);
      for (const t of Array.from(el.textTracks)) {
        t.mode = t.language === st.lang ? "showing" : "disabled";
        for (const c of Array.from(t.cues ?? []) as VTTCue[]) {
          c.snapToLines = true;
          c.line = st.position === "bottom" ? -(n + 1) : n;
          c.size = sub.maxWidth;
          c.position = 50;
          c.align = "center";
        }
      }
    };
    apply();
    const tracks = Array.from(el.querySelectorAll("track"));
    tracks.forEach((t) => t.addEventListener("load", apply));
    return () => tracks.forEach((t) => t.removeEventListener("load", apply));
  }, [st, fontPx, w, sub.maxWidth, ver, avail.length]);
  const cur = avail.find((l) => l.code === st.lang);
  return (
    <div>
      <style>{`video.cc-${id}::cue{font-size:${fontPx.toFixed(1)}px;line-height:1.3;font-weight:600;color:#fff;background:rgba(0,0,0,${sub.background});}`}</style>
      <video ref={video} onTimeUpdate={onTimeUpdate} className={`cc-${id} w-full rounded-lg bg-black`} controls preload="metadata" src={src}>
        {avail.map((l) => <track key={l.code} kind="subtitles" srcLang={l.code} label={l.native} src={`${vtt}?lang=${l.code}&v=${ver}`} />)}
      </video>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative" ref={menu}>
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`btn ${st.lang !== "off" ? "btn-primary" : ""}`} title="Phụ đề (CC)">
            <span className="rounded-[4px] border border-current px-1 text-[11px] font-bold leading-4">CC</span>
            {cur ? cur.name : "Tắt phụ đề"}
          </button>
          {open && (
            <div role="menu" aria-label="Ngôn ngữ phụ đề" className="menu-pop" style={{ left: 0, right: "auto", width: 220 }} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
              {[{ code: "off", name: "Tắt", native: "" }, ...avail].map((l) => (
                <button key={l.code} type="button" role="menuitemradio" aria-checked={st.lang === l.code} onClick={() => (set({ lang: l.code }), setOpen(false))}>
                  {st.lang === l.code ? "✓ " : ""}{l.name}
                  {l.native && l.native !== l.name && <small>{l.native}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="flex min-w-[180px] flex-1 items-center gap-2 whitespace-nowrap text-[13px] text-soft">
          Cỡ chữ
          <input type="range" min={24} max={72} value={st.size} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" aria-label="Cỡ chữ phụ đề" />
          <span className="num w-10 text-ink">{st.size}px</span>
        </label>
        <div role="group" aria-label="Vị trí phụ đề" className="flex gap-1">
          {(["bottom", "top"] as const).map((p) => <button key={p} type="button" aria-pressed={st.position === p} onClick={() => set({ position: p })} className={`seg ${st.position === p ? "is-on" : ""}`}>{p === "bottom" ? "Dưới" : "Trên"}</button>)}
        </div>
        <label className="flex min-w-[160px] flex-1 items-center gap-2 whitespace-nowrap text-[13px] text-soft">
          Cách mép
          <input type="range" min={0} max={30} step={1} value={st.offset} onChange={(e) => set({ offset: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" aria-label="Khoảng cách phụ đề tới mép" />
          <span className="num w-8 text-ink">{st.offset}%</span>
        </label>
      </div>
      {sub.mode === "burn" && <p className="mt-1 text-[12px] text-soft">Video có phụ đề gắn cứng ({langs.find((l) => l.code === sub.burnLanguage)?.name}); nút CC bật thêm phụ đề của trình phát.</p>}
      <p className="mt-1 text-[12px] text-soft">Cỡ chữ và vị trí ở đây chỉ để xem trên máy này. Cài đặt cho dự án ở bước Chọn phong cách, mục Phụ đề và logo.</p>
    </div>
  );
});
