"use client";
// Skill dựng cảnh: thư viện dùng chung (nhập từ link GitHub hoặc file .md), chọn cho cả dự án. "Mặc định" = cách dựng sẵn có của ứng dụng.
// Skill chỉ là tài liệu tham khảo cho Claude khi thiết kế cảnh / viết cảnh tùy biến – luật của ứng dụng (không bịa số, chữ theo kịch bản…) luôn thắng.
import { useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";

export type SkillSum = { id: string; name: string; description: string; source: string; license: string | null; chars: number; added: string; builtin?: boolean };
type Skills = { skills: SkillSum[]; suggestions: { name: string; url: string; license: string }[] };

export function useSkills() {
  return useApi<Skills>("/skills");
}

export function SkillPicker({ current, onUse, skills }: { current: string | null; onUse: (id: string | null) => Promise<void>; skills: ReturnType<typeof useSkills> }) {
  const [url, setUrl] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const a = useAction();
  const list = skills.data?.skills ?? [];
  const known = new Set(list.map((s) => s.source));
  const add = (u: string) =>
    a.run(async () => {
      const s = await api<SkillSum>("/skills", { method: "POST", json: { url: u } });
      setUrl("");
      skills.reload();
      return s;
    }, "Đã thêm skill vào thư viện – bấm Dùng để áp cho dự án");
  const upload = (f: File) =>
    a.run(async () => {
      const fd = new FormData();
      fd.append("file", f);
      await api("/skills/upload", { method: "POST", body: fd });
      skills.reload();
    }, "Đã thêm skill từ file");
  const remove = (s: SkillSum) =>
    a.run(async () => {
      if (!window.confirm(`Xoá skill "${s.name}" khỏi thư viện?`)) return;
      await api(`/skills/${s.id}`, { method: "DELETE" });
      skills.reload();
    }, "Đã xoá skill");
  const use = (id: string | null) => a.run(() => onUse(id), id ? "Đã chọn skill cho cả dự án – áp dụng khi thiết kế cảnh (video đã thiết kế: bấm Thiết kế lại (AI))" : "Đã về cách dựng mặc định");

  const Row = ({ id, name, children }: { id: string | null; name: string; children?: ReactNode }) => {
    const sel = current === id;
    return (
      <li className={`style-card flex items-start justify-between gap-3 ${sel ? "is-picked" : ""}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{name}{sel && <Badge tone="green">đang dùng</Badge>}</div>
          {children}
        </div>
        <button type="button" className={`btn shrink-0 ${sel ? "btn-primary" : ""}`} aria-pressed={sel} disabled={a.busy || sel} onClick={() => use(id)}>{sel ? "Đang dùng" : "Dùng"}</button>
      </li>
    );
  };

  return (
    <div className="card mb-4">
      <h2 className="text-base font-semibold">Skill dựng cảnh</h2>
      <p className="mb-3 text-[13px] text-soft">
        Skill là bản hướng dẫn cách dựng (nhịp, bố cục, cách dắt mắt, kiểu hoạt hình…) Claude đọc khi thiết kế cảnh. Phong cách (màu, phông) chọn riêng ở dưới.
        Nhập từ link GitHub tới <b>SKILL.md</b>, một file .md, hoặc thư mục skill. Chỉ thêm skill có giấy phép cho phép dùng.
      </p>
      <ul className="grid gap-2 lg:grid-cols-2" aria-label="Skill dựng cảnh">
        <Row id={null} name="Mặc định của ứng dụng"><p className="text-[12px] text-soft">Cách dựng sẵn có: template theo hình dạng thông tin, chuyển động khớp từng câu thoại.</p></Row>
        {list.map((s) => (
          <Row key={s.id} id={s.id} name={s.builtin ? `${s.name} · có sẵn` : s.name}>
            {s.description && <p className="line-clamp-2 text-[12px] text-soft">{s.description}</p>}
            <p className="mt-0.5 truncate text-[12px] text-soft">
              {/^https:\/\//.test(s.source) ? <a className="underline" href={s.source} target="_blank" rel="noreferrer">{s.source.replace(/^https:\/\/(github\.com|raw\.githubusercontent\.com)\//, "")}</a> : s.source}
              {" · "}{s.license ?? "chưa rõ giấy phép"}{" · "}<span className="num">{Math.round(s.chars / 1000)}k ký tự</span>
            </p>
            {current !== s.id && !s.builtin && <button type="button" className="mt-1 min-h-8 text-[12px] text-danger underline" disabled={a.busy} onClick={() => remove(s)}>Xoá</button>}
          </Row>
        ))}
      </ul>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), url.trim() && add(url.trim()))}>
        <label className="label mb-0 min-w-0 flex-1">Thêm skill từ link GitHub
          <input className="input mt-1 w-full" type="url" inputMode="url" placeholder="https://github.com/<chủ>/<repo>/tree/main/skills/<tên-skill>" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={a.busy || !url.trim()}>{a.busy ? "Đang tải…" : "Thêm"}</button>
        <button type="button" className="btn" disabled={a.busy} onClick={() => file.current?.click()}>Tải file .md</button>
        <input ref={file} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </form>
      {!!skills.data?.suggestions.filter((g) => !known.has(g.url)).length && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-soft">Gợi ý:
          {skills.data.suggestions.filter((g) => !known.has(g.url)).map((g) => (
            <button key={g.url} type="button" className="btn min-h-8 px-2 text-[12px]" disabled={a.busy} onClick={() => add(g.url)} title={g.url}>+ {g.name} ({g.license})</button>
          ))}
        </p>
      )}
      <Msg msg={a.msg} />
    </div>
  );
}
