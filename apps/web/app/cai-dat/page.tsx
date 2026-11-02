"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, ErrorBox, Msg, PageHead, Progress } from "@/components/ui";
import { useIsLocal, type UpdateStatus } from "@/components/app-menu";

const TOKEN_DOCS = "https://docs.github.com/vi/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN") : "chưa");

export default function SettingsPage() {
  const s = useApi<UpdateStatus>("/update/status", 2000);
  const local = useIsLocal();
  const d = s.data;
  const a = useAction();
  const t = useAction();
  const [token, setToken] = useState("");
  const save = (json: object, ok: string, act = t) => act.run(async () => s.setData(await api<UpdateStatus>("/update/settings", { method: "POST", json })), ok);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Cài đặt & cập nhật" />

      <section className="card mb-4" aria-labelledby="ver">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="ver" className="font-semibold">Phiên bản</h2>
          {d && <span className="num text-sm">{d.current}</span>}
          {d?.available ? <Badge tone="green">Có bản mới {d.latest?.version}</Badge> : d?.latest && !d.error ? <Badge>Đang dùng bản mới nhất</Badge> : null}
        </div>
        <p className="mt-1 text-[13px] text-soft">
          Bản mới lấy từ GitHub Releases của <span className="font-medium text-ink">{d?.repo ?? "…"}</span> · lần kiểm tra gần nhất: {fmt(d?.lastCheck ?? null)}
        </p>
        {d?.error && <div className="mt-2"><ErrorBox error={d.error} /></div>}
        {d?.available && d.latest?.notes && (
          <div className="mt-3 rounded-lg bg-paper px-3 py-2 text-[13px]">
            <div className="mb-1 font-medium">Có gì mới trong {d.latest.version}</div>
            <div className="whitespace-pre-wrap text-soft">{d.latest.notes}</div>
          </div>
        )}
        {d?.downloading && (
          <div className="mt-3">
            <div className="mb-1 text-[13px]">{d.message} <span className="num text-soft">{d.progress}%</span></div>
            <Progress value={d.progress} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled={!d || d.checking || a.busy} onClick={() => a.run(async () => s.setData(await api<UpdateStatus>("/update/check", { method: "POST" })))}>
            {d?.checking ? "Đang kiểm tra…" : "Kiểm tra ngay"}
          </button>
          {d?.available && d.canInstall && local && (
            <button className="btn btn-primary" disabled={d.downloading || a.busy} onClick={() => window.confirm(`Cập nhật lên ${d.latest?.version}? Ứng dụng sẽ tự đóng, cài bản mới rồi mở lại (dự án và video được giữ nguyên).`) && a.run(async () => s.setData(await api<UpdateStatus>("/update/install", { method: "POST", json: {} })))}>
              {d.downloading ? "Đang cập nhật…" : `Cập nhật lên ${d.latest?.version}`}
            </button>
          )}
        </div>
        {d?.available && !d.canInstall && <p className="mt-2 text-[13px] text-soft">Bản chạy từ mã nguồn: cập nhật bằng <code>git pull</code> rồi mở lại <code>KHOI_DONG.cmd</code>. Tự cập nhật chỉ có ở bản cài trên Windows.</p>}
        <Msg msg={a.msg} />
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={d?.autoCheck ?? true} disabled={!d || !local} onChange={(e) => save({ autoCheck: e.target.checked }, e.target.checked ? "Sẽ tự kiểm tra mỗi ngày một lần" : "Đã tắt tự kiểm tra", a)} />
          Tự kiểm tra bản mới khi mở ứng dụng (mỗi ngày một lần)
        </label>
      </section>

      <section className="card" aria-labelledby="tok">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="tok" className="font-semibold">Mã truy cập GitHub</h2>
          {d?.hasToken ? <Badge tone="green">Đã lưu</Badge> : d?.tokenFromEnv ? <Badge tone="blue">Dùng CVS_UPDATE_TOKEN</Badge> : <Badge tone="amber">Chưa có</Badge>}
        </div>
        <p className="mt-1 mb-3 text-[13px] text-soft">
          Repo phát hành là repo riêng tư nên cần mã chỉ-đọc để thấy bản mới. Mã chỉ lưu trên máy này (thư mục dữ liệu, tệp settings.json), không hiện lại và không ghi vào nhật ký.
        </p>
        {local ? (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), t.run(async () => (s.setData(await api<UpdateStatus>("/update/settings", { method: "POST", json: { token } })), setToken("")), "Đã lưu mã – bấm Kiểm tra ngay để thử"))}>
            <label htmlFor="token" className="sr-only">Mã truy cập</label>
            <input id="token" type="password" autoComplete="off" spellCheck={false} className="input min-w-0 flex-1" placeholder={d?.hasToken ? "•••••••• (đã lưu – dán mã mới để thay)" : "github_pat_…"} value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn btn-primary" disabled={!token.trim() || t.busy}>Lưu mã</button>
            {d?.hasToken && <button type="button" className="btn" disabled={t.busy} onClick={() => save({ token: "" }, "Đã xoá mã")}>Xoá mã</button>}
          </form>
        ) : (
          <p className="text-sm">Chỉ đổi được ngay trên máy tính đang chạy ứng dụng.</p>
        )}
        <Msg msg={t.msg} />
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer font-medium">Cách tạo mã chỉ-đọc (fine-grained token)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-soft">
            <li>Người quản lý repo <span className="font-medium text-ink">{d?.repo ?? "…"}</span> đăng nhập GitHub, mở <a className="text-brand underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Settings → Developer settings → Fine-grained tokens → Generate new token</a>.</li>
            <li>Resource owner: chủ repo. Repository access: <b className="text-ink">Only select repositories</b> → chọn đúng repo này.</li>
            <li>Permissions → Repository permissions → <b className="text-ink">Contents: Read-only</b> (Metadata: Read-only tự bật). Không cấp quyền nào khác.</li>
            <li>Đặt hạn dùng (ví dụ 1 năm), bấm Generate, chép mã <code>github_pat_…</code> và dán vào ô trên.</li>
          </ol>
          <a className="mt-2 inline-block text-brand underline" href={TOKEN_DOCS} target="_blank" rel="noreferrer">Hướng dẫn của GitHub</a>
        </details>
      </section>
    </div>
  );
}
