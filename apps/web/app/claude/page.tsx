"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg, PageHead } from "@/components/ui";
import { ClaudeCodeHowTo, ClaudeCodeLog, ClaudeCodeSetup, ClaudeCodeStatus, type Runner } from "@/components/claude-code";

type Status = { source: string; label: string; profiles: string[]; antInstalled: boolean; login: { running: boolean; url: string | null; message: string }; model: string; blocked?: string | null; available: boolean };

export default function ClaudePage() {
  const { data, reload } = useApi<Status>("/claude/status", 3000);
  const [key, setKey] = useState("");
  const a = useAction();
  const t = useAction();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Kết nối Claude AI" />
      <div className="card mb-4">
        <h2 className="mb-1 font-semibold">Hai cách dùng Claude</h2>
        <p className="text-sm text-soft">Ứng dụng tự chọn: có Claude API thì dùng API, không có thì gửi việc cho Claude Code.</p>
        {data?.blocked && <div className="msg mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Tạm dừng Claude API: {data.blocked}. Trong lúc này các nút AI chuyển sang "Gửi cho Claude Code"; ứng dụng thử lại API sau 10 phút hoặc ngay khi bạn lưu khoá mới.</div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className={`rounded-lg p-3 shadow-[0_0_0_1px_rgb(19_34_43/0.1)] ${data?.available ? "bg-brand-tint" : ""}`}>
            <div className="flex flex-wrap items-center gap-1.5 font-medium">Claude API {data?.available && <Badge tone="green">đang dùng</Badge>}</div>
            <p className="mt-1 text-[13px] text-soft"><b className="font-medium text-ink">Tự động:</b> ứng dụng tự thiết kế, vẽ, sửa và soát hình ngay khi bạn bấm. <b className="font-medium text-ink">Tính phí API</b> theo lượng dùng (tài khoản Anthropic Console). Kết nối bằng một trong hai cách bên dưới.</p>
          </div>
          <div className={`rounded-lg p-3 shadow-[0_0_0_1px_rgb(19_34_43/0.1)] ${data && !data.available ? "bg-brand-tint" : ""}`}>
            <div className="flex flex-wrap items-center gap-1.5 font-medium">Claude Code {data && !data.available && <Badge tone="green">đang dùng</Badge>}</div>
            <p className="mt-1 text-[13px] text-soft">Dùng <b className="font-medium text-ink">gói Claude đã đăng ký</b> (Pro, Max, Team… có Claude Code), không tốn phí API. Bấm nút <b className="font-medium text-ink">Claude Code</b> ở cảnh/video, đồng ý là ứng dụng tự chạy Claude Code trên máy này.</p>
          </div>
        </div>
      </div>
      <RunnerCard />
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
        <h2 className="mb-1 font-semibold">Claude API · cách 1: đăng nhập tài khoản Anthropic</h2>
        <p className="mb-3 text-sm text-soft">Ứng dụng tự cài công cụ đăng nhập chính thức của Anthropic, rồi mở trang đăng nhập trong trình duyệt của <b>máy tính đang chạy ứng dụng</b>. Đăng nhập xong không cần chép khoá. Dùng tài khoản Anthropic Console (API, tính phí theo lượng dùng). Gói Claude Pro/Max trên claude.ai không đăng nhập ở đây được: dùng gói qua Claude Code (xem trên).</p>
        <button className="btn btn-primary" disabled={a.busy || data?.login.running} onClick={() => a.run(async () => { await api("/claude/login", { method: "POST" }); reload(); })}>{data?.login.running ? "Đang chờ đăng nhập…" : "Đăng nhập tài khoản Anthropic"}</button>
        {data?.login.message && <div className="mt-2 text-sm">{data.login.message}</div>}
        {data?.login.url && <div className="mt-1 break-all text-xs">Nếu trình duyệt không tự mở, mở link này trên máy tính: <a className="text-brand underline" href={data.login.url} target="_blank" rel="noreferrer">{data.login.url}</a></div>}
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Claude API · cách 2: dán khoá API</h2>
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

/** Claude Code trên máy này: cài, đăng nhập, tự chạy không hỏi, chạy ngay, nhật ký. */
function RunnerCard() {
  const r = useApi<Runner>("/claude-code/runner", 4000);
  const a = useAction();
  const d = r.data;
  const reload = (refresh?: boolean) => (refresh ? api<Runner>("/claude-code/runner?refresh=1").then(r.setData).catch(() => undefined) : r.reload());
  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Claude Code trên máy này</h2>
        {d && (d.running ? <Badge tone="blue">Đang làm…</Badge> : d.installed && d.loggedIn !== false ? <Badge tone="green">Sẵn sàng</Badge> : <Badge tone="amber">{d.installed ? "Chưa đăng nhập" : "Chưa cài"}</Badge>)}
        {d?.version && <span className="num text-xs text-soft">phiên bản {d.version}</span>}
      </div>
      <p className="mt-1 text-sm text-soft">Ứng dụng chạy Claude Code ở chế độ nền trong thư mục ứng dụng, quyền hẹp: chỉ lệnh <code>pnpm cvs</code>, đọc tệp, ghi tệp tạm trong <code>storage/claude-code-tmp</code>; không web, không công cụ khác. Mỗi lần một lượt, tối đa 45 phút.</p>
      <ClaudeCodeSetup runner={d} reload={reload} />
      {d && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={d.auto} disabled={a.busy} onChange={(e) => { const auto = e.target.checked; a.run(async () => { await api("/claude-code/settings", { method: "POST", json: { auto } }); await r.reload(); }); }} />
            <span><b className="font-medium">Tự chạy không hỏi</b><span className="block text-[13px] text-soft">Gửi việc cho Claude Code là chạy ngay, không hiện hộp xác nhận.</span></span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" disabled={!d.installed || d.running || a.busy} onClick={() => a.run(async () => { const x = await api<{ started: boolean; reason?: string }>("/claude-code/run", { method: "POST" }); await r.reload(); a.setMsg({ ok: true, text: x.started ? "Claude Code đang làm các yêu cầu đang chờ" : (x.reason ?? "") }); })}>{d.running ? "Claude Code đang làm…" : "Chạy ngay các yêu cầu đang chờ"}</button>
            {d.lastResult && !d.running && <Badge tone={d.lastResult === "done" ? "green" : "red"}>{d.lastResult === "done" ? "Lượt trước: xong" : "Lượt trước: lỗi"}</Badge>}
          </div>
          <Msg msg={a.msg} />
          {d.lastError && !d.running && <p className="text-[13px] text-danger">{d.lastError}</p>}
          <ClaudeCodeLog lines={d.lastLog} max={12} />
          {d.logFile && <p className="break-all text-xs text-soft">Nhật ký đầy đủ: <code>{d.logFile}</code></p>}
        </div>
      )}
      <ClaudeCodeStatus limit={5} howTo={false} log={false} />
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-soft">Tự mở Claude Code bằng tay (cách cũ)</summary>
        <div className="mt-2"><ClaudeCodeHowTo /></div>
      </details>
    </div>
  );
}
