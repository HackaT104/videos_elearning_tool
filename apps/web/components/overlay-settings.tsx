"use client";
// "Phụ đề và logo" (bước Chọn phong cách): chế độ phụ đề, cỡ/vị trí/nền, ngôn ngữ; logo tải từ máy (kéo thả), vị trí 6 ô, cỡ, lề, độ đậm;
// khung xem trước 16:9 cập nhật ngay, dùng đúng phép tính vị trí/chia dòng của bộ dựng (@cvs/core/overlay).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { chunkCaption, LOGO_POSITIONS, overlayLayout, type LogoSettings, type SubtitleSettings } from "@cvs/core/overlay";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";
import type { ProjectAsset } from "@/components/scene-image";

type Lang = { code: string; name: string; native: string };
export type OverlayView = { subtitle: SubtitleSettings; logo: LogoSettings; langs: Lang[]; isDefault: boolean; hasDefault: boolean; rendered: string[]; stale: string[]; missing: Record<string, number> };
type Theme = { id: string; name: string; dark: boolean; colors: Record<string, string>; fonts: { display: string; body: string } };

const MAX = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const SAMPLE: Record<string, string> = {
  vi: "Mỗi tín chỉ carbon tương ứng với một tấn CO₂e đã được thẩm tra độc lập.",
  en: "Each carbon credit equals one tonne of CO₂e that has been independently verified.",
};
const POS_LABEL: Record<string, string> = { "top-left": "Trên trái", "top-center": "Trên giữa", "top-right": "Trên phải", "bottom-left": "Dưới trái", "bottom-center": "Dưới giữa", "bottom-right": "Dưới phải" };
const MODES: { id: SubtitleSettings["mode"]; label: string; hint: string }[] = [
  { id: "off", label: "Tắt", hint: "Không hiện phụ đề (vẫn xuất được .vtt)" },
  { id: "player", label: "Chỉ trong trình phát", hint: "Người xem bật/tắt bằng nút CC" },
  { id: "burn", label: "Gắn cứng vào video", hint: "Chữ nằm trong hình, luôn hiện" },
];

/** Ảnh có điểm ảnh trong suốt? (SVG coi như có) – để cảnh báo logo nền đặc trên phong cách tối. */
async function hasAlpha(url: string, svg: boolean): Promise<boolean | null> {
  if (svg) return true;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Math.min(160, img.naturalWidth);
    const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement("canvas");
    Object.assign(c, { width: w, height: h });
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  } catch {
    return null;
  }
}

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="label mb-0 flex justify-between"><span>{label}</span><span className="num text-ink">{unit === "%" && max <= 1 ? Math.round(value * 100) : value}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" />
    </label>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode; hint?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={`seg ${value === o.id ? "is-on" : ""}`}>
          <span className="font-medium">{o.label}</span>
          {o.hint && <small className="text-[12px] text-soft">{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export function OverlaySettings({ pid, theme, bodyFont, frame }: { pid: string; theme?: Theme; bodyFont?: string; frame?: string | null }) {
  const view = useApi<OverlayView>(`/projects/${pid}/overlay`);
  const assets = useApi<ProjectAsset[]>(`/projects/${pid}/assets`);
  const [sub, setSub] = useState<SubtitleSettings | null>(null);
  const [logo, setLogo] = useState<LogoSettings | null>(null);
  const [useDefault, setUseDefault] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [alpha, setAlpha] = useState<boolean | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const a = useAction();
  useEffect(() => {
    if (!view.data || dirty) return;
    setSub(view.data.subtitle);
    setLogo(view.data.logo);
    setUseDefault(view.data.isDefault);
  }, [view.data, dirty]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sub === null]);
  const cur = assets.data?.find((x) => x.id === logo?.assetId);
  useEffect(() => {
    setAlpha(null);
    if (cur) hasAlpha(cur.url, cur.ext === "svg").then(setAlpha);
  }, [cur?.id]);
  if (!view.data || !sub || !logo) return <div className="card mb-4 text-sm text-soft">Đang tải cài đặt phụ đề và logo…</div>;
  const v = view.data;

  const S = (p: Partial<SubtitleSettings>) => (setSub({ ...sub, ...p }), setDirty(true));
  const Lg = (p: Partial<LogoSettings>) => (setLogo({ ...logo, ...p }), setDirty(true));
  const upload = (f: File) =>
    a.run(async () => {
      if (f.size > MAX) throw new Error("Ảnh quá lớn (tối đa 10 MB)");
      if (f.type && !ACCEPT.split(",").includes(f.type)) throw new Error("Chỉ nhận PNG, JPG, WebP hoặc SVG");
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<ProjectAsset>(`/projects/${pid}/assets`, { method: "POST", body: fd });
      await assets.reload();
      Lg({ assetId: r.id });
    }, "Đã tải logo lên – xem khung xem trước rồi bấm Lưu");
  const save = () =>
    a.run(async () => {
      const r = await api<OverlayView>(`/projects/${pid}/overlay`, { method: "PATCH", json: { subtitle: sub, logo: { ...logo, assetId: logo.assetId ?? null }, defaults: useDefault !== v.isDefault ? useDefault : undefined } });
      setDirty(false);
      view.setData(r);
    }, "Đã lưu phụ đề và logo cho cả dự án");
  const rerender = () =>
    a.run(async () => {
      const r = await api<{ jobs: unknown[] }>(`/projects/${pid}/overlay/rerender`, { method: "POST", json: {} });
      await view.reload();
      a.setMsg({ ok: true, text: `Đã xếp hàng dựng lại hình ${r.jobs.length} video (giữ nguyên giọng) – xem ở bước Sản xuất` });
    });

  // xem trước: cùng phép tính với bộ dựng, thu theo tỉ lệ khung
  const k = w / 1920;
  const burn = sub.mode === "burn";
  const L = overlayLayout({ subtitle: sub, logo: cur ? logo : { ...logo, assetId: undefined } }, true);
  const lang = burn ? sub.burnLanguage : "vi";
  const cap = chunkCaption(SAMPLE[lang] ?? SAMPLE.en, sub.size, (1920 * sub.maxWidth) / 100 - sub.size * 1.1, sub.maxLines)[0];
  const small = cur && cur.w < 300;
  const flat = cur && theme?.dark && alpha === false;
  const others = (assets.data ?? []).filter((x) => x.id !== logo.assetId).slice(0, 8);
  const needRedo = v.stale.length > 0 && !dirty;

  return (
    <section className="card mb-4" aria-labelledby="ov-title">
      <link rel="stylesheet" href="/api/fonts.css" precedence="font-preview" />
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="ov-title" className="text-base font-semibold">Phụ đề và logo</h2>
          <p className="text-[13px] text-soft">Phụ đề không còn che hình: chỉnh cỡ, vị trí, nền. Logo tải từ máy, đặt ở góc bạn chọn. Khung xem trước cập nhật ngay.</p>
        </div>
        {dirty ? <Badge tone="amber">Chưa lưu</Badge> : <Badge tone="green">Đã lưu</Badge>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">Phụ đề</legend>
            <Seg label="Chế độ phụ đề" value={sub.mode} onChange={(mode) => S({ mode })} options={MODES} />
            <div>
              <span className="label">Ngôn ngữ phụ đề</span>
              <div className="flex flex-wrap gap-1.5">
                {v.langs.map((l) => {
                  const on = sub.languages.includes(l.code);
                  return (
                    <button key={l.code} type="button" disabled={l.code === "vi"} aria-pressed={on} title={l.code === "vi" ? "Tiếng Việt lấy nguyên lời thoại – luôn có" : `${l.name} – dịch bằng Claude ở bước Duyệt, mục Phụ đề`}
                      onClick={() => S({ languages: on ? sub.languages.filter((x) => x !== l.code) : [...sub.languages, l.code], burnLanguage: on && sub.burnLanguage === l.code ? "vi" : sub.burnLanguage })}
                      className={`rounded-md px-2 py-1 text-[13px] font-medium shadow-[0_0_0_1px_rgb(19_34_43/0.14)] ${on ? "bg-brand-tint text-brand-dark shadow-[0_0_0_1.5px_var(--color-brand)]" : "bg-surface text-soft"} disabled:opacity-100`}>
                      {on ? "✓ " : ""}{l.name}{v.missing[l.code] ? <span className="num text-amber-800"> · thiếu {v.missing[l.code]}</span> : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[12px] text-soft">Xuất kèm phụ đề tạo một tệp .vtt cho mỗi ngôn ngữ. Dịch ở bước Duyệt, mục Phụ đề.</p>
            </div>
            {burn && (
              <label className="block">
                <span className="label">Ngôn ngữ gắn cứng</span>
                <select className="input sm:w-64" value={sub.burnLanguage} onChange={(e) => S({ burnLanguage: e.target.value })}>
                  {v.langs.filter((l) => sub.languages.includes(l.code)).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </label>
            )}
            {sub.mode !== "off" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Slider label="Cỡ chữ (ở 1080p)" value={sub.size} min={24} max={72} unit=" px" onChange={(size) => S({ size })} />
                <Slider label="Cách mép" value={sub.offset} min={0} max={30} step={0.5} unit="%" onChange={(offset) => S({ offset })} />
                <Slider label="Nền hộp chữ" value={sub.background} min={0} max={1} step={0.05} unit="%" onChange={(background) => S({ background })} />
                <Slider label="Rộng tối đa" value={sub.maxWidth} min={40} max={95} unit="%" onChange={(maxWidth) => S({ maxWidth })} />
                <div>
                  <span className="label">Vị trí</span>
                  <Seg label="Vị trí phụ đề" value={sub.position} onChange={(position) => S({ position })} options={[{ id: "bottom", label: "Dưới" }, { id: "top", label: "Trên" }]} />
                </div>
                <div>
                  <span className="label">Số dòng tối đa</span>
                  <Seg label="Số dòng tối đa" value={sub.maxLines} onChange={(maxLines) => S({ maxLines })} options={[{ id: 1, label: "1 dòng" }, { id: 2, label: "2 dòng" }]} />
                </div>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">Logo</legend>
            <div
              onDragOver={(e) => (e.preventDefault(), setDrag(true))}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
              className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 transition-colors duration-150 ${drag ? "border-brand bg-brand-tint" : "border-line bg-paper"}`}
            >
              {cur ? (
                <span className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md" style={{ background: theme?.colors.bg ?? "#fff", outline: "1px solid rgb(19 34 43 / 0.1)", outlineOffset: -1 }}>
                  <img src={cur.url} alt="Logo đang dùng" className="max-h-14 max-w-24 object-contain" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" disabled={a.busy} onClick={() => file.current?.click()}>{a.busy ? "Đang tải…" : cur ? "Đổi logo" : "Tải logo từ máy"}</button>
                  {cur && <button type="button" className="btn" onClick={() => Lg({ assetId: undefined })}>Xoá logo</button>}
                </div>
                <p className="mt-1 text-[12px] text-soft">{cur ? `${cur.name} · ${cur.w}×${cur.h}` : "Hoặc kéo thả ảnh vào đây."} PNG (giữ nền trong suốt), SVG, JPG, WebP · tối đa 10 MB.</p>
              </div>
              <input ref={file} type="file" accept={ACCEPT} className="sr-only" aria-label="Chọn tệp logo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </div>
            {small && <div className="assume">Logo nhỏ ({cur!.w} px ngang) – có thể bị mờ khi phóng; nên dùng ảnh rộng từ 300 px hoặc SVG.</div>}
            {flat && <div className="assume">Logo có nền đặc (không trong suốt) trên phong cách tối – sẽ thành một ô màu; nên dùng PNG nền trong suốt hoặc SVG.</div>}
            {others.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[13px] text-soft">Hoặc chọn ảnh đã tải lên dự án ({others.length})</summary>
                <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {others.map((x) => (
                    <li key={x.id} className="shrink-0">
                      <button type="button" title={`${x.name} · ${x.w}×${x.h}`} onClick={() => Lg({ assetId: x.id })} className="block h-14 w-24 overflow-hidden rounded-md bg-white shadow-[0_0_0_1px_rgb(19_34_43/0.1)]">
                        <img src={x.url} alt={x.name} loading="lazy" className="h-full w-full object-contain" />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {cur && (
              <>
                <div>
                  <span className="label" id="ov-pos">Vị trí logo</span>
                  <div role="radiogroup" aria-labelledby="ov-pos" className="grid w-full max-w-[240px] grid-cols-3 gap-1.5 rounded-lg bg-paper p-1.5 shadow-[inset_0_0_0_1px_rgb(19_34_43/0.08)]" style={{ aspectRatio: "16 / 9" }}>
                    {(["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const).filter((p) => LOGO_POSITIONS.includes(p)).map((p) => {
                      const on = logo.position === p;
                      return (
                        <button key={p} type="button" role="radio" aria-checked={on} aria-label={POS_LABEL[p]} title={POS_LABEL[p]} onClick={() => Lg({ position: p })}
                          className={`flex rounded-md p-1.5 transition-colors duration-150 ${p.startsWith("top") ? "items-start" : "items-end"} ${p.endsWith("left") ? "justify-start" : p.endsWith("right") ? "justify-end" : "justify-center"} ${on ? "bg-brand-tint shadow-[0_0_0_1.5px_var(--color-brand)]" : "bg-surface shadow-[0_0_0_1px_rgb(19_34_43/0.1)]"}`}>
                          <span className={`block h-2 w-5 rounded-sm ${on ? "bg-brand" : "bg-[#c9d1ce]"}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Slider label="Cỡ (rộng video)" value={logo.size} min={3} max={30} step={0.5} unit="%" onChange={(size) => Lg({ size })} />
                  <Slider label="Cách mép" value={logo.margin} min={0} max={200} unit=" px" onChange={(margin) => Lg({ margin })} />
                  <Slider label="Độ đậm" value={logo.opacity} min={0.2} max={1} step={0.05} unit="%" onChange={(opacity) => Lg({ opacity })} />
                </div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={logo.scenes === "skip-first"} onChange={(e) => Lg({ scenes: e.target.checked ? "skip-first" : "all" })} /> Không hiện ở cảnh đầu (cảnh tiêu đề)</label>
              </>
            )}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={useDefault} onChange={(e) => (setUseDefault(e.target.checked), setDirty(true))} /> <span>Dùng cho mọi dự án <span className="block text-[12px] text-soft">Dự án tạo mới sẽ có sẵn logo và cài đặt phụ đề này.</span></span></label>
          </fieldset>
        </div>

        <div className="order-first min-w-0 lg:order-none lg:sticky lg:top-4 lg:self-start">
          <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-lg" style={{ background: theme?.colors.bg ?? "#e9eeec", outline: "1px solid rgb(19 34 43 / 0.1)", outlineOffset: -1 }} aria-label="Xem trước phụ đề và logo">
            {frame && <img src={fileUrl(frame)} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            {L.logo && cur && (
              <img src={cur.url} alt="" className="absolute object-contain" style={{ left: L.logo.x * k, top: L.logo.y * k, width: L.logo.w * k, height: L.logo.h * k, opacity: logo.opacity, transition: "left 150ms, top 150ms, width 150ms, height 150ms" }} />
            )}
            {sub.mode !== "off" && cap && (
              <div className="absolute inset-x-0 flex justify-center" style={{ [L.caption.edge]: L.caption.offset * k, alignItems: L.caption.edge === "bottom" ? "flex-end" : "flex-start" }}>
                <span
                  className="inline-block text-center text-white"
                  style={{
                    fontFamily: `'${bodyFont ?? theme?.fonts.body ?? "Be Vietnam Pro"}', sans-serif`, fontWeight: 700, fontSize: cap.size * k, lineHeight: 1.3, padding: ".2em .55em", borderRadius: sub.size * 0.3 * k,
                    background: `rgba(0,0,0,${sub.background})`, textShadow: sub.background < 0.35 ? "0 2px 8px rgba(0,0,0,.85)" : undefined,
                    outline: burn ? undefined : "1.5px dashed rgba(255,255,255,.7)", outlineOffset: 3,
                  }}
                >
                  {cap.lines.map((l, i) => <span key={i} className="block whitespace-nowrap">{l}</span>)}
                </span>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-soft">
            {frame ? "Khung thật của dự án" : "Nền của phong cách"} · {sub.mode === "burn" ? "phụ đề gắn cứng" : sub.mode === "player" ? "khung nét đứt = phụ đề trong trình phát (người xem bật/tắt)" : "phụ đề tắt"}.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button className="btn btn-primary" disabled={a.busy || !dirty} onClick={save}>Lưu cho cả dự án</button>
        {needRedo && <button className="btn" disabled={a.busy} onClick={rerender}>Dựng lại hình {v.stale.length} video</button>}
        <span className="text-[12px] text-soft">
          {needRedo ? `${v.stale.length} video đã render chưa có phụ đề gắn cứng/logo mới. "Dựng lại hình" giữ nguyên giọng.` : "Đổi phụ đề gắn cứng hoặc logo cần \"Dựng lại hình\" cho video đã render (giữ nguyên giọng). Phụ đề trong trình phát áp dụng ngay."}
        </span>
      </div>
      <Msg msg={a.msg} />
    </section>
  );
}
