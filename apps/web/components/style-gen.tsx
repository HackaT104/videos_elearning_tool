"use client";
// "Tạo phong cách bằng AI": mô tả + ảnh/video tham chiếu → Claude (API hoặc Claude Code) dựng phong cách tuỳ chỉnh, máy chủ kiểm
// (màu hex, tương phản 4,5:1, phông đã cài) rồi dựng ảnh xem trước trên cảnh đại diện. Kết quả: dùng / chỉnh tiếp / lưu thư viện / chỉnh tay.
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { Badge, Msg, Progress } from "@/components/ui";
import { ClaudeCodeStatus, useClaudeCode } from "@/components/claude-code";

type Adjust = { field: string; from: string | number; to: string | number; reason: string };
export type CustomRec = {
  id: string; theme: { name: string; description: string; dark: boolean; colors: Record<string, string>; fonts: { display: { family: string; weight: number }; body: { family: string } } };
  draft: { colors: Record<string, string>; fontPair: string }; rationale: string; closest: string; adjustments: Adjust[]; prompt: string; by: "ai" | "claude-code" | "user"; base: string | null; updatedAt: string;
};
type StyleVideo = { id: string; name: string; duration: number; frames: { file: string; t: number }[] };
type Job = { id: number; status: string; progress: number; message: string | null; error: string | null };
export type CustomThemes = { project: CustomRec[]; library: CustomRec[]; libraryIds: string[]; brief: { prompt: string; images: string[]; video: string | null; base: string | null; last?: string } | null; videos: StyleVideo[]; job: Job | null };

const EXAMPLES = [
  "Tối giản sang trọng: nền than chì, chữ trắng ngà, một màu vàng đồng để nhấn",
  "Thân thiện cho người mới: pastel nhẹ, khối bo tròn lớn, chữ tròn",
  "Công nghiệp an toàn: xanh thép, lưới mảnh, cam cảnh báo chỉ cho rủi ro",
  "Giống ảnh tham chiếu, giữ màu xanh lá thương hiệu, chuyển động chậm, trang trọng",
];
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_IMG = 6;
const SWATCH = [["bg", "Nền"], ["card", "Thẻ"], ["ink", "Chữ"], ["inkSoft", "Chữ phụ"], ["accent", "Nhấn"], ["alt", "Phụ"], ["money", "Giá trị"], ["warn", "Rủi ro"], ["highlight", "Tô"]] as const;
const TWEAK = [["bg", "Nền"], ["card", "Thẻ"], ["ink", "Chữ"], ["accent", "Nhấn"], ["alt", "Phụ"], ["warn", "Rủi ro"]] as const;
const ROLE_VI: Record<string, string> = Object.fromEntries([...SWATCH, ["bg2", "Nền phụ"], ["grid", "Lưới"]]);
const fieldVi = (f: string) => (f.startsWith("colors.") ? `Màu ${(ROLE_VI[f.slice(7)] ?? f.slice(7)).toLowerCase()}` : f === "groundSpec.gradient" ? "Dải màu nền" : f);

export function StyleGen({ pid, ai, data, reload, shots, previewBusy, fonts, themeName, onApply, applied }: {
  pid: string; ai: boolean; data: CustomThemes | null; reload: () => void; shots: { style: string; file: string }[]; previewBusy: boolean;
  fonts: { id: string; name: string }[]; themeName: (id: string) => string; onApply: (id: string) => void; applied: string | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [video, setVideo] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const a = useAction();
  const up = useAction();
  const cc = useClaudeCode(() => reload());
  // khôi phục đề bài lần trước
  useEffect(() => {
    if (loaded || !data) return;
    setLoaded(true);
    if (data.brief) {
      setPrompt(data.brief.prompt);
      setImages(data.brief.images);
      setVideo(data.brief.video);
    }
  }, [data, loaded]);
  const job = data?.job;
  const running = !!job && ["queued", "running"].includes(job.status);
  const rec = data?.project.find((r) => r.id === data.brief?.last) ?? null;
  const vid = data?.videos.find((v) => v.id === video) ?? null;

  const addFiles = (files: File[]) =>
    up.run(async () => {
      const next = [...images];
      for (const f of files) {
        if (VIDEO_TYPES.includes(f.type) || /\.(mp4|mov|webm)$/i.test(f.name)) {
          if (f.size > 200 * 1024 * 1024) throw new Error("Video quá lớn (tối đa 200 MB)");
          const v = await api<StyleVideo>(`/projects/${pid}/style-refs/video`, { method: "POST", body: f, headers: { "x-file-name": encodeURIComponent(f.name), "content-type": f.type || "application/octet-stream" } });
          setVideo(v.id);
        } else if (IMG_TYPES.includes(f.type)) {
          if (next.length >= MAX_IMG) throw new Error(`Tối đa ${MAX_IMG} ảnh tham chiếu – bỏ bớt ảnh rồi thêm`);
          if (f.size > 10 * 1024 * 1024) throw new Error(`Ảnh "${f.name}" quá lớn (tối đa 10 MB)`);
          const fd = new FormData();
          fd.append("file", f);
          const r = await api<{ id: string }>(`/projects/${pid}/assets`, { method: "POST", body: fd });
          if (!next.includes(r.id)) next.push(r.id);
          setImages([...next]);
        } else throw new Error(`"${f.name}": chỉ nhận ảnh JPG/PNG/WebP hoặc video MP4/MOV/WebM`);
      }
      reload();
    });
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    addFiles([...e.dataTransfer.files]);
  };
  const removeVideo = () =>
    up.run(async () => {
      if (video) await api(`/projects/${pid}/style-refs/video/${video}`, { method: "DELETE" });
      setVideo(null);
      reload();
    });

  const generate = () =>
    a.run(async () => {
      const brief = { prompt, images, video, base, mode: ai ? "api" : "claude-code" };
      await api(`/projects/${pid}/style-gen`, { method: "POST", json: brief });
      reload();
      if (!ai) await cc.ask({ pid, kind: "style-gen", note: prompt.trim() || "(theo ảnh tham chiếu)", what: "xem ảnh tham chiếu và tạo một phong cách video mới" });
    });
  const iterate = (id: string) => {
    setBase(id);
    setPrompt("");
    area.current?.focus();
    area.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const toLibrary = (id: string) => a.run(async () => { await api(`/projects/${pid}/themes/${id}/library`, { method: "POST" }); reload(); }, "Đã lưu vào thư viện – mọi dự án đều chọn được phong cách này");

  return (
    <section className="card mb-4" aria-labelledby="sg-title">
      <h2 id="sg-title" className="text-base font-semibold">Tạo phong cách bằng AI</h2>
      <p className="mt-0.5 text-[13px] text-soft">Mô tả phong cách bạn muốn, thêm ảnh hoặc một đoạn video mẫu. Claude xem tư liệu, dựng bảng màu, phông và nhịp chuyển động riêng, tự chỉnh màu chữ cho đủ tương phản rồi dựng ảnh xem trước trên chính cảnh của bạn.</p>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          {base && (
            <p className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
              <Badge tone="blue">Chỉnh tiếp từ: {themeName(base)}</Badge>
              <button type="button" className="min-h-8 px-1 text-[12px] text-soft underline" onClick={() => setBase(null)}>Tạo mới thay vì chỉnh tiếp</button>
            </p>
          )}
          <label className="label" htmlFor="sg-prompt">{base ? "Muốn đổi gì?" : "Mô tả phong cách"}</label>
          <textarea id="sg-prompt" ref={area} className="input min-h-28 w-full" maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={base ? "Ví dụ: nền tối hơn, màu nhấn ấm hơn, chữ tiêu đề có chân" : "Ví dụ: ấm áp như giấy kraft, chữ viết tay thân thiện, nhấn cam đất"} />
          <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Gợi ý mô tả">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="min-h-8 rounded-md bg-[#eef1f0] px-2 py-1 text-left text-[12px] text-soft hover:text-ink" onClick={() => setPrompt(x)}>{x}</button>
            ))}
          </div>
        </div>

        <div>
          <span className="label" id="sg-refs">Tư liệu tham chiếu</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={`rounded-lg border border-dashed p-3 transition-colors duration-150 ${over ? "border-brand bg-brand-tint" : "border-line bg-paper"}`}
          >
            <p className="text-[13px] text-soft">Kéo thả vào đây, hoặc
              <button type="button" className="mx-1 font-medium text-brand underline" disabled={up.busy} onClick={() => imgInput.current?.click()}>chọn ảnh</button>(JPG, PNG, WebP, tối đa {MAX_IMG})
              <button type="button" className="mx-1 font-medium text-brand underline" disabled={up.busy} onClick={() => vidInput.current?.click()}>chọn video</button>(MP4, MOV, WebM ≤ 200 MB).
            </p>
            <input ref={imgInput} type="file" multiple accept={IMG_TYPES.join(",")} className="sr-only" aria-label="Chọn ảnh tham chiếu" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; addFiles(f); }} />
            <input ref={vidInput} type="file" accept={VIDEO_TYPES.join(",")} className="sr-only" aria-label="Chọn video tham chiếu" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; addFiles(f); }} />
            {up.busy && <p className="mt-2 text-[13px] text-soft" aria-live="polite">Đang tải lên… (video: tải xong còn trích khung hình)</p>}
            {(images.length > 0 || vid) && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-labelledby="sg-refs">
                {images.map((id) => (
                  <li key={id} className="relative">
                    <img src={`/api/projects/${pid}/assets/${id}`} alt="Ảnh tham chiếu" className="h-16 w-24 rounded-md bg-white object-cover shadow-[0_0_0_1px_rgb(19_34_43/0.1)]" />
                    <button type="button" aria-label="Bỏ ảnh này" onClick={() => setImages(images.filter((x) => x !== id))} className="absolute right-0.5 top-0.5 h-6 w-6 rounded-md bg-white/90 text-[12px] text-danger shadow-[0_0_0_1px_rgb(19_34_43/0.1)]">✕</button>
                  </li>
                ))}
              </ul>
            )}
            {vid && (
              <div className="mt-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 truncate font-medium">{vid.name}</span>
                  <span className="num shrink-0 text-soft">{Math.round(vid.duration)} giây · {vid.frames.length} khung</span>
                  <button type="button" className="ml-auto min-h-8 shrink-0 px-1 text-[12px] text-danger underline" disabled={up.busy} onClick={removeVideo}>Bỏ video</button>
                </div>
                <ul className="mt-1 flex gap-1 overflow-x-auto pb-1" aria-label="Khung hình trích từ video">
                  {vid.frames.map((f) => <li key={f.file} className="shrink-0"><img src={fileUrl(f.file)} alt={`Khung giây ${f.t}`} loading="lazy" className="h-12 w-[86px] rounded object-cover" /></li>)}
                </ul>
              </div>
            )}
          </div>
          <Msg msg={up.msg} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={a.busy || up.busy || running || (!prompt.trim() && !images.length && !video)} onClick={generate}>
          {running ? "Claude đang tạo…" : base ? "Tạo bản chỉnh" : "Tạo phong cách"}
        </button>
        <span className="text-[12px] text-soft">{ai ? "Dùng Claude API (khoảng 1 phút, gồm dựng ảnh xem trước)." : "Claude Code làm trên máy này bằng gói Claude đã đăng ký."}</span>
      </div>
      {running && (
        <div className="mt-3" aria-live="polite">
          <Progress value={job!.progress} />
          <p className="mt-1 text-[13px] text-soft">{job!.message ?? "Đang chờ lượt"}</p>
        </div>
      )}
      {job?.status === "failed" && <p className="msg mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">Tạo phong cách lỗi: {job.error}</p>}
      <Msg msg={a.msg} />
      {cc.dialog}
      {!ai && <ClaudeCodeStatus pid={pid} kinds={["style-gen"]} limit={1} />}

      {rec && (
        <Result key={rec.id} pid={pid} rec={rec} shot={shots.find((s) => s.style === rec.id)?.file ?? null} previewBusy={previewBusy} fonts={fonts} themeName={themeName} inLibrary={!!data?.libraryIds.includes(rec.id)}
          applied={applied === rec.id} busy={a.busy} onApply={() => onApply(rec.id)} onIterate={() => iterate(rec.id)} onLibrary={() => toLibrary(rec.id)} reload={reload} />
      )}
    </section>
  );
}

function Result({ pid, rec, shot, previewBusy, fonts, themeName, inLibrary, applied, busy, onApply, onIterate, onLibrary, reload }: {
  pid: string; rec: CustomRec; shot: string | null; previewBusy: boolean; fonts: { id: string; name: string }[]; themeName: (id: string) => string; inLibrary: boolean;
  applied: boolean; busy: boolean; onApply: () => void; onIterate: () => void; onLibrary: () => void; reload: () => void;
}) {
  const t = rec.theme;
  const [colors, setColors] = useState<Record<string, string>>(rec.draft.colors);
  const [font, setFont] = useState(rec.draft.fontPair);
  const a = useAction();
  const dirty = font !== rec.draft.fontPair || TWEAK.some(([k]) => colors[k]?.toUpperCase() !== rec.draft.colors[k]);
  const save = () => a.run(async () => {
    await api(`/projects/${pid}/themes/${rec.id}`, { method: "PATCH", json: { colors: Object.fromEntries(TWEAK.map(([k]) => [k, colors[k]])), fontPair: font } });
    reload();
  }, "Đã lưu – đang dựng lại ảnh xem trước");
  const contrast = rec.adjustments.filter((x) => x.field.startsWith("colors.") || x.field === "groundSpec.gradient");
  return (
    <div className="mt-4 border-t border-line pt-4" aria-live="polite">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="aspect-video overflow-hidden rounded-lg" style={{ background: t.colors.bg }}>
          {shot ? (
            <img src={`${fileUrl(shot)}&v=${encodeURIComponent(rec.updatedAt)}-${previewBusy ? 1 : 0}`} alt={`Ảnh xem trước phong cách ${t.name}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-[13px]" style={{ color: t.colors.inkSoft }}>{previewBusy ? "Đang dựng ảnh xem trước trên cảnh của bạn…" : "Chưa có ảnh xem trước – bấm Dựng lại các mẫu"}</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-semibold">{t.name}</h3>
            <Badge tone="blue">Tuỳ chỉnh</Badge>
            {applied && <Badge tone="green">đang dùng</Badge>}
            <Badge>{rec.by === "user" ? "đã chỉnh tay" : rec.by === "claude-code" ? "Claude Code" : "Claude API"}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-soft">{t.description}</p>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Bảng màu">
            {SWATCH.map(([k, label]) => (
              <li key={k} className="flex items-center gap-1.5 text-[12px]">
                <span className="h-5 w-5 rounded-full" style={{ background: t.colors[k], boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.12)" }} aria-hidden />
                <span className="text-soft">{label}</span>
                <span className="num sr-only">{t.colors[k]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px]"><span className="text-soft">Phông:</span> <span style={{ fontFamily: `'${t.fonts.display.family}'`, fontWeight: t.fonts.display.weight }}>{t.fonts.display.family}</span>{t.fonts.body.family !== t.fonts.display.family && <> + {t.fonts.body.family}</>} <span className="text-soft">· gần với «{themeName(rec.closest)}»</span></p>
          {rec.rationale && <p className="mt-2 text-[13px] leading-relaxed">{rec.rationale}</p>}
          {contrast.length > 0 && (
            <div className="assume mt-2">
              <div className="font-medium">Đã tự chỉnh để chữ đọc rõ trên video:</div>
              <ul className="mt-0.5 space-y-0.5">
                {contrast.map((x) => (
                  <li key={x.field} className="flex flex-wrap items-center gap-1.5">
                    {fieldVi(x.field)}
                    {String(x.from).startsWith("#") && <span className="inline-block h-3 w-3 rounded-sm" style={{ background: String(x.from) }} aria-hidden />}
                    <span className="num">{String(x.from)}</span> →
                    {String(x.to).startsWith("#") && <span className="inline-block h-3 w-3 rounded-sm" style={{ background: String(x.to) }} aria-hidden />}
                    <span className="num">{String(x.to)}</span>
                    <span className="text-amber-800/80">({x.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || applied} onClick={onApply}>{applied ? "Đang dùng cho dự án" : "Dùng phong cách này"}</button>
            <button type="button" className="btn" onClick={onIterate}>Chỉnh tiếp bằng lời</button>
            <button type="button" className="btn" disabled={busy || inLibrary} onClick={onLibrary}>{inLibrary ? "Đã có trong thư viện" : "Lưu vào thư viện"}</button>
          </div>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-medium text-soft">Chỉnh tay màu chính và phông</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TWEAK.map(([k, label]) => (
            <label key={k} className="text-[13px]">
              <span className="label">{label}</span>
              <span className="flex items-center gap-1.5">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(colors[k] ?? "") ? colors[k] : "#000000"} onChange={(e) => setColors({ ...colors, [k]: e.target.value.toUpperCase() })} className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-line bg-white p-0.5" aria-label={`Màu ${label.toLowerCase()}`} />
                <input className="input num w-full min-w-0 px-2" value={colors[k] ?? ""} maxLength={7} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} aria-label={`Mã màu ${label.toLowerCase()}`} />
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[13px]"><span className="label">Cặp phông</span>
            <select className="input w-64 max-w-full" value={font} onChange={(e) => setFont(e.target.value)}>
              {!fonts.some((f) => f.id === font) && <option value={font}>Phông của «{themeName(font)}»</option>}
              {fonts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={!dirty || a.busy} onClick={save}>Lưu chỉnh sửa</button>
          <span className="text-[12px] text-soft">Màu chữ chưa đủ tương phản sẽ được tự chỉnh và báo lại.</span>
        </div>
        <Msg msg={a.msg} />
      </details>
    </div>
  );
}
