"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Msg } from "@/components/ui";
import { ClaudeCodeButton, ClaudeCodeStatus } from "@/components/claude-code";

const QUICK = ["Bớt chữ, tăng cỡ chữ", "Đổi sang bố cục khác", "Nhấn mạnh con số chính", "Thêm biểu tượng minh hoạ", "Dùng biểu đồ cột so sánh", "Chuyển động chậm và nhẹ hơn"];

type SceneLite = { id: string; title: string; notes?: string[]; history?: unknown[]; design?: { template: string } };

/** Ô "nhờ AI sửa" gắn ngay vào cảnh đang chọn: AI sửa đúng cảnh này rồi tự render lại (giữ giọng).
 *  Không có Claude API → gửi cùng yêu cầu cho Claude Code (gói đã đăng ký) xử lý. */
export function ScenePrompt({ pid, vkey, scene, busy, onQueued }: { pid: string; vkey: string; scene: SceneLite; busy?: boolean; onQueued?: () => void }) {
  const claude = useApi<{ available: boolean }>("/claude/status", 15000);
  const [text, setText] = useState("");
  const [custom, setCustom] = useState(false);
  const a = useAction();
  const ok = !!claude.data?.available;
  const send = () =>
    a.run(async () => {
      await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "revise", keys: [vkey], payload: { scene: scene.id, note: text.trim(), custom } } });
      setText("");
      onQueued?.();
    }, `Đã gửi: AI đang sửa ${scene.id}, xong sẽ tự render lại`);
  const undo = () =>
    a.run(async () => {
      await api(`/projects/${pid}/videos/${encodeURIComponent(vkey)}/scenes/${scene.id}/undo`, { method: "POST" });
      onQueued?.();
    }, `Đã hoàn tác ${scene.id}, đang render lại`);
  const notes = (scene.notes ?? []).slice(-4).reverse();
  return (
    <div>
      <label className="label" htmlFor={`sp-${scene.id}`}>Nhờ AI sửa cảnh {scene.id}</label>
      <textarea
        id={`sp-${scene.id}`}
        className="input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => ok && (e.ctrlKey || e.metaKey) && e.key === "Enter" && text.trim() && !busy && send()}
        placeholder="Ví dụ: đổi thành so sánh hai cột Thẩm định / Thẩm tra, chữ tiêu đề to hơn, mũi tên đi từ trái sang phải"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" className="rounded-md bg-paper px-2 py-1 text-[12px] text-soft shadow-[0_0_0_1px_rgb(19_34_43/0.1)] transition-colors duration-150 hover:text-ink disabled:opacity-50" onClick={() => setText((t) => (t ? `${t}; ${q.toLowerCase()}` : q))}>
            {q}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-start gap-2 text-[13px] text-soft">
        <input type="checkbox" className="mt-0.5" checked={custom || scene.design?.template === "custom"} disabled={scene.design?.template === "custom"} onChange={(e) => setCustom(e.target.checked)} />
        <span>Cho AI viết mã cảnh tùy biến (tự do hơn mẫu có sẵn, lâu hơn)</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ok && <button className="btn btn-primary" disabled={!text.trim() || busy || a.busy} onClick={send}>Gửi cho AI sửa</button>}
        <ClaudeCodeButton primary={!ok} pid={pid} kind={custom && scene.design?.template !== "custom" ? "custom-scene" : "revise"} videoKey={vkey} sceneId={scene.id} note={text.trim()} what={`sửa cảnh ${scene.id} theo yêu cầu của bạn`} disabled={!text.trim()} onSent={() => setText("")} />
        {(scene.history?.length ?? 0) > 0 && <button className="btn" disabled={busy || a.busy} onClick={undo}>Hoàn tác lần sửa trước</button>}
        {ok && <span className="hidden text-[12px] text-soft sm:inline">Ctrl + Enter để gửi</span>}
      </div>
      {!ok && claude.data && <p className="mt-2 text-[13px] text-soft">Chưa có Claude API: yêu cầu do <b className="font-medium text-ink">Claude Code</b> (gói đã đăng ký) làm. Muốn ứng dụng tự làm thì <Link className="text-brand underline" href="/claude">kết nối Claude API</Link>.</p>}
      <Msg msg={a.msg} />
      <ClaudeCodeStatus pid={pid} videoKey={vkey} sceneId={scene.id} limit={2} />
      {notes.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="text-[12px] font-medium text-soft">Yêu cầu đã gửi cho cảnh này</div>
          <ul className="mt-1 space-y-1 text-[13px]">{notes.map((n, i) => <li key={i} className="rounded-md bg-paper px-2 py-1">{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
