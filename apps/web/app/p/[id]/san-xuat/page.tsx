"use client";
import Link from "next/link";
import { useState } from "react";
import { api, fileUrl, fmtSec } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { CitLight } from "@/components/cit";
import { Badge, Check, Msg, PageHead, Progress, STATUS_LABEL } from "@/components/ui";
import { ClaudeCodeButton, ClaudeCodeStatus, useClaudeCode } from "@/components/claude-code";

// Mỗi video là một làn gồm 6 đoạn clip, theo đúng thứ tự các bước của worker.
const CLIPS = ["Chuẩn hoá", "Giọng", "Timing", "Dựng cảnh", "QA", "Render"];
const CLIP_OF: Record<string, number> = { normalize: 0, voice: 1, timing: 2, design: 3, build: 3, qa: 4, render: 5 };
type ClipState = "todo" | "queued" | "active" | "done" | "failed";
const CLIP_STATE_LABEL: Record<ClipState, string> = { todo: "chưa làm", queued: "đang chờ", active: "đang chạy", done: "xong", failed: "lỗi" };

/** Dấu ✓ vẽ nét khi video vừa render xong – khoảnh khắc "thưởng" duy nhất. */
function Tick() {
  return <svg className="tick" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const JOB_KIND: Record<string, string> = { produce: "Sản xuất", voice: "Giọng", visual: "Hình", render: "Render", design: "Dựng cảnh", "ai-script": "AI viết kịch bản", agent: "Agent Claude", "theme-preview": "Mẫu phong cách", "voice-sample": "Nghe thử giọng", revise: "Sửa theo góp ý" };
const JOB_STATUS: Record<string, string> = { queued: "Chờ", running: "Đang chạy", paused: "Tạm dừng", done: "Xong", failed: "Lỗi", cancelled: "Đã huỷ" };

type Job = { id: number; project_id: string; video_key: string | null; kind: string; status: string; step: string | null; progress: number; message: string | null; error: string | null; created_at: string };

export default function SanXuat() {
  const { project } = useProject();
  const pid = project!.id;
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`, 2000);
  const jobs = useApi<Job[]>(`/projects/${pid}/jobs`, 2500);
  const storage = useApi<{ storage: string }>("/health");
  const a = useAction();
  const prog = useApi<{ reading: number; styleConfirmed: boolean; citOk: boolean }>(`/projects/${pid}/progress`, 5000);
  const [ignoreReading, setIgnoreReading] = useState(false);
  const claude = useApi<{ available: boolean }>("/claude/status", 10000);
  // Claude Code (gói đã đăng ký) luôn có; Claude API chỉ hiện khi đã kết nối
  const cc = useClaudeCode((m) => a.setMsg({ ok: true, text: m }));
  const todo = vids.data?.filter((v) => v.include && !v.existing) ?? [];
  const pre = prog.data;
  const ready = !!pre && (pre.reading === 0 || ignoreReading) && pre.styleConfirmed && pre.citOk;
  const payload = { ignoreReading };
  const enqueue = (kind: string, keys: string[], payload: unknown = {}, ok = "Đã xếp hàng") => a.run(async () => { await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind, keys, payload } }); vids.reload(); jobs.reload(); }, ok);
  const act = (id: number, action: string) => a.run(async () => { await api(`/jobs/${id}`, { method: "PATCH", json: { action } }); vids.reload(); jobs.reload(); });
  return (
    <div>
      <PageHead step={7} title="Sản xuất">
        <CitLight />
        {claude.data?.available && <button className="btn" title="Claude API tự sửa cách đọc, thiết kế cảnh, soát hình rồi render" disabled={!todo.length || a.busy || !pre?.styleConfirmed || !pre?.citOk} onClick={() => enqueue("agent", todo.filter((v) => !v.job).map((v) => v.key), {}, `Agent Claude đang làm ${todo.length} video`)}>Để Claude làm tất cả</button>}
        <ClaudeCodeButton pid={pid} kind="agent" label="Để Claude Code làm tất cả" what={`làm trọn ${todo.length} video (sửa cách đọc, thiết kế cảnh, soát hình, render)`} disabled={!todo.length || !pre?.styleConfirmed || !pre?.citOk} title="Claude Code (gói đã đăng ký) sửa cách đọc, thiết kế cảnh, soát hình rồi render" />
        <button className="btn btn-primary" disabled={!todo.length || a.busy || !ready} onClick={() => enqueue("produce", todo.filter((v) => !v.job).map((v) => v.key), payload, `Đã xếp hàng ${todo.length} video`)}>Sản xuất tất cả ({todo.length})</button>
      </PageHead>
      <Msg msg={a.msg ?? (cc.msg && !cc.msg.ok ? cc.msg : null)} />
      {cc.dialog}
      <div className="mb-4"><ClaudeCodeStatus pid={pid} /></div>
      {pre && (
        <div className="card mb-4">
          <h2 className="mb-2 text-base font-semibold">Kiểm tra trước khi sản xuất</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2.5"><Check s={pre.reading === 0 ? "ok" : "warn"} />
              <span className="min-w-0"><span className="font-medium">Chuẩn hoá cách đọc:</span>{" "}
                {pre.reading === 0 ? "mọi câu đã đọc được" : <><Link className="text-brand underline" href={`/p/${pid}/doc`}>{pre.reading} câu còn chữ số, viết tắt hoặc từ tiếng Anh</Link>
                  <label className="mt-1 flex items-center gap-1.5 text-[13px] text-soft"><input type="checkbox" checked={ignoreReading} onChange={(e) => setIgnoreReading(e.target.checked)} /> Vẫn sản xuất, bỏ qua cảnh báo đọc</label></>}</span></li>
            <li className="flex items-start gap-2.5"><Check s={pre.styleConfirmed ? "ok" : "bad"} />
              <span className="min-w-0"><span className="font-medium">Phong cách:</span> {pre.styleConfirmed ? "đã chọn" : <Link className="text-brand underline" href={`/p/${pid}/phong-cach`}>chưa chọn, mở bước Chọn phong cách</Link>}</span></li>
            <li className="flex items-start gap-2.5"><Check s={claude.data?.available ? "ok" : "off"} />
              <span className="min-w-0"><span className="font-medium">Claude AI:</span> {claude.data?.available ? "đã kết nối API, dùng được agent" : <>chưa có API, việc AI do <b className="font-medium">Claude Code</b> (gói đã đăng ký) làm <Link className="text-brand underline" href="/claude">xem cách dùng</Link></>}</span></li>
            <li className="flex items-start gap-2.5"><Check s={pre.citOk ? "ok" : "bad"} />
              <span className="min-w-0"><span className="font-medium">CIT Voice Studio:</span> {pre.citOk ? "đang chạy" : <CitLight />}</span></li>
          </ul>
        </div>
      )}
      <div className="space-y-2.5">
        {todo.map((v) => {
          const j = v.job;
          const lastJob = jobs.data?.find((x) => x.video_key === v.key);
          const failed = !j && lastJob?.status === "failed" ? lastJob : null;
          const cur = j?.step ? CLIP_OF[j.step] ?? -1 : -1;
          const failAt = failed?.step ? CLIP_OF[failed.step] ?? -1 : -1;
          const finished = !j && ["rendered", "approved"].includes(v.status);
          const voiced = !j && ["voiced", "designed"].includes(v.status);
          const state = (i: number): ClipState => {
            if (failed && i === failAt) return "failed";
            if (j) return cur > i ? "done" : cur === i ? (j.status === "running" ? "active" : "queued") : "todo";
            if (finished || (failed && i < failAt)) return "done";
            if (voiced && i <= 2) return "done";
            return "todo";
          };
          return (
            <div key={v.key} className="card p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="num text-[13px] font-semibold">{v.key}</span>
                <span className="order-last w-full text-sm sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate">{v.title}</span>
                <span className="num text-[12px] text-soft">{fmtSec(v.seconds)}{v.estimated ? " ước tính" : ""}</span>
                <Badge tone={STATUS_LABEL[v.status]?.[1]}>{finished && v.status === "rendered" && <Tick />}{STATUS_LABEL[v.status]?.[0]}</Badge>
                {v.qaOk === true && <Badge tone="green">QA đạt</Badge>}
                {v.qaOk === false && <Badge tone="red">QA có lỗi</Badge>}
              </div>
              <div className="track mt-3" role="list" aria-label={`Tiến độ ${v.key}`}>
                {CLIPS.map((label, i) => {
                  const st = state(i);
                  const pct = st === "active" ? Math.max(3, j!.progress) : st === "done" ? 100 : 0;
                  return (
                    <div key={label} role="listitem" className="clip" data-state={st} title={`${label}: ${CLIP_STATE_LABEL[st]}`}>
                      {st === "active" && <><i className="fill" style={{ transform: `scaleX(${pct / 100})` }} /><i className="head" style={{ transform: `translateX(${pct}%)` }} /></>}
                      <span className="flex items-center gap-1 truncate">
                        {st === "done" && <svg className="shrink-0" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        <span className="truncate">{label}</span>
                        {st === "active" && <span className="num ml-auto pl-1">{Math.round(pct)}%</span>}
                        {st === "failed" && <span className="ml-auto pl-1">lỗi</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
              {j && <div className="num mt-2 text-[12px] text-soft">{j.status === "queued" ? "Đang chờ lượt…" : j.status === "paused" ? "Đã tạm dừng" : j.message}</div>}
              {failed && (
                <div className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[13px] text-danger">
                  {failed.error}
                  {/đọc sai/.test(failed.error ?? "") && <> <Link className="font-medium underline" href={`/p/${pid}/doc`}>Mở bước Chuẩn hoá cách đọc</Link></>}
                  {/phong cách/.test(failed.error ?? "") && <> <Link className="font-medium underline" href={`/p/${pid}/phong-cach`}>Mở bước Chọn phong cách</Link></>}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {finished && <Link className="btn btn-primary" href={`/p/${pid}/duyet/${encodeURIComponent(v.key)}`}>Xem và duyệt</Link>}
                {!j && <button className={`btn ${finished ? "" : "btn-primary"}`} disabled={!ready} onClick={() => enqueue("produce", [v.key], payload)}>{finished ? "Sản xuất lại" : "Sản xuất"}</button>}
                {!j && claude.data?.available && <button className="btn" disabled={!pre?.styleConfirmed || !pre?.citOk} title="Claude API làm trọn video này" onClick={() => enqueue("agent", [v.key], {}, "Agent Claude đang làm video này")}>Để Claude làm</button>}
                {!j && <ClaudeCodeButton pid={pid} kind="agent" videoKey={v.key} label="Để Claude Code làm" disabled={!pre?.styleConfirmed || !pre?.citOk} title="Claude Code (gói đã đăng ký) làm trọn video này" />}
                {j && j.status !== "paused" && <button className="btn" onClick={() => act(j.id, "pause")}>Tạm dừng</button>}
                {j?.status === "paused" && <button className="btn" onClick={() => act(j.id, "resume")}>Tiếp tục</button>}
                {j && <button className="btn" onClick={() => act(j.id, "cancel")}>Huỷ</button>}
                {failed && <button className="btn" onClick={() => act(failed.id, "retry")}>Chạy lại từ bước lỗi</button>}
                {v.rendered && !finished && <Link className="btn" href={`/p/${pid}/duyet/${encodeURIComponent(v.key)}`}>Xem và duyệt</Link>}
                <details className="menu sm:ml-auto">
                  <summary className="btn" aria-disabled={!!j}>Làm lại một phần</summary>
                  <div className="menu-pop">
                    <button disabled={!!j} onClick={() => enqueue("voice", [v.key], { forceVoice: true, ignoreReading }, "Đã xếp hàng làm lại giọng")}>Làm lại giọng<small>Giữ hình, đọc lại toàn bộ lời</small></button>
                    <button disabled={!!j} onClick={() => enqueue("visual", [v.key], {}, "Đã xếp hàng dựng lại hình")}>Dựng lại hình<small>Giữ giọng, dựng và render lại</small></button>
                    {claude.data?.available && <button disabled={!!j} onClick={() => enqueue("visual", [v.key], { redesign: true }, "Đã xếp hàng thiết kế lại bằng AI")}>Thiết kế lại cảnh bằng AI<small>Dùng Claude API</small></button>}
                    <button onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); cc.ask({ pid, kind: "design-video", videoKey: v.key }); }}>Thiết kế lại cảnh bằng Claude Code<small>Gói Claude đã đăng ký, chạy trên máy này</small></button>
                  </div>
                </details>
              </div>
              <div className="mt-2 text-[12px] text-soft">{v.engine === "remotion" ? "Remotion" : "HyperFrames"} · giọng {v.voice.voiceId} · tốc độ {v.voice.speed}</div>
            </div>
          );
        })}
      </div>
      <div className="card mt-5 overflow-x-auto">
        <h2 className="mb-2 text-base font-semibold">Hàng đợi</h2>
        <table className="tbl">
          <thead><tr><th>#</th><th>Loại</th><th>Video</th><th>Trạng thái</th><th>Tiến độ</th><th>Thông báo</th><th>Nhật ký</th></tr></thead>
          <tbody>
            {jobs.data?.slice(0, 40).map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td><td>{JOB_KIND[j.kind] ?? j.kind}</td><td className="text-[13px]">{j.video_key}</td>
                <td><Badge tone={j.status === "done" ? "green" : j.status === "failed" ? "red" : j.status === "running" ? "blue" : "slate"}>{JOB_STATUS[j.status] ?? j.status}</Badge></td>
                <td className="w-32"><Progress value={j.progress} /></td>
                <td className="text-xs">{j.error ?? j.message}</td>
                <td>{storage.data && <a className="text-xs text-brand underline" target="_blank" href={fileUrl(`${storage.data.storage}/logs/job-${j.id}.log`)}>log</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
