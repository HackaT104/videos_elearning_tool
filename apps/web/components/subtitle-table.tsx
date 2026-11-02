"use client";
// Mục "Phụ đề" ở bước Duyệt: bảng Tiếng Việt | bản dịch từng ngôn ngữ (sửa tại ô, lưu khi rời ô), số câu còn thiếu,
// "Dịch bằng Claude" (Claude API) hoặc "Gửi cho Claude Code" (gói đã đăng ký, qua hộp xác nhận chung).
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";
import type { CcInput } from "@/components/claude-code";
import type { OverlayView } from "@/components/overlay-settings";

type Sentence = { text: string; subs?: Record<string, string> };
type Scene = { id: string; sentences: Sentence[] };

export function SubtitleTable({ pid, vkey, scenes, ov, aiAvailable, onChange, askClaudeCode }: {
  pid: string; vkey: string; scenes: Scene[]; ov: OverlayView; aiAvailable: boolean; onChange: () => void; askClaudeCode: (r: CcInput & { what?: string }) => void;
}) {
  const a = useAction();
  const [warn, setWarn] = useState<string[]>([]);
  const langs = ov.langs.filter((l) => l.code !== "vi" && ov.subtitle.languages.includes(l.code));
  const extra = ov.langs.filter((l) => l.code !== "vi" && !ov.subtitle.languages.includes(l.code));
  const rows = scenes.flatMap((s) => s.sentences.map((x, i) => ({ id: `${s.id}#${i}`, x }))).filter((r) => r.x.text.trim());
  const missing = (code: string) => rows.filter((r) => !r.x.subs?.[code]?.trim()).length;
  const save = (id: string, lang: string, text: string) =>
    a.run(async () => {
      const r = await api<{ warnings: string[] }>(`/projects/${pid}/videos/${encodeURIComponent(vkey)}/subs`, { method: "PATCH", json: { lang, translations: [{ id, text }] } });
      setWarn(r.warnings);
      onChange();
    });
  const addLang = (code: string) =>
    a.run(async () => {
      await api(`/projects/${pid}/overlay`, { method: "PATCH", json: { subtitle: { languages: [...ov.subtitle.languages, code] } } });
      onChange();
    }, "Đã thêm ngôn ngữ phụ đề cho cả dự án");
  const translate = (code: string, all: boolean) =>
    aiAvailable
      ? a.run(() => api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "translate-subs", keys: [all ? null : vkey], payload: { lang: code } } }), `Claude đang dịch phụ đề ${all ? "mọi video" : vkey} – bản dịch hiện trong bảng khi xong`)
      : askClaudeCode({ pid, kind: "translate-subs", videoKey: all ? undefined : vkey, note: code, what: `dịch phụ đề ${all ? "mọi video" : vkey} sang ${ov.langs.find((l) => l.code === code)?.name}` });

  return (
    <section className="card mb-4" aria-labelledby="subs-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="subs-title" className="text-base font-semibold">Phụ đề</h2>
          <p className="text-[13px] text-soft">Tiếng Việt lấy nguyên lời thoại. Bản dịch do Claude làm (giữ đúng số, thuật ngữ); sửa thẳng trong ô, lưu khi rời ô.</p>
        </div>
        {extra.length > 0 && (
          <select className="input w-auto" value="" aria-label="Thêm ngôn ngữ phụ đề" onChange={(e) => e.target.value && addLang(e.target.value)}>
            <option value="">+ Thêm ngôn ngữ</option>
            {extra.map((l) => <option key={l.code} value={l.code}>{l.name} ({l.native})</option>)}
          </select>
        )}
      </div>
      {langs.length === 0 ? (
        <p className="text-sm text-soft">Chưa có ngôn ngữ dịch – chọn "+ Thêm ngôn ngữ" (ví dụ Tiếng Anh) rồi bấm Dịch bằng Claude.</p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {langs.map((l) => {
            const n = missing(l.code);
            return (
              <div key={l.code} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5">
                <span className="text-sm font-medium">{l.name}</span>
                {n ? <Badge tone="amber">thiếu {n}/{rows.length}</Badge> : <Badge tone="green">đủ</Badge>}
                <button type="button" className={`btn ${n ? "btn-primary" : ""}`} disabled={a.busy} onClick={() => translate(l.code, false)}>{aiAvailable ? "Dịch bằng Claude" : "Gửi cho Claude Code"}</button>
                <button type="button" className="text-[12px] text-soft underline" disabled={a.busy} onClick={() => translate(l.code, true)}>mọi video</button>
              </div>
            );
          })}
        </div>
      )}
      {warn.map((w, i) => <div key={i} className="assume mb-1">{w}</div>)}
      <Msg msg={a.msg} />
      {langs.length > 0 && (
        <div className="-mx-4 mt-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="tbl min-w-[560px] table-fixed">
            <colgroup><col className="w-16" /><col />{langs.map((l) => <col key={l.code} />)}</colgroup>
            <thead>
              <tr>
                <th>Câu</th>
                <th>Tiếng Việt</th>
                {langs.map((l) => <th key={l.code}>{l.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num text-[12px] text-soft">{r.id}</td>
                  <td className="text-[13px] leading-snug">{r.x.text}</td>
                  {langs.map((l) => {
                    const val = r.x.subs?.[l.code] ?? "";
                    return (
                      <td key={l.code}>
                        <textarea
                          key={`${r.id}|${l.code}|${val}`}
                          defaultValue={val}
                          rows={3}
                          aria-label={`${l.name} – câu ${r.id}`}
                          placeholder="Chưa dịch"
                          className={`input resize-y text-[13px] leading-snug ${val ? "" : "bg-amber-50 placeholder:text-amber-800"}`}
                          onBlur={(e) => e.target.value.trim() !== val && save(r.id, l.code, e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
