"use client";
// Claude Code (gói Claude đã đăng ký, không tốn phí API) làm việc AI qua `pnpm cvs`. Bấm nút → hộp xác nhận → ứng dụng tự chạy
// Claude Code trên máy đang chạy ứng dụng. Chưa cài / chưa đăng nhập → hộp hiện các bước cài, đăng nhập; yêu cầu vẫn nằm trong hàng đợi.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";

export type CcKind = "revise" | "design-video" | "illustration" | "custom-scene" | "fix-readings" | "review-readings" | "agent" | "analyze-doc" | "write-script" | "translate-subs";
type CcStatus = "pending" | "running" | "done" | "failed" | "cancelled";
type CcReq = { id: number; project_id: string; video_key: string | null; scene_id: string | null; file_id: string | null; kind: CcKind; note: string | null; status: CcStatus; message: string | null; created_at: string };
type RunStart = { started: boolean; queued?: boolean; reason?: string } | null;
export type Runner = {
  installed: boolean; bin: string | null; version: string | null; loggedIn: boolean | null; running: boolean; currentRequestIds: number[];
  lastLog: string[]; lastError: string | null; lastResult: "done" | "failed" | null; logFile: string | null; auto: boolean;
  install: { running: boolean; log: string[]; error: string | null; done: boolean }; platform: string;
};
export type CcInput = { pid: string; kind: CcKind; videoKey?: string; sceneId?: string; fileId?: string; note?: string };

export const CC_PROMPT = "Xử lý các yêu cầu đang chờ của Course Video Studio";
const KIND: Record<CcKind, string> = { revise: "Sửa cảnh", "design-video": "Thiết kế lại cảnh", illustration: "Vẽ minh hoạ", "custom-scene": "Cảnh tùy biến", "fix-readings": "Sửa cách đọc", "review-readings": "Rà soát cách đọc", agent: "Làm trọn video", "analyze-doc": "Phân tích tài liệu", "write-script": "Viết lại kịch bản", "translate-subs": "Dịch phụ đề" };
const WHAT: Record<CcKind, string> = { revise: "sửa cảnh theo yêu cầu của bạn", "design-video": "thiết kế lại các cảnh", illustration: "vẽ hình minh hoạ", "custom-scene": "viết mã cảnh tùy biến", "fix-readings": "sửa cách đọc", "review-readings": "đọc mọi câu và đề xuất cách đọc", agent: "sửa cách đọc, thiết kế cảnh, soát hình rồi render", "analyze-doc": "đọc và phân tích tài liệu (phần nào cần video, kịch bản đủ chưa)", "write-script": "viết lại kịch bản theo nội dung bài", "translate-subs": "dịch phụ đề sang ngôn ngữ đã chọn (giữ đúng số và thuật ngữ)" };
const STATUS: Record<CcStatus, readonly [string, "amber" | "blue" | "green" | "red" | "slate"]> = { pending: ["Chờ Claude Code", "amber"], running: ["Claude Code đang làm…", "blue"], done: ["Xong", "green"], failed: ["Lỗi", "red"], cancelled: ["Đã huỷ", "slate"] };
const ready = (r: Runner | null) => !!r?.installed && r.loggedIn !== false;
const runMsg = (run: RunStart) => (run?.started ? "Claude Code đang làm trên máy này – trạng thái hiện bên dưới" : run?.queued ? "Đã thêm vào hàng đợi – Claude Code làm ngay sau việc đang chạy" : `Đã gửi vào hàng đợi${run?.reason ? ` (${run.reason})` : ""}`);

/** Hộp thoại: nền mờ, Esc / bấm nền để đóng, giữ Tab trong hộp, trả tiêu điểm khi đóng. */
export function Modal({ title, onClose, opener, children }: { title: string; onClose: () => void; opener?: Element | null; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();
  useEffect(() => {
    const prev = (opener ?? document.activeElement) as HTMLElement | null;
    const el = box.current!;
    el.focus();
    const items = () => [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])')];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab") {
        const f = items();
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
        else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="modal fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-3 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className="modal-box max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 outline-none shadow-[0_0_0_1px_rgb(19_34_43/0.08),0_24px_60px_-16px_rgb(19_34_43/0.5)]">
        <h2 id={id} className="text-[18px] font-semibold leading-snug">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Cài và đăng nhập Claude Code (trên máy đang chạy ứng dụng). */
export function ClaudeCodeSetup({ runner, reload }: { runner: Runner | null; reload: (refresh?: boolean) => void }) {
  const a = useAction();
  const [login, setLogin] = useState<{ opened: boolean; command: string; reason?: string } | null>(null);
  const installing = !!runner?.install.running;
  useEffect(() => {
    if (!installing) return;
    const t = setInterval(() => reload(), 2000);
    return () => clearInterval(t);
  }, [installing, reload]);
  if (!runner) return <p className="mt-3 text-sm text-soft">Đang kiểm tra Claude Code trên máy này…</p>;
  const step = !runner.installed ? 1 : runner.loggedIn === false ? 2 : 0;
  return (
    <div className="mt-3 space-y-3">
      <ol className="space-y-3 text-sm">
        <li className="flex gap-2.5">
          <span className={`rail-node num ${runner.installed ? "bg-brand text-white" : "bg-ink text-white"}`} aria-hidden="true">1</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{runner.installed ? `Đã cài Claude Code${runner.version ? ` ${runner.version}` : ""}` : "Cài Claude Code"}</div>
            {!runner.installed && (
              <>
                <p className="mt-0.5 text-[13px] text-soft">Ứng dụng chạy trình cài chính thức của Anthropic trên máy tính đang chạy ứng dụng (cần mạng, khoảng 1–3 phút, không cần quyền quản trị).</p>
                <button type="button" className="btn btn-primary mt-2" disabled={installing || a.busy} onClick={() => a.run(async () => { await api("/claude-code/install", { method: "POST" }); reload(); })}>{installing ? "Đang cài…" : "Cài Claude Code"}</button>
              </>
            )}
            {(installing || runner.install.log.length > 1) && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-2 text-[12px] leading-snug text-soft" aria-label="Tiến trình cài">{runner.install.log.slice(-8).join("\n")}</pre>}
            {runner.install.error && <p className="mt-1 text-[13px] text-danger">{runner.install.error}</p>}
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className={`rail-node num ${runner.loggedIn ? "bg-brand text-white" : step === 2 ? "bg-ink text-white" : "bg-[#e4e9e7] text-soft"}`} aria-hidden="true">2</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{runner.loggedIn ? "Đã đăng nhập tài khoản Claude" : "Đăng nhập Claude Code"}</div>
            {runner.installed && !runner.loggedIn && (
              <>
                <p className="mt-0.5 text-[13px] text-soft">Mở một cửa sổ dòng lệnh mới chạy <code>claude</code> trên máy tính đang chạy ứng dụng. Trong cửa sổ đó chọn <b className="font-medium text-ink">đăng nhập bằng tài khoản Claude</b> (gói Pro, Max, Team…), làm theo trang mở trong trình duyệt, xong gõ <code>/exit</code> rồi bấm <b className="font-medium text-ink">Kiểm tra lại</b>.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={`btn ${step === 2 ? "btn-primary" : ""}`} disabled={a.busy} onClick={() => a.run(async () => setLogin(await api("/claude-code/login", { method: "POST" })))}>Đăng nhập Claude Code</button>
                  <button type="button" className="btn" onClick={() => reload(true)}>Kiểm tra lại</button>
                </div>
                {login?.opened && <p className="msg mt-2 text-[13px] text-brand-dark">Đã mở cửa sổ Claude Code – làm theo hướng dẫn trong cửa sổ đó.</p>}
                {login && !login.opened && <p className="msg mt-2 text-[13px]">{login.reason}. Mở dòng lệnh trong thư mục ứng dụng và chạy: <code className="select-all break-all">{login.command}</code></p>}
                {runner.loggedIn === null && <p className="mt-1 text-[13px] text-soft">Chưa xác định được trạng thái đăng nhập – nếu đã đăng nhập thì cứ chạy.</p>}
              </>
            )}
          </div>
        </li>
      </ol>
      <Msg msg={a.msg} />
    </div>
  );
}

/** Xác nhận rồi chạy Claude Code. `ask(req)` mở hộp; đã bật "tự chạy không hỏi" và sẵn sàng → gửi luôn. */
export function useClaudeCode(onDone?: (msg: string) => void) {
  const [req, setReq] = useState<(CcInput & { what?: string }) | null>(null);
  const opener = useRef<Element | null>(null);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [noAsk, setNoAsk] = useState(false);
  const a = useAction();
  const load = useCallback(async (refresh = false) => {
    const r = await api<Runner>(`/claude-code/runner${refresh ? "?refresh=1" : ""}`);
    setRunner(r);
    return r;
  }, []);
  const send = (r: CcInput, run: boolean) =>
    a.run(async () => {
      const res = await api<{ run: RunStart; duplicate?: boolean; merged?: boolean; status: CcStatus }>("/claude-code/requests", { method: "POST", json: { projectId: r.pid, kind: r.kind, videoKey: r.videoKey, sceneId: r.sceneId, fileId: r.fileId, note: r.note, run } });
      if (run && noAsk) await api("/claude-code/settings", { method: "POST", json: { auto: true } });
      setReq(null);
      const m = res.duplicate
        ? `Việc này đã có trong hàng đợi (${STATUS[res.status][0].toLowerCase()}) – không tạo thêm`
        : res.merged
          ? "Đã gộp yêu cầu vào việc sửa cảnh đang chờ"
          : run || res.run ? runMsg(res.run) : "Đã gửi vào hàng đợi – chạy Claude Code khi đã cài và đăng nhập (trang Claude AI)";
      a.setMsg({ ok: true, text: m });
      onDone?.(m);
    });
  const ask = (r: CcInput & { what?: string }) => {
    opener.current = document.activeElement;
    return a.run(async () => {
      const cur = await load().catch(() => null);
      if (cur?.auto && ready(cur)) return send(r, true);
      setNoAsk(false);
      setReq(r);
    });
  };
  const ok = ready(runner);
  const dialog = req && (
    <Modal title={ok ? "Chạy Claude Code trên máy này?" : "Cần cài Claude Code trước"} onClose={() => setReq(null)} opener={opener.current}>
      <p className="mt-2 text-sm">
        Claude Code sẽ chạy trên máy này bằng <b className="font-medium">gói Claude đã đăng ký</b> (không tốn tiền API) để {req.what ?? WHAT[req.kind]}
        {req.videoKey ? <> cho <span className="num font-medium">{[req.videoKey, req.sceneId].filter(Boolean).join(" · ")}</span></> : null}. Claude Code chỉ được dùng lệnh <code>pnpm cvs</code> của ứng dụng.
      </p>
      {req.note && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-[13px] text-soft">«{req.note.length > 200 ? `${req.note.slice(0, 200)}…` : req.note}»</p>}
      {!ok && <ClaudeCodeSetup runner={runner} reload={(f) => void load(f)} />}
      {ok && (
        <label className="mt-3 flex items-start gap-2 text-[13px] text-soft">
          <input type="checkbox" className="mt-0.5" checked={noAsk} onChange={(e) => setNoAsk(e.target.checked)} />
          <span>Không hỏi lại (tự chạy Claude Code mỗi khi gửi việc – tắt ở trang Claude AI)</span>
        </label>
      )}
      <Msg msg={a.msg && !a.msg.ok ? a.msg : null} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={() => setReq(null)}>Huỷ</button>
        {ok ? (
          <button type="button" className="btn btn-primary" disabled={a.busy} onClick={() => send(req, true)}>Đồng ý, chạy ngay</button>
        ) : (
          <button type="button" className="btn" disabled={a.busy} onClick={() => send(req, false)}>Chỉ gửi vào hàng đợi</button>
        )}
      </div>
      {!ok && (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-soft">Hoặc tự mở Claude Code</summary>
          <div className="mt-2"><ClaudeCodeHowTo /></div>
        </details>
      )}
    </Modal>
  );
  return { ask, dialog, busy: a.busy, msg: a.msg };
}

/** Nút giao một việc AI cho Claude Code (luôn có; nút chính khi không có Claude API). */
export function ClaudeCodeButton({ pid, kind, videoKey, sceneId, fileId, note, what, label = "Gửi cho Claude Code", primary, disabled, title, onSent }: {
  pid: string; kind: CcKind; videoKey?: string; sceneId?: string; fileId?: string; note?: string; what?: string; label?: string; primary?: boolean; disabled?: boolean; title?: string; onSent?: () => void;
}) {
  const cc = useClaudeCode(() => onSent?.());
  // đã có việc giống hệt đang chờ/đang làm → khoá nút (riêng "sửa cảnh" vẫn gửi được: nội dung mới được gộp vào việc đang chờ)
  const q = new URLSearchParams({ projectId: pid, status: "pending,running", ...(videoKey ? { videoKey } : {}), ...(fileId ? { fileId } : {}) });
  const act = useApi<CcReq[]>(`/claude-code/requests?${q}`, 4000);
  const busy = kind !== "revise" ? act.data?.find((r) => r.kind === kind && (r.video_key ?? undefined) === videoKey && (r.scene_id ?? undefined) === sceneId && (r.file_id ?? undefined) === fileId) : undefined;
  return (
    <>
      <button type="button" className={`btn ${primary && !busy ? "btn-primary" : ""}`} disabled={disabled || !!busy} title={busy ? "Việc này đã được giao cho Claude Code – xem trạng thái bên dưới" : title ?? "Claude Code (gói Claude đã đăng ký, không tốn phí API) làm việc này trên máy này"} onClick={() => cc.ask({ pid, kind, videoKey, sceneId, fileId, note, what })}>{busy ? STATUS[busy.status][0] : label}</button>
      {cc.dialog}
      {cc.msg && !cc.msg.ok && !cc.dialog && <Msg msg={cc.msg} />}
    </>
  );
}

/** Câu dán vào Claude Code + nút chép (cách tự làm bằng tay). */
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

/** Nhật ký gần nhất của Claude Code. */
export function ClaudeCodeLog({ lines, max = 6 }: { lines: string[]; max?: number }) {
  if (!lines.length) return null;
  return <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink px-3 py-2 text-[12px] leading-relaxed text-white/80" aria-label="Nhật ký Claude Code">{lines.slice(-max).join("\n")}</pre>;
}

/** Yêu cầu đã gửi cho Claude Code (lọc theo video/cảnh/loại) + trạng thái chạy. Không có gì → không hiện. */
export function ClaudeCodeStatus({ pid, videoKey, sceneId, fileId, kinds, limit = 3, howTo = true, log = true }: { pid?: string; videoKey?: string; sceneId?: string; fileId?: string; kinds?: CcKind[]; limit?: number; howTo?: boolean; log?: boolean }) {
  const q = new URLSearchParams();
  if (pid) q.set("projectId", pid);
  if (videoKey) q.set("videoKey", videoKey);
  if (fileId) q.set("fileId", fileId);
  const { data, reload } = useApi<CcReq[]>(`/claude-code/requests?${q}`, 3000);
  const rows = (data ?? []).filter((r) => (!sceneId || r.scene_id === sceneId) && (!kinds || kinds.includes(r.kind)));
  const open = rows.filter((r) => r.status === "pending" || r.status === "running");
  const running = rows.some((r) => r.status === "running");
  const runner = useApi<Runner>(open.length ? "/claude-code/runner" : null, running ? 2000 : 6000);
  const a = useAction();
  // gộp các việc trùng (cùng loại + video + cảnh): việc đang mở hiện một dòng kèm số lần trùng; việc đã xong chỉ hiện lần mới nhất
  const keyOf = (r: CcReq) => `${r.kind}|${r.video_key ?? ""}|${r.scene_id ?? ""}`;
  const groups = new Map<string, CcReq[]>();
  for (const r of [...open.filter((r) => r.status === "running"), ...open.filter((r) => r.status === "pending"), ...rows.filter((r) => r.status !== "pending" && r.status !== "running")]) {
    const k = keyOf(r) + (r.status === "pending" || r.status === "running" ? "" : "|xong");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const doneKeys = new Set([...groups.keys()].filter((k) => !k.endsWith("|xong")).map((k) => `${k}|xong`));
  const items = [...groups.entries()].filter(([k]) => !doneKeys.has(k)).map(([, g]) => g);
  const shown = items.slice(0, Math.max(limit, items.filter((g) => g[0].status === "pending" || g[0].status === "running").length));
  const cancel = (ids: number[]) => a.run(async () => { for (const id of ids) await api(`/claude-code/requests/${id}`, { method: "PATCH", json: { status: "cancelled", message: "Người dùng huỷ" } }); reload(); });
  if (!shown.length) return null;
  const pending = open.length > 0 && !running;
  return (
    <div className="msg mt-3 rounded-lg bg-paper p-3 shadow-[0_0_0_1px_rgb(19_34_43/0.08)]">
      <div className="text-[13px] font-semibold">Việc đã gửi cho Claude Code</div>
      <ul className="mt-1.5 space-y-1.5" aria-live="polite">
        {shown.map((g) => {
          const r = g[0];
          const extra = g.filter((x) => x.status === "pending" && x.id !== r.id);
          return (
          <li key={r.id} className="text-[13px]">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
              <span className="font-medium">{KIND[r.kind] ?? r.kind}</span>
              <span className="num text-soft">{[r.video_key ?? (r.file_id ? "cả tài liệu" : pid ? "mọi video" : r.project_id), r.scene_id].filter(Boolean).join(" · ")}</span>
              {extra.length > 0 && <span className="text-soft">(+{extra.length} lần bấm trùng)</span>}
              {(r.status === "pending" || extra.length > 0) && (
                <button type="button" className="ml-auto min-h-8 px-1 text-[12px] text-soft underline" disabled={a.busy} onClick={() => cancel(r.status === "pending" ? g.filter((x) => x.status === "pending").map((x) => x.id) : extra.map((x) => x.id))}>
                  {r.status === "pending" ? "Huỷ" : "Huỷ việc trùng"}
                </button>
              )}
            </span>
            {r.note && <span className="mt-0.5 block text-soft">«{r.note.length > 140 ? `${r.note.slice(0, 140)}…` : r.note}»</span>}
            {r.message && r.status !== "running" && <span className="mt-0.5 block">{r.message}</span>}
          </li>
          );
        })}
      </ul>
      {log && running && runner.data && <ClaudeCodeLog lines={runner.data.lastLog} />}
      {pending && runner.data && (
        <div className="mt-3 border-t border-line pt-2.5">
          {ready(runner.data) ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={a.busy || runner.data.running} onClick={() => a.run(async () => { const r = await api<RunStart>("/claude-code/run", { method: "POST" }); a.setMsg({ ok: true, text: runMsg(r) }); reload(); runner.reload(); })}>Chạy Claude Code ngay</button>
              <span className="text-[13px] text-soft">Chạy trên máy này bằng gói Claude đã đăng ký; chỉ dùng lệnh <code>pnpm cvs</code>.</span>
            </div>
          ) : (
            <p className="text-[13px] text-soft">Claude Code {runner.data.installed ? "chưa đăng nhập" : "chưa cài"} trên máy này – vào <a className="text-brand underline" href="/claude">Kết nối Claude AI</a> để {runner.data.installed ? "đăng nhập" : "cài"} rồi chạy.</p>
          )}
          <Msg msg={a.msg} />
          {howTo && (
            <details className="mt-2 text-[13px]">
              <summary className="cursor-pointer text-soft">Hoặc tự mở Claude Code</summary>
              <div className="mt-2"><ClaudeCodeHowTo /></div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
