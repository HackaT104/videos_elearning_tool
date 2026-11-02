"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject } from "@/lib/project";
import { GlossaryEditor } from "@/components/glossary";
import { Badge, ErrorBox, Msg, PageHead, Progress } from "@/components/ui";
import { ClaudeCodeButton, ClaudeCodeStatus } from "@/components/claude-code";

type Suggest = { tts: string; reason?: string; glossary?: { term: string; reading: string }[]; by: "ai" | "claude-code" };
type Row = { key: string; scene: string; idx: number; text: string; tts: string; locked: boolean; changed: boolean; rules: string[]; warnings: string[]; suggest: Suggest | null; voice: any };
type Job = { id: number; kind: string; status: string; progress: number; message: string | null; error: string | null };
type Filter = "suggest" | "changed" | "warn" | "all";

export default function Doc() {
  const { project } = useProject();
  const pid = project!.id;
  const claude = useApi<{ available: boolean }>("/claude/status", 15000);
  const jobs = useApi<Job[]>(`/projects/${pid}/jobs`, 4000);
  const ccPending = useApi<unknown[]>(`/claude-code/requests?projectId=${pid}&status=pending,running`, 5000);
  const job = jobs.data?.find((j) => j.kind === "reading-review") ?? null;
  const reviewing = !!job && ["queued", "running"].includes(job.status);
  // đang chờ Claude (API hoặc Claude Code) → làm mới bảng để đề xuất hiện dần
  const { data, reload } = useApi<Row[]>(`/projects/${pid}/reading`, reviewing || (ccPending.data?.length ?? 0) > 0 ? 3000 : 0);
  const [filter, setFilter] = useState<Filter>("changed");
  const a = useAction();
  const sugCount = data?.filter((r) => r.suggest).length ?? 0;
  const warnCount = data?.filter((r) => r.warnings.length).length ?? 0;
  const rows = useMemo(
    () => (data ?? []).filter((r) => (filter === "all" ? true : filter === "suggest" ? !!r.suggest : filter === "warn" ? r.warnings.length > 0 : r.changed || r.warnings.length > 0)),
    [data, filter],
  );
  // có đề xuất mới → mở tab đề xuất; rà soát xong → tải lại
  const prevSug = useRef(0);
  useEffect(() => {
    if (sugCount > 0 && prevSug.current === 0) setFilter("suggest");
    if (sugCount === 0 && filter === "suggest" && data) setFilter("changed");
    prevSug.current = sugCount;
  }, [sugCount, data, filter]);
  const wasReviewing = useRef(false);
  useEffect(() => {
    if (wasReviewing.current && !reviewing) reload();
    wasReviewing.current = reviewing;
  }, [reviewing, reload]);

  const review = () => a.run(async () => { await api(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "reading-review", keys: [null] } }); await jobs.reload(); });
  const acceptAll = () => a.run(async () => { const r = await api<{ accepted: number }>(`/projects/${pid}/reading/accept-all`, { method: "POST", json: {} }); await reload(); return r; }, "Đã chấp nhận mọi đề xuất của Claude");
  return (
    <div>
      <PageHead step={3} title="Chuẩn hoá cách đọc">
        {claude.data?.available && (
          <button className="btn btn-primary" disabled={reviewing || a.busy} onClick={review} title="Claude API đọc mọi câu và đề xuất cách đọc – bạn duyệt từng đề xuất">
            {reviewing ? "Claude đang rà soát…" : "Claude rà soát cách đọc"}
          </button>
        )}
        <ClaudeCodeButton pid={pid} kind="review-readings" label={claude.data?.available ? "Rà soát bằng Claude Code" : "Claude rà soát cách đọc"} primary={claude.data?.available === false} title="Claude Code (gói đã đăng ký) đọc mọi câu và đề xuất cách đọc – bạn duyệt từng đề xuất" onSent={() => ccPending.reload()} />
        <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api(`/projects/${pid}/normalize`, { method: "POST", json: {} }); await reload(); }, "Đã chuẩn hóa lại toàn bộ (giữ câu đã sửa tay)")}>Chuẩn hóa lại tất cả</button>
      </PageHead>
      <Msg msg={a.msg} />
      {reviewing && job && (
        <div className="card mb-3" aria-live="polite">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">Claude đang đọc từng câu</span><span className="num text-soft">{Math.round(job.progress)}%</span></div>
          <Progress value={job.progress} />
          {job.message && <div className="mt-1.5 text-[13px] text-soft">{job.message}</div>}
        </div>
      )}
      {job?.status === "failed" && <div className="mb-3"><ErrorBox error={`Rà soát cách đọc lỗi: ${job.error ?? ""}`} /></div>}
      <div className="mb-3"><ClaudeCodeStatus pid={pid} kinds={["review-readings", "fix-readings"]} limit={1} /></div>
      <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        Bước bắt buộc trước khi tạo giọng: ứng dụng đổi ký hiệu, số, ngày tháng, viết tắt và thuật ngữ thành cách đọc tiếng Việt
        (ví dụ CO₂ → "xê ô hai", 01/01/2027 → "ngày một tháng một năm…"). Khi sản xuất, câu nào còn <b>chữ số, chữ viết tắt hoặc từ tiếng Anh</b> chưa
        xử lý hoặc còn <b>đề xuất của Claude chưa duyệt</b> sẽ <b>chặn bước tạo giọng</b>. Bấm <b>Claude rà soát cách đọc</b> để Claude đọc mọi câu
        (kể cả câu không có cảnh báo) và đề xuất – đề xuất chỉ áp dụng khi bạn chấp nhận. Sửa trực tiếp ở cột bên phải (câu sửa tay coi như đã duyệt) hoặc thêm vào bảng thuật ngữ bên dưới.
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" role="tablist" aria-label="Lọc câu">
        {(["suggest", "changed", "warn", "all"] as const).filter((f) => f !== "suggest" || sugCount > 0).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`btn ${filter === f ? "btn-primary" : ""}`} onClick={() => setFilter(f)}>
            {f === "suggest" ? `Đề xuất của Claude (${sugCount})` : f === "changed" ? "Câu bị đổi" : f === "warn" ? `Cảnh báo (${warnCount})` : "Tất cả"}
          </button>
        ))}
        <span className="text-soft">{rows.length} câu</span>
      </div>
      {filter === "suggest" ? (
        <div className="mb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-soft">So sánh cách đọc hiện tại với đề xuất; chữ được đổi được tô màu. Chấp nhận = dùng đề xuất (khoá như sửa tay) và lưu thuật ngữ mới.</p>
            <button className="btn btn-primary" disabled={a.busy || sugCount === 0} onClick={acceptAll}>Chấp nhận tất cả ({sugCount})</button>
          </div>
          <ul className="space-y-3">{rows.map((r) => <SuggestCard key={`${r.key}-${r.scene}-${r.idx}`} pid={pid} r={r} onDone={reload} />)}</ul>
        </div>
      ) : (
        <div className="card mb-5 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="w-40">Video · cảnh</th><th className="w-[36%]">Trước (lời thoại)</th><th>Sau (cách đọc) – sửa trực tiếp</th><th className="w-28"></th></tr></thead>
            <tbody>{rows.map((r) => <ReadRow key={`${r.key}-${r.scene}-${r.idx}-${r.tts}`} pid={pid} r={r} onSaved={reload} onShowSuggest={() => setFilter("suggest")} />)}</tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h2 className="mb-2 font-semibold">Bảng thuật ngữ (glossary)</h2>
        <p className="mb-2 text-xs text-soft">Thêm thuật ngữ rồi bấm "Chuẩn hóa lại tất cả" để áp dụng. Thứ tự áp dụng: thay cụm dài trước.</p>
        {/* chấp nhận đề xuất có thể thêm thuật ngữ → tải lại bảng */}
        <GlossaryEditor key={sugCount} project={pid} />
      </div>
    </div>
  );
}

/** Nghe thử một câu bằng giọng của video (job voice-sample). */
function useListen(pid: string, voice: any) {
  const [audio, setAudio] = useState<string | null>(null);
  const a = useAction();
  const listen = (text: string) => a.run(async () => {
    setAudio(null);
    const [job] = await api<any[]>(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "voice-sample", payload: { text, voices: [voice] } } });
    for (let i = 0; i < 240; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      const j = await api<any>(`/jobs/${job.id}`);
      if (j.status === "done") { const res = j.result?.[0]; if (res?.error) throw new Error(res.error); setAudio(fileUrl(res.file)); return; }
      if (j.status === "failed") throw new Error(j.error);
    }
  });
  return { audio, listen, a };
}

/** So khớp theo từ (LCS, bỏ qua hoa thường và dấu câu): đánh dấu từ chỉ có ở một bên. */
function diffWords(a: string, b: string) {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  const n = (w: string) => w.toLowerCase().replace(/[.,;:!?…"“”«»()]/g, "");
  const L = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = n(x[i]) === n(y[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ka = x.map(() => false);
  const kb = y.map(() => false);
  for (let i = 0, j = 0; i < x.length && j < y.length; ) {
    if (n(x[i]) === n(y[j])) { ka[i++] = true; kb[j++] = true; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return { a: x.map((w, k) => [w, !ka[k]] as const), b: y.map((w, k) => [w, !kb[k]] as const) };
}

const Words = ({ w, kind }: { w: readonly (readonly [string, boolean])[]; kind: "del" | "ins" }) => (
  <>{w.map(([t, ch], k) => <Fragment key={k}>{k ? " " : ""}{!ch ? t : kind === "del" ? <del className="rounded bg-red-50 px-0.5 text-danger decoration-danger/60">{t}</del> : <ins className="rounded bg-brand-tint px-0.5 font-medium text-brand-dark no-underline">{t}</ins>}</Fragment>)}</>
);

function SuggestCard({ pid, r, onDone }: { pid: string; r: Row; onDone: () => void }) {
  const s = r.suggest!;
  const d = useMemo(() => diffWords(r.tts, s.tts), [r.tts, s.tts]);
  const a = useAction();
  const l = useListen(pid, r.voice);
  const act = (action: "accept" | "reject") => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(r.key)}/sentence`, { method: "PATCH", json: { scene: r.scene, idx: r.idx, action } }); onDone(); });
  return (
    <li className="card min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="num text-[12px] font-medium">{r.key} · {r.scene} · câu {r.idx + 1}</span>
        <Badge tone="blue">{s.by === "claude-code" ? "Claude Code" : "Claude"}</Badge>
        {r.locked && <Badge>đã sửa tay</Badge>}
      </div>
      <p className="mb-2 break-words text-[13px] text-soft"><span className="font-medium text-ink">Lời thoại:</span> {r.text}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg bg-paper px-3 py-2">
          <div className="mb-0.5 text-[12px] font-medium text-soft">Cách đọc hiện tại</div>
          <p className="break-words text-sm leading-relaxed"><Words w={d.a} kind="del" /></p>
        </div>
        <div className="min-w-0 rounded-lg bg-surface px-3 py-2 shadow-[0_0_0_1.5px_var(--color-brand)]">
          <div className="mb-0.5 text-[12px] font-medium text-brand-dark">Claude đề xuất</div>
          <p className="break-words text-sm leading-relaxed"><Words w={d.b} kind="ins" /></p>
        </div>
      </div>
      {s.reason && <p className="mt-2 break-words text-[13px]"><span className="font-medium">Lý do:</span> {s.reason}</p>}
      {s.glossary?.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-soft">Lưu vào thuật ngữ:</span>
          {s.glossary.map((g) => <Badge key={g.term}>{g.term} → {g.reading}</Badge>)}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={a.busy} onClick={() => act("accept")}>Chấp nhận</button>
        <button className="btn" disabled={a.busy} onClick={() => act("reject")}>Bỏ qua</button>
        <button className="btn" disabled={l.a.busy} onClick={() => l.listen(s.tts)}>{l.a.busy ? "Đang tạo giọng…" : "▶ Nghe thử đề xuất"}</button>
      </div>
      {l.audio && <audio className="mt-2 h-8 w-full" src={l.audio} controls autoPlay />}
      <Msg msg={a.msg ?? (l.a.msg && !l.a.msg.ok ? l.a.msg : null)} />
    </li>
  );
}

function ReadRow({ pid, r, onSaved, onShowSuggest }: { pid: string; r: Row; onSaved: () => void; onShowSuggest: () => void }) {
  const [tts, setTts] = useState(r.tts);
  const l = useListen(pid, r.voice);
  const a = useAction();
  const save = () => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(r.key)}/sentence`, { method: "PATCH", json: { scene: r.scene, idx: r.idx, tts } }); onSaved(); });
  const err = a.msg && !a.msg.ok ? a.msg : l.a.msg && !l.a.msg.ok ? l.a.msg : null;
  return (
    <tr>
      <td className="num whitespace-nowrap text-[12px] font-medium">{r.key}<br />{r.scene} · câu {r.idx + 1}</td>
      <td className="text-sm">{r.text}<div className="mt-1 flex flex-wrap gap-1">{r.rules.map((x) => <Badge key={x}>{x}</Badge>)}</div></td>
      <td>
        <textarea className="input text-sm" rows={3} value={tts} onChange={(e) => setTts(e.target.value)} />
        <div className="mt-1 flex flex-wrap gap-1">
          {["[nghỉ 500ms]", "[nghỉ 1s]", "[cười]", "[thở dài]", "[hắng giọng]"].map((t) => (
            <button key={t} type="button" className="rounded-lg border border-line px-1.5 py-0.5 text-[11px] text-soft hover:bg-paper" title="Thẻ điều khiển cách đọc của CIT Voice Studio" onClick={() => setTts((x) => `${x.trimEnd()} ${t}`)}>+ {t}</button>
          ))}
        </div>
        {r.warnings.map((w) => <div key={w} className="assume mt-1">⚠ {w}</div>)}
        {r.suggest && <button type="button" className="assume mt-1 block w-full text-left underline-offset-2 hover:underline" onClick={onShowSuggest}>Claude đề xuất: «{r.suggest.tts}» – xem để chấp nhận hoặc bỏ qua</button>}
        {r.locked && <Badge tone="blue">sửa tay</Badge>}
        {l.audio && <audio className="mt-1 h-8 w-full" src={l.audio} controls autoPlay />}
      </td>
      <td className="space-y-1">
        <button className="btn w-full justify-center" disabled={tts === r.tts || a.busy} onClick={save}>Lưu</button>
        <button className="btn w-full justify-center" disabled={l.a.busy} onClick={() => l.listen(tts)}>{l.a.busy ? "…" : "▶ Nghe thử"}</button>
        {err && <div className="text-xs text-danger">{err.text}</div>}
      </td>
    </tr>
  );
}
