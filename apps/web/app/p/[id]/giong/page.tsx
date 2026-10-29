"use client";
import { useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { CitLight } from "@/components/cit";
import { Msg, PageHead } from "@/components/ui";

type Voice = { provider: string; id: string; name: string; gender: string | null };
type Meta = { levels: Record<string, { label: string; voice: string; speed: number; pace: { lead: number; gap: number; tail: number } }>; edgeVoices: { female: string; male: string } };

export default function Giong() {
  const { project } = useProject();
  const pid = project!.id;
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`);
  const voices = useApi<Voice[]>("/tts/voices?provider=cit", 10000);
  const meta = useApi<Meta>("/meta");
  const a = useAction();
  const cit = voices.data?.map((v) => v.id) ?? [];
  const names = cit.length ? cit : ["Hải Đăng", "Trúc Ly"];
  const levels = [...new Set(vids.data?.map((v) => v.level) ?? [])];
  const setVideo = (key: string, patch: { voice?: any; pace?: any }) =>
    a.run(async () => {
      const row = await api<any>(`/projects/${pid}/videos/${encodeURIComponent(key)}`);
      const d = row.data;
      if (patch.voice) d.voice = { ...d.voice, ...patch.voice };
      if (patch.pace) d.pace = { ...d.pace, ...patch.pace };
      await api(`/projects/${pid}/videos/${encodeURIComponent(key)}`, { method: "PUT", json: d });
      vids.reload();
    });
  const preset = (level: string, body: any, ok: string) => a.run(async () => { await api(`/projects/${pid}/voice-preset`, { method: "POST", json: { level, ...body } }); vids.reload(); }, ok);
  return (
    <div>
      <PageHead step={5} title="Giọng & nhịp"><CitLight /></PageHead>
      <Msg msg={a.msg} />
      <div className="card mb-4">
        <h2 className="mb-2 font-semibold">Cấu hình theo cấp độ</h2>
        <table className="tbl">
          <thead><tr><th>Cấp độ</th><th>Mặc định</th><th>Áp dụng nhanh</th></tr></thead>
          <tbody>
            {levels.map((l) => {
              const tier = Number(l.match(/\d+/)?.[0] ?? 1) <= 1 ? "co-ban" : Number(l.match(/\d+/)?.[0]) === 2 ? "trung-cap" : "chuyen-sau";
              const p = meta.data?.levels[tier];
              return (
                <tr key={l}>
                  <td className="font-semibold">{l} · {p?.label}</td>
                  <td className="text-xs">{p?.voice === "alternate" ? "Xen kẽ nữ/nam" : p?.voice} · tốc độ {p?.speed} · nhịp {p?.pace.lead}/{p?.pace.gap}/{p?.pace.tail} s</td>
                  <td className="flex flex-wrap gap-1">
                    <button className="btn" onClick={() => preset(l, { resetPreset: true }, `${l}: đã đặt lại nhịp & tốc độ mặc định`)}>Đặt lại mặc định</button>
                    <button className="btn" onClick={() => preset(l, { alternate: [names.find((n) => /ly|my|lan|nữ/i.test(n)) ?? names[1] ?? names[0], names.find((n) => /đăng|nam|minh/i.test(n)) ?? names[0]] }, `${l}: xen kẽ nữ/nam`)}>Xen kẽ nữ/nam</button>
                    {names.map((n) => <button key={n} className="btn" onClick={() => preset(l, { voice: { voiceId: n, provider: "cit" } }, `${l}: một giọng ${n}`)}>Một giọng: {n}</button>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 text-xs text-soft">Không để im lặng quá 2,5 s ở bất kỳ đâu; chuyển cảnh ≈ tail + lead. "gap" chỉ chèn thêm vào chỗ ngắt hơi có sẵn, không cắt giữa từ.</div>
      </div>
      <Sample pid={pid} names={names} edge={meta.data?.edgeVoices} />
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Từng video</h2>
        <table className="tbl">
          <thead><tr><th>Video</th><th>Nguồn giọng</th><th>Giọng</th><th>Tốc độ</th><th>lead</th><th>gap</th><th>tail</th></tr></thead>
          <tbody>
            {vids.data?.filter((v) => v.include && !v.existing).map((v) => (
              <tr key={v.key}>
                <td className="font-mono text-xs">{v.key}</td>
                <td><select className="input" value={v.voice.provider} onChange={(e) => setVideo(v.key, { voice: { provider: e.target.value, voiceId: e.target.value === "edge" ? meta.data?.edgeVoices.male : names[0] } })}><option value="cit">CIT (mặc định)</option><option value="edge">Edge TTS (dự phòng)</option></select></td>
                <td>{v.voice.provider === "cit" ? (
                  <select className="input" value={v.voice.voiceId} onChange={(e) => setVideo(v.key, { voice: { voiceId: e.target.value } })}>{[...new Set([...names, v.voice.voiceId])].map((n) => <option key={n}>{n}</option>)}</select>
                ) : (
                  <select className="input" value={v.voice.voiceId} onChange={(e) => setVideo(v.key, { voice: { voiceId: e.target.value } })}><option value={meta.data?.edgeVoices.female}>HoaiMy (nữ)</option><option value={meta.data?.edgeVoices.male}>NamMinh (nam)</option></select>
                )}</td>
                <td><input type="number" step="0.05" min="0.6" max="1.4" className="input w-20" defaultValue={v.voice.speed} onBlur={(e) => setVideo(v.key, { voice: { speed: Number(e.target.value) } })} /></td>
                {(["lead", "gap", "tail"] as const).map((k) => <td key={k}><input type="number" step="0.1" min="0" max="2.4" className="input w-20" defaultValue={v.pace[k]} onBlur={(e) => setVideo(v.key, { pace: { [k]: Number(e.target.value) } })} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sample({ pid, names, edge }: { pid: string; names: string[]; edge?: { female: string; male: string } }) {
  const [text, setText] = useState("Từ ngày 01/01/2027, tiêu chuẩn VCS Version 5.0A yêu cầu mỗi VCU tương ứng 1 tCO₂e.");
  const [speeds, setSpeeds] = useState("0.9, 1.0");
  const [res, setRes] = useState<any[]>([]);
  const a = useAction();
  const go = () => a.run(async () => {
    const sp = speeds.split(",").map((x) => Number(x.trim())).filter(Boolean);
    const voices = names.flatMap((n) => sp.map((s) => ({ provider: "cit", voiceId: n, speed: s })));
    if (edge) voices.push({ provider: "edge", voiceId: edge.female, speed: 1 });
    const [job] = await api<any[]>(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "voice-sample", payload: { text, voices } } });
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const j = await api<any>(`/jobs/${job.id}`);
      if (j.status === "done") return setRes(j.result);
      if (j.status === "failed") throw new Error(j.error);
    }
  });
  return (
    <div className="card mb-4">
      <h2 className="mb-2 font-semibold">Nghe thử</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[420px] flex-1 text-xs">Câu mẫu (được chuẩn hóa cách đọc trước khi đọc)<input className="input mt-0.5" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="text-xs">Tốc độ<input className="input mt-0.5 w-32" value={speeds} onChange={(e) => setSpeeds(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={a.busy} onClick={go}>{a.busy ? "Đang đọc…" : "▶ Nghe thử các giọng"}</button>
      </div>
      <Msg msg={a.msg} />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {res.map((r, i) => (
          <div key={i} className="rounded border border-line p-2 text-sm">
            <div className="mb-1 font-medium">{r.voice.provider.toUpperCase()} · {r.voice.voiceId} · ×{r.voice.speed}</div>
            {r.error ? <div className="text-xs text-red-700">{r.error}</div> : <audio className="h-8 w-full" controls src={fileUrl(r.file)} />}
          </div>
        ))}
      </div>
    </div>
  );
}
