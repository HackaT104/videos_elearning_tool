"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { Badge, Msg, PageHead, SaveBanner } from "@/components/ui";

type Res = { dir: string; files: string[]; skipped: { key: string; reason: string }[]; catalog: string };
const safeName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 120) || "Du_an";

export default function Xuat() {
  const { project, reload } = useProject();
  const pid = project!.id;
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`);
  const [res, setRes] = useState<Res | null>(null);
  const [dest, setDest] = useState(project!.settings.exportDir ?? "");
  const [typing, setTyping] = useState(false);
  const [extras, setExtras] = useState(false);
  const a = useAction();
  const pick = useAction();
  const input = useRef<HTMLInputElement>(null);
  const todo = vids.data?.filter((v) => v.include && !v.existing) ?? [];
  const ready = todo.filter((v) => v.approved);
  const last = project!.settings.lastExport;
  const choose = () =>
    pick.run(async () => {
      try {
        const r = await api<{ path?: string; cancelled?: boolean }>("/pick-folder", { method: "POST", json: { initial: dest || undefined } });
        if (r.path) setDest(r.path);
      } catch (e) {
        // máy chạy ứng dụng không có hộp chọn thư mục → gõ đường dẫn
        setTyping(true);
        setTimeout(() => input.current?.focus(), 0);
        throw e;
      }
    });
  // đến từ lời nhắc "chọn nơi lưu" ở bước khác → mở hộp chọn ngay
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("chon") === "1") choose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const doExport = () =>
    a.run(async () => {
      setRes(await api<Res>(`/projects/${pid}/export`, { method: "POST", json: { dest: dest.trim() || undefined, extras } }));
      reload();
    }, "Đã xuất");
  const open = (path: string) => a.run(() => api("/open-folder", { method: "POST", json: { path, projectId: pid } }));
  const target = dest.trim() ? `${dest.trim().replace(/[\\/]+$/, "")}${dest.includes("\\") ? "\\" : "/"}${safeName(project!.name)}` : project!.out;
  return (
    <div>
      <PageHead step={9} title="Xuất">
        {last && <button className="btn" onClick={() => open(last.dir)}>Mở thư mục đã xuất</button>}
        <button className="btn btn-primary" disabled={a.busy || !ready.length} onClick={doExport}>{a.busy ? "Đang xuất…" : `Xuất ${ready.length} video đã duyệt`}</button>
      </PageHead>
      {!last && todo.length > 0 && ready.length === todo.length && (
        <SaveBanner><button className="btn btn-primary" disabled={pick.busy} onClick={choose}>{pick.busy ? "Đang mở hộp chọn…" : "Chọn nơi lưu…"}</button></SaveBanner>
      )}
      <Msg msg={a.msg} />
      <div className="card mb-4">
        <h2 className="mb-1 font-semibold">Nơi lưu dự án</h2>
        <p className="text-[13px] text-soft">Hộp chọn thư mục mở trên <b className="font-medium text-ink">máy tính đang chạy ứng dụng</b>. Để trống thì lưu trong thư mục của ứng dụng.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn" disabled={pick.busy} onClick={choose}>{pick.busy ? "Đang chờ bạn chọn thư mục…" : "Chọn thư mục…"}</button>
          {!typing && <button className="btn" onClick={() => { setTyping(true); setTimeout(() => input.current?.focus(), 0); }}>Gõ đường dẫn</button>}
          {dest && <button className="btn" onClick={() => setDest("")}>Dùng thư mục của ứng dụng</button>}
        </div>
        {pick.msg && !pick.msg.ok && <Msg msg={pick.msg} />}
        {typing && (
          <div className="mt-3">
            <label className="label" htmlFor="export-dir">Đường dẫn thư mục (đầy đủ)</label>
            <input id="export-dir" ref={input} className="input font-mono" placeholder="D:\Video khoá học" value={dest} onChange={(e) => { setDest(e.target.value); pick.setMsg(null); }} autoComplete="off" spellCheck={false} />
          </div>
        )}
        <div className="mt-3 rounded-lg bg-paper px-3 py-2 text-[13px]">
          <div className="text-soft">Sẽ lưu vào</div>
          <code className="break-all font-medium">{target}</code>
          <div className="mt-1 text-soft">Bên trong: <code>Cap_do_1/…</code>, <code>Cap_do_2/…</code> (tên tệp theo mã video) và <code>DANH_MUC_VIDEO.txt</code> (UTF-8 BOM, CRLF: mã, thời lượng, tiêu đề, giọng, phong cách).</div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5" checked={extras} onChange={(e) => setExtras(e.target.checked)} />
          <span>Kèm phụ đề <code>.vtt</code> và lời thoại <code>.txt</code> cạnh mỗi video</span>
        </label>
        <p className="mt-2 text-[13px] text-soft">Chỉ video đã duyệt ở bước 8 mới được xuất (QA chặn xuất nếu không đạt).{todo.length > ready.length && ` Còn ${todo.length - ready.length} video chưa duyệt.`}</p>
      </div>
      {res && (
        <div className="card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Đã xuất {res.files.length} video</h2>
            <button className="btn btn-primary" onClick={() => open(res.dir)}>Mở thư mục</button>
          </div>
          <div className="mb-2 break-all text-[13px]">Thư mục: <code>{res.dir}</code></div>
          <ul className="mb-2 text-xs">{res.files.map((f) => <li key={f} className="break-all font-mono">{f}</li>)}</ul>
          {res.skipped.map((s) => <div key={s.key} className="text-xs"><Badge tone="amber">bỏ qua</Badge> {s.key}: {s.reason}</div>)}
          <div className="mt-2 break-all text-xs">Danh mục: <code>{res.catalog}</code></div>
        </div>
      )}
      {!res && last && <p className="text-[13px] text-soft">Lần xuất gần nhất: {last.files} video vào <code className="break-all">{last.dir}</code> ({new Date(last.at).toLocaleString("vi-VN")}).</p>}
    </div>
  );
}
