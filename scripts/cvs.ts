// pnpm cvs <lệnh> – điều khiển Course Video Studio qua API của worker đang chạy, để Claude Code (gói Claude đã đăng ký)
// làm phần AI thay cho Claude API: đọc video, lấy đúng prompt của app, ghi thiết kế/SVG/mã cảnh, soát khung, render.
// Địa chỉ API: biến CVS_API (mặc định http://127.0.0.1:3001/api). Kết quả dạng JSON để agent đọc.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HELP = `Course Video Studio – lệnh cho Claude Code (gọi API worker ở CVS_API, mặc định http://127.0.0.1:3001/api)

Xem
  projects                                 Danh sách dự án
  videos <pid>                             Các video của dự án (trạng thái, QA, job đang chạy)
  video <pid> <key>                        Kịch bản + thiết kế + timing từng cảnh
  templates                                Thư viện template (schema, ví dụ), biểu tượng, kiểu chữ chuyển động, phong cách, phông
  readings <pid> [key] [--warn]            Mọi câu (id, lời thoại, cách đọc, cảnh báo, đề xuất đang chờ); --warn: chỉ câu còn cảnh báo
  prompt <design|illustration|custom|readings|review-readings> <pid> <key> [sid] [--note "..."]
                                           In đúng prompt mà Claude API sẽ nhận cho việc này (làm theo prompt đó)
  status <pid>                             Tóm tắt video + job + yêu cầu đang chờ của dự án

Sửa
  set-design <pid> <key> <sid> <json-file|->  Ghi {"template","params","assumptions"} cho cảnh [--note "..."]
  set-svg <pid> <key> <sid> <svg-file|->      Ghi hình minh hoạ SVG cho cảnh illustration [--brief "..."]
  set-custom <pid> <key> <sid> <code-file|->  Ghi mã cảnh tùy biến (HyperFrames HTML / Remotion TSX), kiểm bằng lint [--note "..."]
  set-reading <pid> <key> <sid> <idx> <cách đọc...>  Sửa cách đọc một câu (khoá như sửa tay)
  suggest-reading <pid> <key> <sid> <idx> <cách đọc...> [--reason "..."] [--glossary "HSE=hát ét ét;PPE=pê pê e"]
                                           Lưu ĐỀ XUẤT cách đọc (người dùng chấp nhận/bỏ qua trong app; không đổi cách đọc)

Chạy
  check <pid> <key>                        Dựng cảnh + QA (giữ thiết kế đã có), chờ xong, in lỗi QA + ảnh khung từng cảnh
  qa <pid> <key>                           In báo cáo QA + ảnh khung hiện có (không chạy lại)
  render <pid> <key>                       Xếp hàng render (chưa có giọng → sản xuất đủ: giọng + dựng + render)
  wait <jobId> [--timeout giây]            Chờ job xong (mặc định 540 s; hết giờ → mã thoát 2, chạy lại wait)

Yêu cầu từ ứng dụng
  pending                                  Yêu cầu đang chờ / đang làm (status running = ứng dụng đã giao cho bạn)
  done <reqId> [lời nhắn...]               Đánh dấu đã xong
  fail <reqId> <lý do...>                  Đánh dấu không làm được
`;

export type Io = {
  base: string;
  fetch: typeof fetch;
  out: (s: string) => void;
  err: (s: string) => void;
  readFile: (path: string) => string;
  sleep: (ms: number) => Promise<void>;
};

const VALUE_FLAGS = new Set(["note", "brief", "timeout", "reason", "glossary"]);

export function parseArgs(argv: string[]): { pos: string[]; flags: Record<string, string> } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) pos.push(a);
    else if (m[2] !== undefined) flags[m[1]] = m[2];
    else if (VALUE_FLAGS.has(m[1])) {
      if (i + 1 >= argv.length) throw new UsageError(`Thiếu giá trị cho --${m[1]}`);
      flags[m[1]] = argv[++i];
    } else flags[m[1]] = "1";
  }
  return { pos, flags };
}

class UsageError extends Error {}

function client(io: Io) {
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await io.fetch(`${io.base}${path}`, { method, headers: body !== undefined ? { "content-type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error(`Không kết nối được worker ở ${io.base} – mở ứng dụng bằng KHOI_DONG.cmd (hoặc pnpm start) rồi thử lại`);
    }
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* văn bản thường */
    }
    if (!res.ok) {
      const msg = data?.errors?.length ? data.errors.join("\n") : (data?.error ?? `HTTP ${res.status}`);
      throw new Error(msg);
    }
    return data as T;
  };
  return { get: <T = any>(p: string) => call<T>("GET", p), post: <T = any>(p: string, b: unknown) => call<T>("POST", p, b), patch: <T = any>(p: string, b: unknown) => call<T>("PATCH", p, b) };
}

const enc = encodeURIComponent;
const vpath = (pid: string, key: string) => `/projects/${enc(pid)}/videos/${enc(key)}`;
const json = (io: Io, v: unknown) => io.out(JSON.stringify(v, null, 2));
const elideSvg = (d: unknown) => JSON.parse(JSON.stringify(d ?? null, (k, v) => (k === "svg" && typeof v === "string" ? `(SVG ${v.length} ký tự – giữ nguyên brief để giữ hình)` : k === "svgKey" ? undefined : v)));

function need(pos: string[], n: number, usage: string) {
  if (pos.length < n) throw new UsageError(`Thiếu tham số. Cách dùng: pnpm cvs ${usage}`);
}

/** Chờ job tới trạng thái cuối; trả về job (status "timeout" nếu hết giờ). */
async function waitJob(io: Io, api: ReturnType<typeof client>, id: number, timeoutSec: number) {
  const until = Date.now() + timeoutSec * 1000;
  let last = "";
  for (;;) {
    const j = await api.get(`/jobs/${id}`);
    if (!j) throw new Error(`Không có job ${id}`);
    const line = `#${id} ${j.kind} ${j.status} ${Math.round(j.progress ?? 0)}% ${j.message ?? ""}`;
    if (line !== last) io.err(line);
    last = line;
    if (["done", "failed", "canceled"].includes(j.status)) return j;
    if (Date.now() >= until) return { ...j, status: "timeout" };
    await io.sleep(2000);
  }
}

async function qaSummary(api: ReturnType<typeof client>, pid: string, key: string) {
  const v = await api.get(vpath(pid, key));
  const qa = v.qa;
  if (!qa) return { ok: null, message: "Chưa có báo cáo QA – chạy pnpm cvs check" };
  const frames: Record<string, string[]> = {};
  for (const f of qa.frames ?? []) (frames[f.scene ?? "?"] ??= []).push(`${f.file}  (${f.label ?? ""})`);
  return { ok: qa.ok, checkedAt: qa.checkedAt, items: qa.items, assumptions: qa.assumptions, sheet: qa.sheet, frames, rendered: qa.rendered ?? null };
}

export async function main(argv: string[], io: Io): Promise<number> {
  const api = client(io);
  try {
    const { pos, flags } = parseArgs(argv);
    const [cmd, ...a] = pos;
    switch (cmd) {
      case undefined:
      case "help":
      case "--help":
        io.out(HELP);
        return 0;
      case "projects":
        json(io, (await api.get("/projects")).map((p: any) => ({ id: p.id, name: p.name, course: p.course, videos: p.videos, style: p.settings?.style, styleConfirmed: !!p.settings?.styleConfirmed })));
        return 0;
      case "videos":
        need(a, 1, "videos <pid>");
        json(io, (await api.get(`/projects/${enc(a[0])}/videos`)).map((v: any) => ({ key: v.key, title: v.title, status: v.status, include: v.include, scenes: v.scenes, seconds: v.seconds, estimated: v.estimated, engine: v.engine, style: v.style, qaOk: v.qaOk, rendered: v.rendered, approved: v.approved, job: v.job ? { id: v.job.id, kind: v.job.kind, status: v.job.status, message: v.job.message } : null })));
        return 0;
      case "video": {
        need(a, 2, "video <pid> <key>");
        const v = await api.get(vpath(a[0], a[1]));
        const d = v.data;
        json(io, {
          key: d.key,
          title: d.title,
          level: d.level,
          engine: d.engine,
          style: d.style,
          font: d.font ?? null,
          sources: d.sources ?? null,
          context: d.context ? String(d.context).slice(0, 4000) : null,
          seconds: v.timing?.total,
          estimatedTiming: v.timing?.estimated,
          scenes: d.scenes.map((s: any, i: number) => {
            const t = v.timing?.scenes?.[i];
            return {
              id: s.id,
              title: s.title,
              visual: s.visual,
              onscreen: s.onscreen,
              sentences: s.sentences.map((x: any, k: number) => ({ idx: k, text: x.text, tts: x.tts, locked: !!x.ttsLocked, cue: t?.cues?.[k], end: t?.ends?.[k] })),
              timing: t ? { start: t.start, dur: t.dur } : null,
              design: elideSvg(s.design),
              assumptions: s.assumptions ?? [],
              notes: s.notes ?? [],
              history: s.history?.length ?? 0,
            };
          }),
        });
        return 0;
      }
      case "templates": {
        const m = await api.get("/meta");
        json(io, {
          templates: m.templates,
          icons: { count: m.icons.length, names: m.icons },
          kineticPresets: m.kineticPresets ?? [],
          themes: m.themes.map((t: any) => ({ id: t.id, name: t.name, dark: t.dark, fonts: t.fonts })),
          fonts: m.fonts.map((f: any) => ({ id: f.id, name: f.name, display: f.display, body: f.body })),
        });
        return 0;
      }
      case "readings": {
        need(a, 1, "readings <pid> [key] [--warn]");
        const rows = (await api.get(`/projects/${enc(a[0])}/reading`)).filter((r: any) => (!flags.warn || (r.warnings.length && !r.locked)) && (!a[1] || r.key === a[1]));
        json(io, rows.map((r: any) => ({ key: r.key, id: `${r.scene}#${r.idx}`, scene: r.scene, idx: r.idx, text: r.text, tts: r.tts, locked: r.locked, warnings: r.warnings, suggest: r.suggest ?? undefined })));
        return 0;
      }
      case "prompt": {
        need(a, 3, "prompt <design|illustration|custom|readings|review-readings> <pid> <key> [sid] [--note \"...\"]");
        const p = await api.post("/claude-code/prompt", { kind: a[0], projectId: a[1], videoKey: a[2], sceneId: a[3], note: flags.note });
        io.out(`===== SYSTEM =====\n${p.system}\n\n===== NỘI DUNG =====\n${p.content}`);
        return 0;
      }
      case "status": {
        need(a, 1, "status <pid>");
        const [vids, jobs, reqs] = await Promise.all([api.get(`/projects/${enc(a[0])}/videos`), api.get(`/projects/${enc(a[0])}/jobs`), api.get(`/claude-code/requests?projectId=${enc(a[0])}&status=pending,running`)]);
        json(io, {
          videos: vids.map((v: any) => ({ key: v.key, status: v.status, qaOk: v.qaOk, rendered: v.rendered, approved: v.approved, job: v.job ? `#${v.job.id} ${v.job.kind} ${v.job.status}` : null })),
          activeJobs: jobs.filter((j: any) => ["queued", "running", "paused"].includes(j.status)).map((j: any) => ({ id: j.id, kind: j.kind, video: j.video_key, status: j.status, progress: j.progress, message: j.message })),
          lastFailed: jobs.find((j: any) => j.status === "failed") ?? null,
          pendingRequests: reqs,
        });
        return 0;
      }
      case "set-design": {
        need(a, 4, "set-design <pid> <key> <sid> <json-file|->");
        let d: any;
        try {
          d = JSON.parse(io.readFile(a[3]));
        } catch (e) {
          throw new Error(`File JSON không đọc được: ${(e as Error).message}`);
        }
        if (!d || typeof d.template !== "string") throw new Error('JSON cần dạng {"template": "...", "params": {...}, "assumptions": [...]}');
        const r = await api.patch(`${vpath(a[0], a[1])}/scenes/${enc(a[2])}`, { design: { template: d.template, params: d.params ?? {}, customCode: d.customCode }, assumptions: d.assumptions ?? [], note: flags.note, by: "ai" });
        json(io, r);
        return 0;
      }
      case "set-svg": {
        need(a, 4, "set-svg <pid> <key> <sid> <svg-file|-> [--brief \"...\"]");
        const v = await api.get(vpath(a[0], a[1]));
        const scene = v.data.scenes.find((s: any) => s.id === a[2]);
        if (!scene) throw new Error(`Không có cảnh ${a[2]}`);
        const cur = scene.design?.template === "illustration" ? scene.design.params : {};
        const brief = flags.brief ?? cur.brief;
        if (!brief) throw new Error('Cảnh chưa là illustration có brief – thêm --brief "mô tả hình" (hoặc set-design template illustration trước)');
        const r = await api.patch(`${vpath(a[0], a[1])}/scenes/${enc(a[2])}`, { design: { template: "illustration", params: { ...cur, brief, svg: io.readFile(a[3]) } }, note: flags.note, by: "ai" });
        json(io, r);
        return 0;
      }
      case "set-custom": {
        need(a, 4, "set-custom <pid> <key> <sid> <code-file|->");
        const v = await api.get(vpath(a[0], a[1]));
        const r = await api.patch(`${vpath(a[0], a[1])}/scenes/${enc(a[2])}`, { design: { template: "custom", customCode: { [v.data.engine]: io.readFile(a[3]) } }, assumptions: ["Cảnh tùy biến do AI (Claude Code) viết mã"], note: flags.note, by: "ai" });
        json(io, r);
        return 0;
      }
      case "set-reading": {
        need(a, 5, "set-reading <pid> <key> <sid> <idx> <cách đọc...>");
        const idx = Number(a[3]);
        if (!Number.isInteger(idx) || idx < 0) throw new UsageError("idx phải là số thứ tự câu (từ 0)");
        json(io, await api.patch(`${vpath(a[0], a[1])}/sentence`, { scene: a[2], idx, tts: a.slice(4).join(" ") }));
        return 0;
      }
      case "suggest-reading": {
        need(a, 5, "suggest-reading <pid> <key> <sid> <idx> <cách đọc...> [--reason \"...\"] [--glossary \"term=reading;...\"]");
        const idx = Number(a[3]);
        if (!Number.isInteger(idx) || idx < 0) throw new UsageError("idx phải là số thứ tự câu (từ 0)");
        const glossary = flags.glossary?.split(";").filter((x) => x.trim()).map((x) => {
          const [term, ...rest] = x.split("=");
          if (!term?.trim() || !rest.join("=").trim()) throw new UsageError(`--glossary cần dạng "cụm=cách đọc" (mục: "${x}")`);
          return { term: term.trim(), reading: rest.join("=").trim() };
        });
        json(io, await api.patch(`${vpath(a[0], a[1])}/sentence`, { scene: a[2], idx, suggest: { tts: a.slice(4).join(" "), reason: flags.reason, glossary, by: "claude-code" } }));
        return 0;
      }
      case "check": {
        need(a, 2, "check <pid> <key>");
        const [job] = await api.post(`/projects/${enc(a[0])}/jobs`, { kind: "design", keys: [a[1]], payload: {} });
        if (job.kind !== "design") io.err(`Video đang có job #${job.id} (${job.kind}) – chờ job đó trước`);
        const j = await waitJob(io, api, job.id, Number(flags.timeout ?? 540));
        if (j.status === "timeout") {
          io.err(`Chưa xong – chạy: pnpm cvs wait ${job.id} rồi pnpm cvs qa ${a[0]} ${a[1]}`);
          return 2;
        }
        if (j.status !== "done") throw new Error(`Job #${job.id} ${j.status}: ${j.error ?? j.message ?? ""}`);
        json(io, await qaSummary(api, a[0], a[1]));
        return 0;
      }
      case "qa":
        need(a, 2, "qa <pid> <key>");
        json(io, await qaSummary(api, a[0], a[1]));
        return 0;
      case "render": {
        need(a, 2, "render <pid> <key>");
        const v = await api.get(vpath(a[0], a[1]));
        // chưa có giọng thật → render sẽ từ chối; "produce" làm giọng rồi giữ nguyên thiết kế đã ghi
        const kind = v.summary?.estimated ? "produce" : "render";
        // đã render trước đó (phong cách đã được dùng) → render lại như nút Hoàn tác của app, không bắt chọn lại phong cách
        const [job] = await api.post(`/projects/${enc(a[0])}/jobs`, { kind, keys: [a[1]], payload: v.summary?.rendered ? { skipStyle: true } : {} });
        json(io, { job: job.id, kind: job.kind, status: job.status, next: `pnpm cvs wait ${job.id}` });
        return 0;
      }
      case "wait": {
        need(a, 1, "wait <jobId>");
        const j = await waitJob(io, api, Number(a[0]), Number(flags.timeout ?? 540));
        json(io, { id: j.id, kind: j.kind, video: j.video_key, status: j.status, message: j.message, error: j.error });
        return j.status === "done" ? 0 : j.status === "timeout" ? 2 : 1;
      }
      case "pending":
        json(io, await api.get("/claude-code/requests?status=pending,running"));
        return 0;
      case "done":
      case "fail": {
        need(a, cmd === "fail" ? 2 : 1, cmd === "fail" ? "fail <reqId> <lý do...>" : "done <reqId> [lời nhắn...]");
        json(io, await api.patch(`/claude-code/requests/${enc(a[0])}`, { status: cmd === "done" ? "done" : "failed", message: a.slice(1).join(" ") || undefined }));
        return 0;
      }
      default:
        throw new UsageError(`Không có lệnh "${cmd}". Gõ pnpm cvs help`);
    }
  } catch (e) {
    io.err(`Lỗi: ${(e as Error).message}`);
    return e instanceof UsageError ? 64 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const io: Io = {
    base: (process.env.CVS_API ?? "http://127.0.0.1:3001/api").replace(/\/$/, ""),
    fetch,
    out: (s) => console.log(s),
    err: (s) => console.error(s),
    readFile: (p) => readFileSync(p === "-" ? 0 : p, "utf8"),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  process.exitCode = await main(process.argv.slice(2), io);
}
