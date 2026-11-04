"use client";
import { useMemo, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { waitJob } from "@/lib/jobs";
import { useProject, type VideoSum } from "@/lib/project";
import { CitLight } from "@/components/cit";
import { ZerottsLight } from "@/components/zerotts";
import { MusicSettings } from "@/components/music-settings";
import { Badge, Msg, PageHead } from "@/components/ui";

type Voice = { provider: string; id: string; name: string; gender: string | null; region: string | null; description: string | null; cloned: number | null };
type Meta = { levels: Record<string, { label: string; voice: string; speed: number; pace: { lead: number; gap: number; tail: number } }>; edgeVoices: { female: string; male: string } };

const REGION: Record<string, string> = { North: "Bắc", Central: "Trung", South: "Nam" };
type Engine = "cit" | "zerotts";
const ENGINES: { id: Engine; label: string; note: string }[] = [
  { id: "cit", label: "CIT Voice Studio", note: "Mặc định · nhiều giọng, thẻ biểu cảm" },
  { id: "zerotts", label: "ZeroTTS (MIT, 8 giọng)", note: "Tuỳ chọn · cài thêm khi cần" },
];
const tierOf = (l: string) => { const n = Number(l.match(/\d+/)?.[0] ?? 1); return n <= 1 ? "co-ban" : n === 2 ? "trung-cap" : "chuyen-sau"; };

export default function GiongCit() {
  const { project } = useProject();
  const pid = project!.id;
  const vids = useApi<VideoSum[]>(`/projects/${pid}/videos`);
  const meta = useApi<Meta>("/meta");
  const a = useAction();
  const active = useMemo(() => vids.data?.filter((v) => v.include && !v.existing) ?? [], [vids.data]);
  // nguồn giọng đang xem: mặc định CIT; nếu video đầu tiên đã dùng ZeroTTS thì mở sẵn ZeroTTS
  const [engineSel, setEngine] = useState<Engine | null>(null);
  const engine: Engine = engineSel ?? (active[0]?.voice.provider === "zerotts" ? "zerotts" : "cit");
  const voices = useApi<Voice[]>(`/tts/voices?provider=${engine}`, 10000);
  const citVoices = useApi<Voice[]>("/tts/voices?provider=cit", 30000);
  const zVoices = useApi<Voice[]>("/tts/voices?provider=zerotts", 30000);
  const levels = [...new Set(active.map((v) => v.level))];

  // phạm vi áp dụng: "all" | "level:L1" | "video:KEY"
  const [scope, setScope] = useState("all");
  const scopeBody = () => (scope === "all" ? {} : scope.startsWith("level:") ? { level: scope.slice(6) } : { keys: [scope.slice(6)] });
  const scopeLabel = scope === "all" ? "cả dự án" : scope.startsWith("level:") ? `cấp độ ${scope.slice(6)}` : scope.slice(6);
  const apply = (body: Record<string, unknown>, ok: string) => a.run(async () => { await api(`/projects/${pid}/voice-preset`, { method: "POST", json: { ...scopeBody(), ...body } }); vids.reload(); }, ok);

  // bộ lọc giọng
  const [gender, setGender] = useState("");
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const list = (voices.data ?? []).filter((v) => (!gender || v.gender === gender) && (engine !== "cit" || !region || v.region === region) && (!q || `${v.id} ${v.name} ${v.description}`.toLowerCase().includes(q.toLowerCase())));

  // tuỳ chọn đọc
  const first = active[0]?.voice;
  const [speed, setSpeed] = useState(first?.speed ?? 0.95);
  const [temp, setTemp] = useState(first?.temperature ?? 0.8);
  const [fixedSeed, setFixedSeed] = useState(first?.seed !== undefined && first?.seed !== null);
  const [seed, setSeed] = useState<number>(first?.seed ?? 2026);
  const [useDict, setUseDict] = useState(first?.useDict ?? true);

  // nghe thử
  const [sample, setSample] = useState("Từ ngày 01/01/2027, tiêu chuẩn VCS Version 5.0A yêu cầu mỗi VCU tương ứng 1 tCO₂e.");
  const [audio, setAudio] = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const listen = (voiceId: string) =>
    a.run(async () => {
      setPlaying(voiceId);
      const voice = { provider: engine, voiceId, speed, temperature: temp, seed: fixedSeed ? seed : null, ...(engine === "cit" ? { useDict } : {}) };
      const [job] = await api<any[]>(`/projects/${pid}/jobs`, { method: "POST", json: { kind: "voice-sample", payload: { text: sample, voices: [voice] } } });
      const j = await waitJob(job.id);
      const r = j.result?.[0];
      if (r?.error) throw new Error(r.error);
      setAudio((x) => ({ ...x, [voiceId]: fileUrl(r.file) }));
      setPlaying(null);
    });

  return (
    <div>
      <PageHead step={6} title="Giọng đọc" />
      <div className="mb-3 grid max-w-xl grid-cols-2 gap-1.5" role="group" aria-label="Nguồn giọng">
        {ENGINES.map((e) => (
          <button key={e.id} type="button" aria-pressed={engine === e.id} onClick={() => { setEngine(e.id); setGender(""); setRegion(""); }} className={`seg ${engine === e.id ? "is-on" : ""}`}>
            <span className="font-semibold">{e.label}</span>
            <span className="text-[12px] opacity-75">{e.note}</span>
          </button>
        ))}
      </div>
      <div className="mb-4">{engine === "cit" ? <CitLight full /> : <ZerottsLight full />}</div>
      <p className="-mt-2 mb-4 text-xs text-soft">
        {engine === "cit"
          ? "CIT Voice Studio được cài và chạy kèm ứng dụng (thư mục vendor/cit), tự bật khi khởi động và tự bật lại nếu bị tắt. Dùng CIT là đồng ý Điều khoản sử dụng của CIT."
          : "ZeroTTS là mô hình đọc tiếng Việt mã nguồn mở (MIT), chạy trên CPU trong máy. Chỉ cài khi bạn bấm Cài: ứng dụng tạo môi trường Python riêng trong vendor/zerotts, tải mô hình và dựng bản int8 cho nhanh. Sau khi cài, ZeroTTS tự bật cùng ứng dụng."}
      </p>
      <Msg msg={a.msg} />

      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">Áp dụng cho
            <select className="input mt-0.5 w-64" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Cả dự án ({active.length} video)</option>
              {levels.map((l) => <option key={l} value={`level:${l}`}>Cấp độ {l} · {meta.data?.levels[tierOf(l)]?.label}</option>)}
              {active.map((v) => <option key={v.key} value={`video:${v.key}`}>{v.key}</option>)}
            </select>
          </label>
          <label className="min-w-[280px] flex-1 text-xs">Câu nghe thử (được chuẩn hoá cách đọc trước khi đọc)
            <input className="input mt-0.5" value={sample} onChange={(e) => setSample(e.target.value)} />
          </label>
        </div>
        <p className="mt-2 text-xs text-soft">Mọi thay đổi ở trang này chỉ áp dụng cho phạm vi đã chọn ({scopeLabel}). Đổi giọng hoặc tuỳ chọn thì chỉ các cảnh bị ảnh hưởng mới tạo lại giọng.</p>
      </div>

      <div className="card mb-4">
        <h2 className="mb-2 font-semibold">Tuỳ chọn đọc</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Tốc độ đọc: <b>{speed.toFixed(2)}×</b>
            <input type="range" min={0.75} max={1.5} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" />
            <span className="text-xs text-soft">0,75× chậm – 1,5× nhanh. Bài giảng thường 0,9–1,0×.</span>
          </label>
          <label className="text-sm">Độ biểu cảm (temperature): <b>{temp.toFixed(1)}</b>
            <input type="range" min={0.1} max={1.5} step={0.1} value={temp} onChange={(e) => setTemp(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" />
            <span className="text-xs text-soft">Thấp: đều, ổn định · Cao: tự nhiên, nhiều ngữ điệu hơn. Mặc định 0,8{engine === "zerotts" ? " (ZeroTTS: audio temperature)" : " (CIT)"}.</span>
          </label>
          <div className="text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={fixedSeed} onChange={(e) => setFixedSeed(e.target.checked)} /> Cố định giọng đọc (seed)</label>
            {fixedSeed && <input type="number" className="input mt-1 w-32" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />}
            <div className="text-xs text-soft">Bật để mỗi lần tạo lại cùng câu sẽ ra đúng giọng như cũ.</div>
          </div>
          {engine === "cit" ? (
            <div className="text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={useDict} onChange={(e) => setUseDict(e.target.checked)} /> Dùng thêm từ điển phát âm của CIT Voice Studio</label>
              <div className="text-xs text-soft">Ứng dụng đã chuẩn hoá cách đọc ở bước 3; bật thêm nếu bạn đã khai báo từ điển trong CIT.</div>
            </div>
          ) : (
            <div className="text-xs text-soft">ZeroTTS không có tốc độ riêng: ứng dụng đổi tốc độ bằng ffmpeg (giữ cao độ). Số, ngày tháng được ZeroTTS tự đọc thành chữ.</div>
          )}
        </div>
        <button className="btn btn-primary mt-3" disabled={a.busy} onClick={() => apply({ voice: { speed, temperature: temp, seed: fixedSeed ? seed : null, ...(engine === "cit" ? { useDict } : {}) } }, `Đã áp dụng tuỳ chọn đọc cho ${scopeLabel}`)}>Áp dụng tuỳ chọn cho {scopeLabel}</button>
        <div className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs text-soft">
          Thẻ điều khiển trong lời đọc (thêm ở bước 3): <code>[nghỉ 2s]</code> <code>[nghỉ 500ms]</code> khoảng lặng · <code>[cười]</code> <code>[thở dài]</code> <code>[hắng giọng]</code> biểu cảm
          {engine === "zerotts" && " – với ZeroTTS chỉ thẻ nghỉ có tác dụng (chèn khoảng lặng, tối đa 2,4 s), thẻ biểu cảm được bỏ qua"}.
        </div>
      </div>

      <div className="card mb-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">Chọn giọng ({list.length}/{voices.data?.length ?? 0})</h2>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Nam & nữ</option><option value="male">Nam</option><option value="female">Nữ</option></select>
            {engine === "cit" && <select className="input w-auto" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Mọi miền</option><option value="North">Bắc</option><option value="Central">Trung</option><option value="South">Nam</option></select>}
            <input className="input w-44" placeholder="Tìm giọng…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!voices.data?.length && <div className="text-sm text-soft">Chưa có danh sách giọng – hãy mở CIT Voice Studio (đèn xanh ở trên), danh sách sẽ tự hiện.</div>}
        {engine === "zerotts" && <p className="mb-2 text-xs text-soft">Nghe thử và tạo giọng cần ZeroTTS đã cài và đang chạy (đèn xanh ở trên).</p>}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => {
            const using = active.filter((x) => x.voice.provider === engine && x.voice.voiceId === v.id).length;
            return (
              <div key={v.id} className={`rounded-lg border p-3 ${using ? "border-brand" : "border-line"}`}>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${v.gender === "female" ? "bg-pink-100 text-pink-800" : "bg-sky-100 text-sky-800"}`}>{v.name.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{v.name} {v.cloned ? <Badge tone="amber">nhân bản</Badge> : null}</div>
                    <div className="text-xs text-soft">{v.description ?? `${v.gender === "female" ? "Nữ" : "Nam"}${v.region ? ` · ${REGION[v.region] ?? v.region}` : ""}`}</div>
                  </div>
                  {using > 0 && <Badge tone="green">{using} video</Badge>}
                </div>
                {audio[v.id] && <audio className="mt-2 h-8 w-full" src={audio[v.id]} controls autoPlay />}
                <div className="mt-2 flex gap-2">
                  <button className="btn" disabled={a.busy} onClick={() => listen(v.id)}>{playing === v.id ? "Đang đọc…" : "▶ Nghe thử"}</button>
                  <button className="btn btn-primary" disabled={a.busy} onClick={() => apply({ voice: { provider: engine, voiceId: v.id } }, `Đã chọn giọng ${v.name} (${engine === "cit" ? "CIT" : "ZeroTTS"}) cho ${scopeLabel}`)}>Dùng giọng này</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <MusicSettings pid={pid} />

      <div className="card mb-4">
        <h2 className="mb-2 font-semibold">Nhịp đọc theo cấp độ</h2>
        <table className="tbl">
          <thead><tr><th>Cấp độ</th><th>Mặc định</th><th></th></tr></thead>
          <tbody>
            {levels.map((l) => {
              const p = meta.data?.levels[tierOf(l)];
              const names = voices.data?.map((v) => v.id) ?? [];
              const fem = voices.data?.find((v) => v.gender === "female")?.id ?? (engine === "cit" ? "Trúc Ly" : "maichi");
              const mal = voices.data?.find((v) => v.gender === "male")?.id ?? (engine === "cit" ? "Hải Đăng" : "quangminh");
              return (
                <tr key={l}>
                  <td className="font-semibold">{l} · {p?.label}</td>
                  <td className="text-xs">{p?.voice === "alternate" ? "Xen kẽ nữ/nam" : p?.voice} · tốc độ {p?.speed} · nghỉ đầu/giữa câu/cuối {p?.pace.lead}/{p?.pace.gap}/{p?.pace.tail} s</td>
                  <td className="flex flex-wrap gap-1">
                    <button className="btn" onClick={() => a.run(async () => { await api(`/projects/${pid}/voice-preset`, { method: "POST", json: { level: l, resetPreset: true } }); vids.reload(); }, `${l}: đã đặt lại nhịp & tốc độ mặc định`)}>Đặt lại mặc định</button>
                    {names.length > 0 && <button className="btn" onClick={() => a.run(async () => { await api(`/projects/${pid}/voice-preset`, { method: "POST", json: { level: l, voice: { provider: engine }, alternate: [fem, mal] } }); vids.reload(); }, `${l}: xen kẽ ${fem} / ${mal}`)}>Xen kẽ nữ/nam{engine === "zerotts" ? " (ZeroTTS)" : ""}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 text-xs text-soft">Không để im lặng quá 2,5 s ở bất kỳ đâu. Khoảng nghỉ giữa câu chỉ chèn vào chỗ ngắt hơi có sẵn, không cắt giữa từ.</div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Từng video</h2>
        <table className="tbl">
          <thead><tr><th>Video</th><th>Nguồn giọng</th><th>Giọng</th><th>Tốc độ</th><th>Biểu cảm</th><th>Nghỉ đầu</th><th>Giữa câu</th><th>Cuối</th></tr></thead>
          <tbody>
            {active.map((v) => (
              <VideoRow key={v.key} pid={pid} v={v} names={citVoices.data?.map((x) => x.id) ?? []} zerotts={zVoices.data ?? []} edge={meta.data?.edgeVoices} onSaved={vids.reload} />
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-soft">Mặc định dùng CIT Voice Studio. ZeroTTS là nguồn giọng thứ hai (cài thêm); Edge TTS chỉ là phương án dự phòng.</p>
      </div>
    </div>
  );
}

function VideoRow({ pid, v, names, zerotts, edge, onSaved }: { pid: string; v: VideoSum; names: string[]; zerotts: Voice[]; edge?: { female: string; male: string }; onSaved: () => void }) {
  const save = async (patch: { voice?: any; pace?: any }) => {
    const row = await api<any>(`/projects/${pid}/videos/${encodeURIComponent(v.key)}`);
    const d = row.data;
    if (patch.voice) d.voice = { ...d.voice, ...patch.voice };
    if (patch.pace) d.pace = { ...d.pace, ...patch.pace };
    await api(`/projects/${pid}/videos/${encodeURIComponent(v.key)}`, { method: "PUT", json: d });
    onSaved();
  };
  return (
    <tr>
      <td className="num text-[13px] font-medium">{v.key}</td>
      <td><select className="input" aria-label={`Nguồn giọng ${v.key}`} value={v.voice.provider} onChange={(e) => save({ voice: { provider: e.target.value, voiceId: e.target.value === "edge" ? edge?.male : e.target.value === "zerotts" ? zerotts[0]?.id ?? "maichi" : names[0] ?? "Hải Đăng" } })}><option value="cit">CIT</option><option value="zerotts">ZeroTTS</option><option value="edge">Edge (dự phòng)</option></select></td>
      <td>{v.voice.provider === "cit" ? (
        <select className="input" value={v.voice.voiceId} onChange={(e) => save({ voice: { voiceId: e.target.value } })}>{[...new Set([...names, v.voice.voiceId])].map((n) => <option key={n}>{n}</option>)}</select>
      ) : v.voice.provider === "zerotts" ? (
        <select className="input" value={v.voice.voiceId} onChange={(e) => save({ voice: { voiceId: e.target.value } })}>{[...zerotts.map((z) => [z.id, z.name] as const), ...(zerotts.some((z) => z.id === v.voice.voiceId) ? [] : [[v.voice.voiceId, v.voice.voiceId] as const])].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      ) : (
        <select className="input" value={v.voice.voiceId} onChange={(e) => save({ voice: { voiceId: e.target.value } })}><option value={edge?.female}>HoaiMy (nữ)</option><option value={edge?.male}>NamMinh (nam)</option></select>
      )}</td>
      <td><input type="number" step="0.05" min="0.75" max="1.5" className="input w-20" defaultValue={v.voice.speed} onBlur={(e) => save({ voice: { speed: Number(e.target.value) } })} /></td>
      <td><input type="number" step="0.1" min="0.1" max="1.5" className="input w-20" defaultValue={v.voice.temperature ?? 0.8} onBlur={(e) => save({ voice: { temperature: Number(e.target.value) } })} /></td>
      {(["lead", "gap", "tail"] as const).map((k) => <td key={k}><input type="number" step="0.1" min="0" max="2.4" className="input w-20" defaultValue={v.pace[k]} onBlur={(e) => save({ pace: { [k]: Number(e.target.value) } })} /></td>)}
    </tr>
  );
}
