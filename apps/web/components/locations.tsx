"use client";
// Nơi lưu: chọn nhanh ổ đĩa / ổ ngoài / ổ mạng đã map / thư mục cloud (OneDrive, Google Drive, Dropbox…) đã đồng bộ về máy,
// thư mục xuất mặc định cho mọi dự án, chuyển dữ liệu làm việc sang ổ khác (bộ cài Windows chép khi mở lại).
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";

export type Loc = { path: string; label: string; kind: "local" | "removable" | "network" | "cloud"; free: number | null; total: number | null };
export const KIND_VI: Record<Loc["kind"], string> = { local: "Ổ trong máy", removable: "Ổ ngoài", network: "Ổ mạng", cloud: "Cloud" };
const gb = (b: number | null) => (b === null ? "" : b >= 1024 ** 4 ? `${(b / 1024 ** 4).toFixed(1)} TB` : `${(b / 1024 ** 3).toFixed(b < 10 * 1024 ** 3 ? 1 : 0)} GB`);
const joinPath = (base: string, name: string) => (base.includes("\\") ? `${base.replace(/\\+$/, "")}\\${name}` : `${base.replace(/\/+$/, "")}/${name}`);

/** Các nút chọn nhanh nơi lưu: bấm → <ổ>\<sub>. */
export function LocationChips({ onPick, sub = "Course Video Studio", exclude = [] }: { onPick: (path: string, loc: Loc) => void; sub?: string; exclude?: Loc["kind"][] }) {
  const l = useApi<{ locations: Loc[] }>("/storage/locations");
  const list = l.data?.locations.filter((x) => !exclude.includes(x.kind)) ?? [];
  if (!l.data) return <p className="mt-2 text-[13px] text-soft">Đang dò ổ đĩa và thư mục cloud…</p>;
  if (!list.length) return null;
  return (
    <div className="mt-3">
      <div className="text-[12px] font-medium text-soft">Chọn nhanh</div>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {list.map((x) => (
          <li key={x.path}>
            <button type="button" onClick={() => onPick(joinPath(x.path, sub), x)} className="flex min-h-9 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-left text-[13px] shadow-[0_0_0_1px_rgb(19_34_43/0.12)] transition-colors duration-150 hover:bg-brand-tint">
              <span className="font-medium">{x.label}</span>
              <Badge tone={x.kind === "cloud" ? "blue" : x.kind === "network" ? "amber" : undefined}>{KIND_VI[x.kind]}</Badge>
              {x.free !== null && <span className="num text-[12px] text-soft">còn {gb(x.free)}</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] text-soft">Ổ mạng phải đang kết nối; thư mục cloud cần ứng dụng OneDrive / Google Drive đang chạy để đồng bộ lên mạng.</p>
    </div>
  );
}

/** Ô đường dẫn + Chọn thư mục… + chọn nhanh + Kiểm tra (tạo + ghi thử, báo dung lượng trống). */
export function PathField({ id, value, onChange, exclude }: { id: string; value: string; onChange: (v: string) => void; exclude?: Loc["kind"][] }) {
  const pick = useAction();
  const chk = useAction();
  const [info, setInfo] = useState<{ kind: Loc["kind"]; free: number | null } | null>(null);
  const set = (v: string) => (onChange(v), setInfo(null), chk.setMsg(null));
  const choose = () =>
    pick.run(async () => {
      const r = await api<{ path?: string }>("/pick-folder", { method: "POST", json: { initial: value || undefined } });
      if (r.path) set(r.path);
    });
  const check = () =>
    chk.run(async () => {
      const r = await api<{ path: string; kind: Loc["kind"]; free: number | null }>("/storage/check", { method: "POST", json: { path: value } });
      setInfo(r);
      onChange(r.path);
    }, "Ghi được vào thư mục này");
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input id={id} className="input min-w-0 flex-1 font-mono" placeholder="D:\Video khoá học" value={value} onChange={(e) => set(e.target.value)} autoComplete="off" spellCheck={false} />
        <button type="button" className="btn" disabled={pick.busy} onClick={choose}>{pick.busy ? "Đang chờ chọn…" : "Chọn thư mục…"}</button>
        <button type="button" className="btn" disabled={!value.trim() || chk.busy} onClick={check}>Kiểm tra</button>
      </div>
      {pick.msg && !pick.msg.ok && <Msg msg={pick.msg} />}
      <Msg msg={chk.msg} />
      {info && <p className="mt-1 text-[13px] text-soft">{KIND_VI[info.kind]}{info.free !== null && ` · còn trống ${gb(info.free)}`}</p>}
      <LocationChips onPick={(p) => set(p)} exclude={exclude} />
    </div>
  );
}

/** Cài đặt: thư mục xuất mặc định cho mọi dự án. */
export function DefaultVideoDir() {
  const l = useApi<{ videoDir: string | null }>("/storage/locations");
  const [dir, setDir] = useState<string | null>(null);
  const a = useAction();
  const cur = l.data?.videoDir ?? null;
  const value = dir ?? cur ?? "";
  const save = (path: string | null) =>
    a.run(async () => {
      await api("/storage/default", { method: "POST", json: { path } });
      setDir(null);
      l.reload();
    }, path ? "Đã lưu – các dự án chưa chọn nơi riêng sẽ xuất vào đây" : "Đã bỏ – xuất vào thư mục của ứng dụng");
  return (
    <section className="card mb-4 mt-4" aria-labelledby="vdir">
      <h2 id="vdir" className="font-semibold">Nơi lưu video mặc định</h2>
      <p className="mt-0.5 text-[13px] text-soft">Video xuất ra sẽ vào <code>&lt;thư mục này&gt;\&lt;tên dự án&gt;</code>. Chọn được ổ khác, ổ ngoài, ổ mạng đã map (vd. <code>Z:</code>, <code>\\may-chu\chia-se</code>) hoặc thư mục OneDrive / Google Drive / Dropbox trên máy. Từng dự án vẫn đổi được ở bước Xuất.</p>
      <p className="mt-2 text-[13px]">Hiện tại: {cur ? <code className="break-all font-medium">{cur}</code> : <span className="text-soft">thư mục của ứng dụng</span>}</p>
      <div className="mt-3"><PathField id="vdir-path" value={value} onChange={setDir} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={a.busy || !value.trim() || value === cur} onClick={() => save(value.trim())}>Lưu làm mặc định</button>
        {cur && <button type="button" className="btn" disabled={a.busy} onClick={() => save(null)}>Dùng thư mục của ứng dụng</button>}
      </div>
      <Msg msg={a.msg} />
    </section>
  );
}

type DataInfo = { path: string; bytes: number; files: number; canMove: boolean; pending: string | null; free: number | null };
/** Cài đặt: chuyển dữ liệu làm việc (dự án, giọng, video đã render) sang ổ khác – chỉ ổ trong / ổ ngoài. */
export function DataLocation({ local }: { local: boolean }) {
  const d = useApi<DataInfo>("/storage/data");
  const [to, setTo] = useState("");
  const a = useAction();
  const info = d.data;
  const request = (path: string | null) =>
    a.run(async () => {
      if (path && !confirm(`Chuyển toàn bộ dữ liệu (${gb(info?.bytes ?? 0)}) sang\n${path}\n\nLần mở ứng dụng sau sẽ chép sang đó rồi xoá bản cũ. Tiếp tục?`)) return;
      await api("/storage/data/move", { method: "POST", json: { path } });
      d.reload();
    }, path ? "Đã hẹn – thoát rồi mở lại ứng dụng để chuyển" : "Đã huỷ hẹn chuyển");
  const quit = () => a.run(() => api("/app/quit", { method: "POST", json: {} }), "Ứng dụng đang thoát – mở lại từ lối tắt để chuyển dữ liệu");
  return (
    <section className="card mb-4" aria-labelledby="ddir">
      <h2 id="ddir" className="font-semibold">Dữ liệu làm việc</h2>
      <p className="mt-0.5 text-[13px] text-soft">Dự án, giọng đọc, video đã render và bộ nhớ đệm. Ổ C đầy thì chuyển sang ổ khác (ổ trong hoặc ổ ngoài). Không chuyển vào cloud hay ổ mạng vì cơ sở dữ liệu dễ hỏng khi bị đồng bộ – muốn lưu video lên cloud thì dùng mục <b className="font-medium text-ink">Nơi lưu video mặc định</b> ở trên.</p>
      {info && (
        <p className="mt-2 text-[13px]">
          <code className="break-all font-medium">{info.path}</code>
          <span className="num text-soft"> · {gb(info.bytes)} · {info.files.toLocaleString("vi-VN")} tệp{info.free !== null && ` · ổ còn ${gb(info.free)}`}</span>
        </p>
      )}
      {info?.pending ? (
        <div className="assume mt-3">
          <div>Đã hẹn chuyển sang <code className="break-all">{info.pending}</code>. Thoát và mở lại ứng dụng để bắt đầu chép (có thể mất vài phút; cửa sổ khởi động báo tiến trình).</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {local && <button type="button" className="btn btn-primary" disabled={a.busy} onClick={quit}>Thoát ứng dụng ngay</button>}
            <button type="button" className="btn" disabled={a.busy} onClick={() => request(null)}>Huỷ hẹn</button>
          </div>
        </div>
      ) : info?.canMove ? (
        local && (
          <>
            <div className="mt-3"><PathField id="ddir-path" value={to} onChange={setTo} exclude={["cloud", "network"]} /></div>
            <button type="button" className="btn mt-3" disabled={a.busy || !to.trim()} onClick={() => request(to.trim())}>Hẹn chuyển dữ liệu sang đây</button>
          </>
        )
      ) : (
        info && <p className="mt-2 text-[13px] text-soft">Đang chạy từ mã nguồn: muốn đổi chỗ, chép thư mục trên sang ổ mới rồi thêm dòng <code>CVS_STORAGE=&lt;thư mục mới&gt;</code> vào tệp <code>.env</code>.</p>
      )}
      <Msg msg={a.msg} />
    </section>
  );
}
