"use client";
// "Claude đọc và phân tích tài liệu": phần nào cần video, kịch bản trong tài liệu đủ chưa, làm theo script hay để Claude viết lại.
// Có Claude API → job analyze-doc (thanh tiến độ); không → giao cho Claude Code (hộp xác nhận). Kế hoạch → chọn cách làm → Áp dụng.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg, Progress } from "@/components/ui";
import { ClaudeCodeButton, ClaudeCodeStatus } from "@/components/claude-code";

type Mode = "follow-script" | "rewrite";
type Item = {
  key: string; fileName: string; unit: string; title: string; hasScript: boolean; issues: string[]; suggestedMode: Mode; reason: string;
  scenes: unknown[] | null; visualNotes?: { scene: string; template: string; note: string }[]; contextSummary?: string; proposed?: boolean;
  status: string; complete: boolean; sceneCount: number; exists: boolean; aiWritten: boolean;
};
type View = {
  file: { id: string; name: string; level: string };
  analyzable: boolean;
  plan: { by: "ai" | "claude-code"; at: string; notes?: string[] } | null;
  applied: { at: string } | null;
  items: Item[];
  job: { id: number; status: string; progress: number; message: string | null; error: string | null } | null;
};
type Applied = { followed: string[]; rewrite: string[]; skipped: string[]; jobs: number[]; requests: number[] };

const time = (s: string) => new Date(s).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function DocAnalysis({ pid, fileId, ai }: { pid: string; fileId: string; ai: boolean }) {
  const [poll, setPoll] = useState(3000);
  const { data, reload } = useApi<View>(`/projects/${pid}/files/${fileId}/plan`, poll);
  const running = data?.job && ["queued", "running"].includes(data.job.status);
  // chờ job hoặc Claude Code → làm mới nhanh; đã có kế hoạch → chậm lại
  useEffect(() => setPoll(running || !data?.plan ? 3000 : 15000), [running, data?.plan]);
  const a = useAction();
  if (!data) return null;
  if (!data.analyzable) return null;
  const analyze = () => a.run(async () => { await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "analyze-doc", payload: { fileId } } }); reload(); });
  const label = data.plan ? "Phân tích lại" : "Claude đọc và phân tích tài liệu";
  return (
    <section className="card mb-4" aria-labelledby={`doc-${fileId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 id={`doc-${fileId}`} className="font-semibold">Claude đọc và phân tích tài liệu</h2>
          <p className="mt-0.5 text-[13px] text-soft">
            <span className="font-medium text-ink">{data.file.name}</span> · Claude đọc cả tài liệu, chỉ ra khối nào cần làm video, kiểm kịch bản (lời thoại, ranh giới cảnh, chữ trên màn hình, số liệu) và đề xuất làm theo script hay viết lại.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ai ? (
            <button type="button" className={`btn ${data.plan ? "" : "btn-primary"}`} disabled={a.busy || !!running} onClick={analyze}>{running ? "Claude đang đọc…" : label}</button>
          ) : (
            <ClaudeCodeButton pid={pid} kind="analyze-doc" fileId={fileId} label={label} primary={!data.plan} what={`đọc và phân tích tài liệu «${data.file.name}»`} onSent={reload} />
          )}
        </div>
      </div>
      {running && (
        <div className="mt-3" aria-live="polite">
          <Progress value={data.job!.progress} />
          <p className="mt-1 text-[13px] text-soft">{data.job!.message ?? "Đang chờ lượt"}</p>
        </div>
      )}
      {data.job?.status === "failed" && <p className="msg mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">Phân tích lỗi: {data.job.error}</p>}
      <Msg msg={a.msg} />
      {!ai && <ClaudeCodeStatus pid={pid} fileId={fileId} kinds={["analyze-doc"]} limit={1} />}
      {data.plan ? <Plan pid={pid} fileId={fileId} view={data} ai={ai} reload={reload} /> : !running && <p className="mt-3 text-[13px] text-soft">Chưa phân tích – các video máy đã tự bóc vẫn dùng được ngay.</p>}
    </section>
  );
}

function Plan({ pid, fileId, view, ai, reload }: { pid: string; fileId: string; view: View; ai: boolean; reload: () => void }) {
  const videos = view.items.filter((i) => !i.proposed);
  const proposed = view.items.filter((i) => i.proposed);
  const [mode, setMode] = useState<Record<string, Mode>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Applied | null>(null);
  const a = useAction();
  const modeOf = (i: Item): Mode => mode[i.key] ?? (i.hasScript ? i.suggestedMode : "rewrite");
  const apply = () =>
    a.run(async () => {
      const choices = [...videos.map((i) => ({ key: i.key, mode: modeOf(i) })), ...proposed.map((i) => ({ key: i.key, include: !!on[i.key] }))];
      setDone(await api<Applied>(`/projects/${pid}/files/${fileId}/apply`, { method: "POST", json: { choices } }));
      reload();
    });
  const rewriting = videos.filter((i) => modeOf(i) === "rewrite").length + proposed.filter((i) => on[i.key]).length;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-[13px] text-soft">
        Kế hoạch của {view.plan!.by === "ai" ? "Claude" : "Claude Code"} · {time(view.plan!.at)} · <span className="num">{videos.length}</span> video{proposed.length ? <> · <span className="num">{proposed.length}</span> đề xuất thêm</> : null}
        {view.applied && <> · đã áp dụng {time(view.applied.at)}</>}
      </p>
      {view.plan!.notes?.map((n, k) => <p key={k} className="mt-1 text-[13px]">{n}</p>)}
      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {videos.map((i) => (
          <li key={i.key} className="rounded-lg border border-line p-3">
            <VideoHead i={i} />
            <Issues i={i} />
            <fieldset className="mt-2.5">
              <legend className="sr-only">Cách làm video {i.title}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                {(["follow-script", "rewrite"] as Mode[]).map((m) => (
                  <label key={m} className={`flex min-h-8 items-center gap-2 ${m === "follow-script" && !i.hasScript ? "opacity-45" : ""}`}>
                    <input type="radio" name={`mode-${i.key}`} checked={modeOf(i) === m} disabled={m === "follow-script" && !i.hasScript} onChange={() => setMode((x) => ({ ...x, [i.key]: m }))} />
                    {m === "follow-script" ? "Làm theo script" : "Để Claude viết lại script"}
                  </label>
                ))}
              </div>
            </fieldset>
            {modeOf(i) === "rewrite" && <p className="assume mt-2">Claude viết kịch bản mới từ nội dung bài – phải duyệt ở bước 4 trước khi làm giọng.</p>}
          </li>
        ))}
      </ul>
      {proposed.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Video đề xuất thêm</h3>
          <p className="text-[13px] text-soft">Bài ghi có video nhưng tài liệu chưa có khối video. Tắt mặc định – bật nếu muốn Claude viết kịch bản.</p>
          <ul className="mt-2 grid gap-3 lg:grid-cols-2">
            {proposed.map((i) => (
              <li key={i.key} className="rounded-lg border border-dashed border-line p-3">
                <VideoHead i={i} />
                {i.reason && <p className="mt-1 text-[13px] text-soft">{i.reason}</p>}
                <label className="mt-2 flex min-h-8 items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!on[i.key]} onChange={(e) => setOn((x) => ({ ...x, [i.key]: e.target.checked }))} />
                  Làm video này (Claude viết kịch bản)
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={a.busy} onClick={apply}>{a.busy ? "Đang áp dụng…" : "Áp dụng"}</button>
        <span className="text-[13px] text-soft">
          {rewriting ? `${rewriting} video sẽ được viết lại${ai ? "" : " bằng Claude Code"}` : "Mọi video làm theo script trong tài liệu (lời thoại giữ nguyên văn)"}
        </span>
      </div>
      <Msg msg={a.msg} />
      {done && (
        <p role="status" className="msg mt-2 rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand-dark">
          Đã áp dụng: {done.followed.length} video làm theo script{done.rewrite.length ? `, ${done.rewrite.length} video ${ai ? "đang được Claude viết lại" : "chờ Claude Code viết lại"}` : ""}{done.skipped.length ? `, bỏ qua ${done.skipped.length}` : ""}.{" "}
          <Link className="underline" href={`/p/${pid}/kich-ban`}>Xem kịch bản (bước 4)</Link>
        </p>
      )}
      {!ai && <ClaudeCodeStatus pid={pid} kinds={["write-script"]} limit={4} />}
    </div>
  );
}

function VideoHead({ i }: { i: Item }) {
  const tone = i.proposed ? "slate" : i.complete ? "green" : i.hasScript ? "amber" : "slate";
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-48 font-medium leading-snug">{i.title}</div>
        <span className="shrink-0 whitespace-nowrap"><Badge tone={tone}>{i.status}</Badge></span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-soft">
        <span>Bài {i.unit.replace(/^U/i, "") || "?"}</span>
        <span aria-hidden="true">·</span>
        <span className="num">{i.key}</span>
        {i.sceneCount > 0 && <><span aria-hidden="true">·</span><span className="num">{i.sceneCount} cảnh</span></>}
        {Array.isArray(i.scenes) && i.scenes.length > 0 && <Badge tone="blue">Claude đã sửa tách cảnh</Badge>}
        {i.aiWritten && <Badge tone="amber">AI viết – cần duyệt</Badge>}
      </div>
    </>
  );
}

function Issues({ i }: { i: Item }) {
  return (
    <>
      {i.issues.length ? (
        <ul className="mt-2 space-y-1 text-[13px]">
          {i.issues.map((x, k) => <li key={k} className="flex gap-1.5"><span aria-hidden="true" className="text-warn">•</span><span>{x}</span></li>)}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-soft">Claude không thấy vấn đề trong kịch bản.</p>
      )}
      {i.reason && <p className="mt-1.5 text-[13px] text-soft">{i.reason}</p>}
      {(i.contextSummary || i.visualNotes?.length) && (
        <details className="mt-1.5 text-[13px]">
          <summary className="cursor-pointer text-soft">Tóm tắt bài và gợi ý hình</summary>
          {i.contextSummary && <p className="mt-1">{i.contextSummary}</p>}
          {i.visualNotes?.length ? (
            <ul className="mt-1 space-y-0.5">
              {i.visualNotes.map((n) => <li key={n.scene}><span className="num font-medium">{n.scene}</span> · <code>{n.template}</code>{n.note ? ` – ${n.note}` : ""}</li>)}
            </ul>
          ) : null}
        </details>
      )}
    </>
  );
}
