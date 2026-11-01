"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Msg } from "@/components/ui";

const QUICK = ["Bớt chữ, tăng cỡ chữ", "Đổi sang bố cục khác", "Nhấn mạnh con số chính", "Thêm biểu tượng minh hoạ", "Dùng biểu đồ cột so sánh", "Chuyển động chậm và nhẹ hơn"];

type SceneLite = { id: string; title: string; notes?: string[]; history?: unknown[]; design?: { template: string } };

/** Ô "nhờ AI sửa" gắn ngay vào cảnh đang chọn: AI sửa đúng cảnh này rồi tự render lại (giữ giọng). */
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
        disabled={!ok}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && text.trim() && !busy && send()}
        placeholder="Ví dụ: đổi thành so sánh hai cột Thẩm định / Thẩm tra, chữ tiêu đề to hơn, mũi tên đi từ trái sang phải"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" disabled={!ok} className="rounded-md bg-paper px-2 py-1 text-[12px] text-soft shadow-[0_0_0_1px_rgb(19_34_43/0.1)] transition-colors duration-150 hover:text-ink disabled:opacity-50" onClick={() => setText((t) => (t ? `${t}; ${q.toLowerCase()}` : q))}>
            {q}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-start gap-2 text-[13px] text-soft">
        <input type="checkbox" className="mt-0.5" checked={custom || scene.design?.template === "custom"} disabled={!ok || scene.design?.template === "custom"} onChange={(e) => setCustom(e.target.checked)} />
        <span>Cho AI viết mã cảnh tùy biến (tự do hơn mẫu có sẵn, lâu hơn)</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!ok || !text.trim() || busy || a.busy} onClick={send}>Gửi cho AI sửa</button>
        {(scene.history?.length ?? 0) > 0 && <button className="btn" disabled={busy || a.busy} onClick={undo}>Hoàn tác lần sửa trước</button>}
        {!ok && <span className="text-[13px] text-soft">Cần <Link className="text-brand underline" href="/claude">đăng nhập Claude</Link> để dùng.</span>}
        {ok && <span className="hidden text-[12px] text-soft sm:inline">Ctrl + Enter để gửi</span>}
      </div>
      <Msg msg={a.msg} />
      {notes.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="text-[12px] font-medium text-soft">Yêu cầu đã gửi cho cảnh này</div>
          <ul className="mt-1 space-y-1 text-[13px]">{notes.map((n, i) => <li key={i} className="rounded-md bg-paper px-2 py-1">{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
