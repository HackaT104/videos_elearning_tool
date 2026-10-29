"use client";
import Link from "next/link";
import { api, fileUrl, fmtSec } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { CitLight } from "@/components/cit";
import { Badge, Msg, PageHead, Progress, STATUS_LABEL } from "@/components/ui";

const STEPS: [string, string][] = [["voice", "Giọng"], ["voice", "Cắt/giãn"], ["timing", "Timing"], ["design", "Dựng cảnh"], ["qa", "QA"], ["render", "Render"]];
const ORDER = ["voice", "timing", "design", "build", "qa", "render"];

type Job = { id: number; project_id: string; video_key: string | null; kind: string; status: string; step: string | null; progress: number; message: string | null; error: string | null; created_at: string };

export default function SanXuat() {
  const { project } = useProject();
  const pid = project!.id;
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`, 2000);
  const jobs = useApi<Job[]>(`/projects/${pid}/jobs`, 2500);
  const storage = useApi<{ storage: string }>("/health");
  const a = useAction();
  const todo = vids.data?.filter((v) => v.include && !v.existing) ?? [];
  const enqueue = (kind: string, keys: string[], payload: unknown = {}, ok = "Đã xếp hàng") => a.run(async () => { await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind, keys, payload } }); vids.reload(); jobs.reload(); }, ok);
  const act = (id: number, action: string) => a.run(async () => { await api(`/jobs/${id}`, { method: "PATCH", json: { action } }); vids.reload(); jobs.reload(); });
  return (
    <div>
      <PageHead step={7} title="Sản xuất">
        <CitLight />
        <button className="btn btn-primary" disabled={!todo.length || a.busy} onClick={() => enqueue("produce", todo.filter((v) => !v.job).map((v) => v.key), {}, `Đã xếp hàng ${todo.length} video`)}>Sản xuất tất cả ({todo.length})</button>
      </PageHead>
      <Msg msg={a.msg} />
      <div className="space-y-3">
        {todo.map((v) => {
          const j = v.job;
          const failed = jobs.data?.find((x) => x.video_key === v.key)?.status === "failed" ? jobs.data?.find((x) => x.video_key === v.key) : null;
          const cur = j?.step ? ORDER.indexOf(j.step) : -1;
          return (
            <div key={v.key} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{v.key}</span>
                <span className="text-sm">{v.title}</span>
                <Badge tone={STATUS_LABEL[v.status]?.[1]}>{STATUS_LABEL[v.status]?.[0]}</Badge>
                {v.qaOk === true && <Badge tone="green">QA đạt</Badge>}
                {v.qaOk === false && <Badge tone="red">QA có lỗi</Badge>}
                <span className="text-xs text-soft">{fmtSec(v.seconds)}{v.estimated ? " (ước tính)" : ""} · {v.engine} · {v.voice.voiceId} ×{v.voice.speed}</span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {!j && <button className="btn btn-primary" onClick={() => enqueue("produce", [v.key])}>▶ Sản xuất</button>}
                  {j && j.status !== "paused" && <button className="btn" onClick={() => act(j.id, "pause")}>⏸ Tạm dừng</button>}
                  {j?.status === "paused" && <button className="btn" onClick={() => act(j.id, "resume")}>▶ Tiếp tục</button>}
                  {j && <button className="btn" onClick={() => act(j.id, "cancel")}>Hủy</button>}
                  {failed && !j && <button className="btn" onClick={() => act(failed.id, "retry")}>↻ Thử lại bước lỗi</button>}
                  <button className="btn" disabled={!!j} onClick={() => enqueue("visual", [v.key], {}, "Chỉ dựng lại hình (giữ giọng)")}>Chỉ dựng lại hình</button>
                  <button className="btn" disabled={!!j} onClick={() => enqueue("voice", [v.key], { forceVoice: true }, "Chỉ làm lại giọng")}>Chỉ làm lại giọng</button>
                  <button className="btn" disabled={!!j} onClick={() => enqueue("visual", [v.key], { redesign: true }, "Thiết kế lại các cảnh bằng AI")}>Thiết kế lại (AI)</button>
                  {v.rendered && <Link className="btn" href={`/p/${pid}/duyet/${encodeURIComponent(v.key)}`}>Xem & duyệt</Link>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-2">
                {STEPS.map(([s, label], i) => {
                  const idx = ORDER.indexOf(s);
                  const done = (j && cur > idx) || (!j && ["rendered", "approved"].includes(v.status)) || (!j && idx <= 1 && ["voiced", "designed"].includes(v.status));
                  const active = j && cur === idx && j.status === "running";
                  return (
                    <div key={i}>
                      <div className={`mb-1 text-xs ${active ? "font-semibold text-brand" : done ? "text-emerald-700" : "text-soft"}`}>{done ? "✓ " : active ? "● " : ""}{label}</div>
                      <Progress value={done ? 100 : active ? Math.max(5, j!.progress) : 0} tone={failed && !j ? "red" : "brand"} />
                    </div>
                  );
                })}
              </div>
              {j && <div className="mt-2 text-xs text-soft">{j.status === "queued" ? "Đang chờ lượt…" : j.status === "paused" ? "Đã tạm dừng" : j.message} · {Math.round(j.progress)}%</div>}
              {failed && !j && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">Lỗi: {failed.error}</div>}
            </div>
          );
        })}
      </div>
      <div className="card mt-5 overflow-x-auto">
        <h2 className="mb-2 font-semibold">Hàng đợi job</h2>
        <table className="tbl">
          <thead><tr><th>#</th><th>Loại</th><th>Video</th><th>Trạng thái</th><th>Tiến độ</th><th>Thông báo</th><th>Nhật ký</th></tr></thead>
          <tbody>
            {jobs.data?.slice(0, 40).map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td><td>{j.kind}</td><td className="font-mono text-xs">{j.video_key}</td>
                <td><Badge tone={j.status === "done" ? "green" : j.status === "failed" ? "red" : j.status === "running" ? "blue" : "slate"}>{j.status}</Badge></td>
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
