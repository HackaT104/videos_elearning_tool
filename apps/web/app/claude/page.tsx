"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg, PageHead } from "@/components/ui";

type Status = { source: string; label: string; profiles: string[]; antInstalled: boolean; login: { running: boolean; url: string | null; message: string }; model: string; available: boolean };

export default function ClaudePage() {
  const { data, reload } = useApi<Status>("/claude/status", 3000);
  const [key, setKey] = useState("");
  const a = useAction();
  const t = useAction();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Kết nối Claude AI" />
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {data?.available ? <Badge tone="green">Đã đăng nhập</Badge> : <Badge tone="amber">Chưa đăng nhập</Badge>}
          <span className="text-sm">{data?.label}</span>
          <span className="text-xs text-soft">· model {data?.model}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled={!data?.available || t.busy} onClick={() => t.run(async () => { const r = await api<{ ok: boolean; message: string }>("/claude/test", { method: "POST" }); if (!r.ok) throw new Error(r.message); t.setMsg({ ok: true, text: r.message }); })}>{t.busy ? "Đang thử…" : "Kiểm tra kết nối"}</button>
          {data?.available && data.source !== "env-key" && <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api("/claude/logout", { method: "POST" }); reload(); }, "Đã đăng xuất")}>Đăng xuất</button>}
        </div>
        <Msg msg={t.msg} />
        <p className="mt-3 text-sm text-soft">Claude dùng cho: viết kịch bản từ dàn ý/chủ đề, sửa cách đọc, thiết kế từng cảnh, viết cảnh tùy biến, soát hình và sửa theo ghi chú, và <b>agent tự làm trọn một video</b>.</p>
      </div>

      <div className="card mb-4">
        <h2 className="mb-1 font-semibold">Cách 1 · Đăng nhập bằng tài khoản Anthropic</h2>
        <p className="mb-3 text-sm text-soft">Ứng dụng tự cài công cụ đăng nhập chính thức của Anthropic, rồi mở trang đăng nhập trong trình duyệt của <b>máy tính đang chạy ứng dụng</b>. Đăng nhập xong không cần chép khoá. Dùng tài khoản Anthropic Console (API, tính phí theo lượng dùng). Gói Claude Pro/Max trên claude.ai không dùng được ở đây.</p>
        <button className="btn btn-primary" disabled={a.busy || data?.login.running} onClick={() => a.run(async () => { await api("/claude/login", { method: "POST" }); reload(); })}>{data?.login.running ? "Đang chờ đăng nhập…" : "Đăng nhập tài khoản Anthropic"}</button>
        {data?.login.message && <div className="mt-2 text-sm">{data.login.message}</div>}
        {data?.login.url && <div className="mt-1 break-all text-xs">Nếu trình duyệt không tự mở, mở link này trên máy tính: <a className="text-brand underline" href={data.login.url} target="_blank" rel="noreferrer">{data.login.url}</a></div>}
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Cách 2 · Dán khoá API</h2>
        <p className="mb-3 text-sm text-soft">Tạo khoá tại console.anthropic.com → API Keys. Khoá chỉ lưu trên máy này (thư mục storage/secrets). Khoá trong file .env (nếu có) luôn được ưu tiên.</p>
        <div className="flex flex-wrap gap-2">
          <input type="password" autoComplete="off" className="input min-w-0 flex-1" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn btn-primary" disabled={!key || a.busy} onClick={() => a.run(async () => { const r = await api<{ ok: boolean; message: string }>("/claude/key", { method: "POST", json: { apiKey: key } }); setKey(""); reload(); if (!r.ok) throw new Error(`Đã lưu khoá nhưng thử gọi lỗi: ${r.message}`); a.setMsg({ ok: true, text: `Đã lưu khoá. ${r.message}` }); })}>Lưu & kiểm tra</button>
        </div>
        <Msg msg={a.msg} />
      </div>
    </div>
  );
}
