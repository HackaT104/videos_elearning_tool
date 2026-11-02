"use client";
// "Gửi cho Claude Code": khi không có Claude API, việc AI vào hàng đợi để Claude Code (gói Claude đã đăng ký) làm qua `pnpm cvs`.
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";

export type CcKind = "revise" | "design-video" | "illustration" | "custom-scene" | "fix-readings" | "agent";
type CcReq = { id: number; project_id: string; video_key: string | null; scene_id: string | null; kind: CcKind; note: string | null; status: "pending" | "done" | "failed"; message: string | null; created_at: string };

export const CC_PROMPT = "Xử lý các yêu cầu đang chờ của Course Video Studio";
const KIND: Record<CcKind, string> = { revise: "Sửa cảnh", "design-video": "Thiết kế lại cảnh", illustration: "Vẽ minh hoạ", "custom-scene": "Cảnh tùy biến", "fix-readings": "Sửa cách đọc", agent: "Làm trọn video" };
const STATUS = { pending: ["Chờ Claude Code", "amber"], done: ["Xong", "green"], failed: ["Không làm được", "red"] } as const;

/** Nút gửi một việc AI cho Claude Code. */
export function ClaudeCodeButton({ pid, kind, videoKey, sceneId, note, label = "Gửi cho Claude Code", primary, disabled, title, onSent }: {
  pid: string; kind: CcKind; videoKey?: string; sceneId?: string; note?: string; label?: string; primary?: boolean; disabled?: boolean; title?: string; onSent?: () => void;
}) {
  const a = useAction();
  const send = () =>
    a.run(async () => {
      await api("/claude-code/requests", { method: "POST", json: { projectId: pid, kind, videoKey, sceneId, note } });
      onSent?.();
    });
  return (
    <>
      <button type="button" className={`btn ${primary ? "btn-primary" : ""}`} disabled={disabled || a.busy} title={title ?? "Không có Claude API: Claude Code (gói đã đăng ký) sẽ làm việc này"} onClick={send}>{label}</button>
      {a.msg && !a.msg.ok && <Msg msg={a.msg} />}
    </>
  );
}

/** Câu dán vào Claude Code + nút chép (có cách dự phòng khi trình duyệt chặn clipboard trên http). */
export function ClaudeCodeHowTo() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CC_PROMPT);
    } catch {
      // http qua mạng LAN: không có clipboard API → chép qua ô tạm
      const t = document.createElement("textarea");
      t.value = CC_PROMPT;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div>
      <p className="text-[13px] text-soft">Mở Claude Code trong thư mục dự án (thư mục có <span className="font-medium text-ink">KHOI_DONG.cmd</span>), để ứng dụng chạy, rồi dán câu này:</p>
      <div className="mt-1.5 flex items-start gap-2">
        <p className="min-w-0 flex-1 select-all rounded-lg bg-surface px-3 py-2 text-sm font-medium shadow-[0_0_0_1px_rgb(19_34_43/0.12)]">{CC_PROMPT}</p>
        <button type="button" className="btn shrink-0" onClick={copy} aria-live="polite">{copied ? "Đã chép" : "Chép"}</button>
      </div>
    </div>
  );
}

/** Yêu cầu đã gửi cho Claude Code (lọc theo video/cảnh/loại) + hướng dẫn khi còn việc chờ. Không có gì → không hiện. */
export function ClaudeCodeStatus({ pid, videoKey, sceneId, kinds, limit = 3, howTo = true }: { pid?: string; videoKey?: string; sceneId?: string; kinds?: CcKind[]; limit?: number; howTo?: boolean }) {
  const q = new URLSearchParams();
  if (pid) q.set("projectId", pid);
  if (videoKey) q.set("videoKey", videoKey);
  const { data } = useApi<CcReq[]>(`/claude-code/requests?${q}`, 4000);
  const rows = (data ?? []).filter((r) => (!sceneId || r.scene_id === sceneId) && (!kinds || kinds.includes(r.kind)));
  const pending = rows.filter((r) => r.status === "pending");
  const shown = [...pending, ...rows.filter((r) => r.status !== "pending")].slice(0, Math.max(limit, pending.length));
  if (!shown.length) return null;
  return (
    <div className="msg mt-3 rounded-lg bg-paper p-3 shadow-[0_0_0_1px_rgb(19_34_43/0.08)]">
      <div className="text-[13px] font-semibold">Việc đã gửi cho Claude Code</div>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((r) => (
          <li key={r.id} className="text-[13px]">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
              <span className="font-medium">{KIND[r.kind] ?? r.kind}</span>
              <span className="num text-soft">{[r.video_key ?? (pid ? "mọi video" : r.project_id), r.scene_id].filter(Boolean).join(" · ")}</span>
            </span>
            {r.note && <span className="mt-0.5 block text-soft">«{r.note.length > 140 ? `${r.note.slice(0, 140)}…` : r.note}»</span>}
            {r.message && <span className="mt-0.5 block">{r.message}</span>}
          </li>
        ))}
      </ul>
      {howTo && pending.length > 0 && <div className="mt-3 border-t border-line pt-2.5"><ClaudeCodeHowTo /></div>}
    </div>
  );
}
