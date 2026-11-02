"use client";
import { useMemo, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject } from "@/lib/project";
import { GlossaryEditor } from "@/components/glossary";
import { Badge, Msg, PageHead } from "@/components/ui";
import { ClaudeCodeButton, ClaudeCodeStatus } from "@/components/claude-code";

type Row = { key: string; scene: string; idx: number; text: string; tts: string; locked: boolean; changed: boolean; rules: string[]; warnings: string[]; voice: any };

export default function Doc() {
  const { project } = useProject();
  const pid = project!.id;
  const { data, reload } = useApi<Row[]>(`/projects/${pid}/reading`);
  const [filter, setFilter] = useState<"changed" | "warn" | "all">("changed");
  const a = useAction();
  const rows = useMemo(() => (data ?? []).filter((r) => (filter === "all" ? true : filter === "warn" ? r.warnings.length > 0 : r.changed || r.warnings.length > 0)), [data, filter]);
  const warnCount = data?.filter((r) => r.warnings.length).length ?? 0;
  const claude = useApi<{ available: boolean }>("/claude/status", 15000);
  return (
    <div>
      <PageHead step={3} title="Chuẩn hoá cách đọc">
        {/* có API: agent tự sửa cách đọc khi sản xuất; không có → nhờ Claude Code (gói đã đăng ký) */}
        {claude.data?.available === false && warnCount > 0 && <ClaudeCodeButton pid={pid} kind="fix-readings" label="Nhờ Claude Code sửa cách đọc" />}
        <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api(`/projects/${pid}/normalize`, { method: "POST", json: {} }); await reload(); }, "Đã chuẩn hóa lại toàn bộ (giữ câu đã sửa tay)")}>Chuẩn hóa lại tất cả</button>
      </PageHead>
      <Msg msg={a.msg} />
      <div className="mb-3"><ClaudeCodeStatus pid={pid} kinds={["fix-readings"]} limit={1} /></div>
      <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        Bước bắt buộc trước khi tạo giọng: ứng dụng đổi ký hiệu, số, ngày tháng, viết tắt và thuật ngữ thành cách đọc tiếng Việt
        (ví dụ CO₂ → "xê ô hai", 01/01/2027 → "ngày một tháng một năm…"). Khi sản xuất, câu nào còn <b>chữ số, chữ viết tắt hoặc từ tiếng Anh</b> chưa
        xử lý sẽ <b>chặn bước tạo giọng</b>. Sửa trực tiếp ở cột bên phải (câu sửa tay coi như đã duyệt) hoặc thêm vào bảng thuật ngữ bên dưới.
      </div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        {(["changed", "warn", "all"] as const).map((f) => (
          <button key={f} className={`btn ${filter === f ? "btn-primary" : ""}`} onClick={() => setFilter(f)}>{f === "changed" ? "Câu bị đổi" : f === "warn" ? `Cảnh báo (${warnCount})` : "Tất cả"}</button>
        ))}
        <span className="text-soft">{rows.length} câu</span>
      </div>
      <div className="card mb-5 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="w-40">Video · cảnh</th><th className="w-[36%]">Trước (lời thoại)</th><th>Sau (cách đọc) – sửa trực tiếp</th><th className="w-28"></th></tr></thead>
          <tbody>{rows.map((r) => <ReadRow key={`${r.key}-${r.scene}-${r.idx}`} pid={pid} r={r} onSaved={reload} />)}</tbody>
        </table>
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold">Bảng thuật ngữ (glossary)</h2>
        <p className="mb-2 text-xs text-soft">Thêm thuật ngữ rồi bấm "Chuẩn hóa lại tất cả" để áp dụng. Thứ tự áp dụng: thay cụm dài trước.</p>
        <GlossaryEditor project={pid} />
      </div>
    </div>
  );
}

function ReadRow({ pid, r, onSaved }: { pid: string; r: Row; onSaved: () => void }) {
  const [tts, setTts] = useState(r.tts);
  const [audio, setAudio] = useState<string | null>(null);
  const a = useAction();
  const save = () => a.run(async () => { await api(`/projects/${pid}/videos/${encodeURIComponent(r.key)}/sentence`, { method: "PATCH", json: { scene: r.scene, idx: r.idx, tts } }); onSaved(); });
  const listen = () => a.run(async () => {
    const [job] = await api<any[]>(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "voice-sample", payload: { text: tts, voices: [r.voice] } } });
    for (let i = 0; i < 240; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      const j = await api<any>(`/jobs/${job.id}`);
      if (j.status === "done") { const res = j.result?.[0]; if (res?.error) throw new Error(res.error); setAudio(fileUrl(res.file)); return; }
      if (j.status === "failed") throw new Error(j.error);
    }
  });
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
        {r.locked && <Badge tone="blue">sửa tay</Badge>}
        {audio && <audio className="mt-1 h-8 w-full" src={audio} controls autoPlay />}
      </td>
      <td className="space-y-1">
        <button className="btn w-full justify-center" disabled={tts === r.tts || a.busy} onClick={save}>Lưu</button>
        <button className="btn w-full justify-center" disabled={a.busy} onClick={listen}>{a.busy ? "…" : "▶ Nghe thử"}</button>
        {a.msg && !a.msg.ok && <div className="text-xs text-danger">{a.msg.text}</div>}
      </td>
    </tr>
  );
}
