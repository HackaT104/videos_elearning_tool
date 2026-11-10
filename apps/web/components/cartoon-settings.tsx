"use client";
// Hoạt hình vẽ tay (p5.brush, kit Claude Animation Base – MIT): bật cho AI chọn cảnh hoạt hình, chất lượng, nhân vật Clawd (mặc định tắt),
// và "Vẽ thử nhân vật" để xem nhân vật + đo tốc độ vẽ trên chính máy này trước khi dùng.
import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";

type Cartoon = { enabled: boolean; clawd?: boolean; quality?: "nhe" | "day-du" };
type Sample = { errors: string[]; frames: string[]; msPerFrame: number; gpu: string; software: boolean; perMinute: number | null };

const minutes = (s: number) => (s < 90 ? `${s} giây` : `${Math.round(s / 60)} phút`);

export function CartoonSettings({ pid, value, onChange }: { pid: string; value?: Cartoon; onChange: (v: Cartoon) => Promise<void> }) {
  // hiện ngay lựa chọn mới (lạc quan), lưu lỗi thì trả về giá trị của máy chủ
  const [local, setLocal] = useState<Cartoon | null>(null);
  useEffect(() => setLocal(null), [value]);
  const v: Cartoon = local ?? value ?? { enabled: false };
  const a = useAction();
  const t = useAction();
  const [sample, setSample] = useState<Sample | null>(null);
  const set = (patch: Partial<Cartoon>, ok: string) => {
    const next = { ...v, ...patch };
    setLocal(next);
    return a.run(() => onChange(next).catch((e) => (setLocal(null), Promise.reject(e))), ok);
  };
  const test = () => t.run(async () => setSample(await api<Sample>(`/projects/${pid}/cartoon/sample`, { method: "POST" })));

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Hoạt hình vẽ tay</h2>
        {v.enabled ? <Badge tone="green">Đang bật</Badge> : <Badge>Tắt</Badge>}
      </div>
      <p className="mb-3 mt-1 text-[13px] text-soft">
        Cảnh có nhân vật diễn (ngạc nhiên, phát hiện rủi ro, làm sai rồi sửa…), nét cọ và màu như vẽ tay từng khung. Nhân vật mặc định là <b>Kỹ sư</b> của khoá học.
        Chữ trên màn hình vẫn lấy theo kịch bản, phủ lên trên. Cảnh hoạt hình render chậm hơn nhiều, nên AI chỉ dùng 1–3 cảnh mỗi video.
      </p>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={v.enabled} disabled={a.busy} onChange={(e) => set({ enabled: e.target.checked }, e.target.checked ? "Đã bật – áp dụng khi thiết kế cảnh (video đã thiết kế: bấm Thiết kế lại (AI))" : "Đã tắt cảnh hoạt hình")} />
        Cho AI dùng cảnh hoạt hình khi thiết kế cảnh
      </label>
      <fieldset className="mt-2" disabled={a.busy}>
        <legend className="text-[13px] font-medium">Chất lượng</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {([["nhe", "Nhẹ – màu phẳng, nhanh (khuyên dùng)"], ["day-du", "Đầy đủ – màu nước, chậm (nên có GPU rời)"]] as const).map(([q, label]) => {
            const sel = (v.quality ?? "nhe") === q;
            return <button key={q} type="button" className={`btn ${sel ? "btn-primary" : ""}`} aria-pressed={sel} onClick={() => !sel && set({ quality: q }, "Đã đổi chất lượng – cảnh hoạt hình sẽ vẽ lại khi dựng")}>{label}</button>;
          })}
        </div>
      </fieldset>
      <label className="mt-3 flex min-h-10 items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!v.clawd} disabled={a.busy} onChange={(e) => set({ clawd: e.target.checked }, e.target.checked ? "Đã cho dùng Clawd" : "Đã tắt Clawd")} />
        <span>Cho dùng nhân vật Clawd
          <span className="block text-[12px] text-soft">Clawd là linh vật của Claude Code (Anthropic). Giấy phép của kit chỉ cho dùng mã, không cho quyền dùng hình nhân vật/thương hiệu. Chỉ bật cho video nội bộ, tự chịu rủi ro thương hiệu.</span>
        </span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={t.busy} onClick={test}>{t.busy ? "Đang vẽ thử (khoảng 30 giây)…" : "Vẽ thử nhân vật"}</button>
        {sample && !sample.errors.length && (
          <span className="num text-[13px] text-soft">
            {(sample.msPerFrame / 1000).toFixed(1)} giây/khung · 1 phút hoạt hình ≈ {sample.perMinute ? minutes(sample.perMinute) : "?"}
          </span>
        )}
      </div>
      {sample?.software && <p className="assume mt-2">Máy này đang vẽ bằng CPU (không dùng được GPU) nên rất chậm. Nên dùng chất lượng Nhẹ, hoặc dựng trên máy có GPU.</p>}
      {!!sample?.errors.length && <p className="mt-2 text-[13px] text-danger">{sample.errors.join(" · ")}</p>}
      {!!sample?.frames.length && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-3" aria-label="Khung vẽ thử">
          {sample.frames.map((f, i) => <li key={f}><img src={`${fileUrl(f)}&v=${Date.now()}`} alt={`Khung vẽ thử ${i + 1}`} className="aspect-video w-full rounded-md object-cover shadow-[0_0_0_1px_rgb(19_34_43/0.1)]" /></li>)}
        </ul>
      )}
      {sample?.gpu && <p className="mt-1 text-[11px] text-soft">Bộ vẽ: {sample.gpu}</p>}
      <Msg msg={a.msg ?? t.msg} />
      <p className="mt-2 text-[11px] text-soft">Bộ vẽ hoạt hình dựa trên Claude Animation Base (John Heibel, MIT), p5.js (LGPL-2.1), p5.brush (MIT).</p>
    </div>
  );
}
