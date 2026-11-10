"use client";
// Mẫu video từ catalog awesome-opus5-5-videos (yihui-dev): danh sách tải từ GitHub qua máy chủ (đệm 24 giờ), poster hiển thị từ skillry.dev.
// Chọn mẫu → máy chủ tải poster vào ảnh tham chiếu của dự án + prompt gốc của tác giả vào đề bài "Tạo phong cách bằng AI".
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { Msg } from "@/components/ui";

export type StyleSample = { slug: string; author: string; authorUrl: string; postUrl: string; category: string; tags: string[]; prompt: string; poster: string | null; remake: string | null };
type Catalog = { items: StyleSample[]; at: string; stale: boolean; source: { name: string; repo: string; license: string } };
export const AWESOME_PREFIX = "awesome:";
const CATS = [["", "Tất cả"], ["explainer", "Giải thích"], ["motion", "Motion graphics"]] as const;
const PAGE = 48;

export function AwesomePicker({ pid, value, onPick }: { pid: string; value: string | null; onPick: (preset: string | null, posterAsset: string | null) => void }) {
  const [cat, setCat] = useState<string>("explainer");
  const [q, setQ] = useState("");
  const [n, setN] = useState(PAGE);
  const [data, setData] = useState<Catalog | null>(null);
  const load = useAction();
  const pick = useAction();
  const fetchList = (refresh = false) => load.run(async () => setData(await api<Catalog>(`/style-samples${refresh ? "?refresh=1" : ""}`)));
  useEffect(() => {
    if (!data) fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.items ?? []).filter((x) => (!cat || x.category === cat) && (!t || x.prompt.toLowerCase().includes(t) || x.author.toLowerCase().includes(t) || x.tags.some((g) => g.includes(t))));
  }, [data, cat, q]);
  useEffect(() => setN(PAGE), [cat, q]);
  const choose = (x: StyleSample) =>
    pick.run(async () => {
      const id = `${AWESOME_PREFIX}${x.slug}`;
      if (id === value) return onPick(null, null);
      const r = await api<{ asset: { id: string } | null }>(`/projects/${pid}/style-samples/poster`, { method: "POST", json: { preset: id } });
      onPick(id, r.asset?.id ?? null);
    });

  return (
    <div className="mt-2">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="flex gap-1" role="group" aria-label="Loại mẫu">
          {CATS.map(([k, label]) => <button key={k} type="button" className={`btn min-h-8 px-2 text-[12px] ${cat === k ? "btn-primary" : ""}`} aria-pressed={cat === k} onClick={() => setCat(k)}>{label}</button>)}
        </div>
        <label className="text-[12px] text-soft">
          <span className="sr-only">Tìm mẫu</span>
          <input className="input min-h-8 w-48 py-1 text-[13px]" placeholder="Tìm: whiteboard, chart, tác giả…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="min-h-8 px-1 text-[12px] text-soft underline" disabled={load.busy} onClick={() => fetchList(true)}>Tải lại danh sách</button>
      </div>
      <Msg msg={load.msg ?? pick.msg} />
      {!data ? <p className="text-[13px] text-soft">{load.busy ? "Đang tải danh sách mẫu từ GitHub…" : "Chưa tải được danh sách."}</p> : (
        <>
          {data.stale && <p className="mb-1 text-[12px] text-amber-900">Không kết nối được GitHub – đang dùng danh sách đã lưu lúc {new Date(data.at).toLocaleString("vi-VN")}.</p>}
          <ul className="grid max-h-[440px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="Mẫu video awesome-opus5-5-videos">
            {list.slice(0, n).map((x) => {
              const sel = value === `${AWESOME_PREFIX}${x.slug}`;
              return (
                <li key={x.slug}>
                  <button type="button" aria-pressed={sel} disabled={pick.busy} onClick={() => choose(x)} title={x.prompt.slice(0, 400)}
                    className={`w-full overflow-hidden rounded-md bg-white text-left transition-shadow duration-150 ${sel ? "shadow-[0_0_0_2px_var(--color-brand)]" : "shadow-[0_0_0_1px_rgb(19_34_43/0.1)] hover:shadow-[0_0_0_1px_rgb(19_34_43/0.3)]"}`}>
                    {x.poster ? <img src={x.poster} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full bg-ink/5 object-cover" /> : <div className="aspect-video w-full bg-ink/5" />}
                    <span className="block px-2 py-1">
                      <span className="block truncate text-[12px] font-medium">@{x.author}</span>
                      <span className="block truncate text-[11px] text-soft">{x.category === "explainer" ? "Giải thích" : "Motion"} · {x.prompt.slice(0, 60)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-soft">
            <span className="num">{Math.min(n, list.length)}/{list.length} mẫu</span>
            {n < list.length && <button type="button" className="min-h-8 px-1 underline" onClick={() => setN(n + PAGE)}>Xem thêm</button>}
          </p>
        </>
      )}
      <p className="mt-1 text-[11px] text-soft">
        Danh sách: <a className="underline" href="https://github.com/yihui-dev/awesome-opus5-5-videos" target="_blank" rel="noreferrer">awesome-opus5-5-videos</a> (yihui-dev, MIT). Mỗi prompt và video thuộc về tác giả của nó, chỉ dùng làm tư liệu tham khảo;
        ảnh poster tải từ skillry.dev. Chọn một mẫu: poster thành ảnh tham chiếu, prompt gốc vào đề bài – Claude rút ra màu, chất liệu, nhịp cho video bài giảng (không chép video).
      </p>
    </div>
  );
}
