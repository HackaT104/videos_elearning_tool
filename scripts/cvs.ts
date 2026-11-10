// pnpm cvs <lệnh> – điều khiển Course Video Studio qua API của worker đang chạy, để Claude Code (gói Claude đã đăng ký)
// làm phần AI thay cho Claude API: đọc video, lấy đúng prompt của app, ghi thiết kế/SVG/mã cảnh, soát khung, render.
// Địa chỉ API: biến CVS_API (mặc định http://127.0.0.1:3001/api). Kết quả dạng JSON để agent đọc.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  apiBase, createApi, enc, getPrompt, markRequest, pendingRequests, projectsView, qaReport, renderVideo, setCartoon, setCustomScene, setReading, setSceneDesign, setSubs, setSvg, startCheck, suggestReading,
  templatesView, videosView, videoView, vpath, waitJob,
} from "./lib/cvs-api";

const HELP = `Course Video Studio – lệnh cho Claude Code (gọi API worker ở CVS_API, mặc định http://127.0.0.1:3001/api)

Xem
  projects                                 Danh sách dự án
  videos <pid>                             Các video của dự án (trạng thái, QA, job đang chạy)
  video <pid> <key>                        Kịch bản + thiết kế + timing từng cảnh
  templates                                Thư viện template (schema, ví dụ), biểu tượng, kiểu chữ chuyển động, phong cách, phông
  readings <pid> [key] [--warn]            Mọi câu (id, lời thoại, cách đọc, cảnh báo, đề xuất đang chờ); --warn: chỉ câu còn cảnh báo
  prompt <design|illustration|cartoon|custom|readings|review-readings|write-script> <pid> <key> [sid] [--note "..."]
                                           In đúng prompt mà Claude API sẽ nhận cho việc này (làm theo prompt đó)
  prompt translate-subs <pid> <key> --lang en [--all]
                                           Prompt dịch phụ đề (chỉ câu còn thiếu bản dịch; --all: dịch lại mọi câu)
  subs <pid> <key> [--lang en]             Mọi câu (id, lời thoại tiếng Việt, bản dịch đã có) để dịch phụ đề
  files <pid>                              Tài liệu đã tải (mã tài liệu, loại, video, đã phân tích chưa)
  doc <pid> <fileId>                       Claude đọc và phân tích tài liệu: in đúng prompt phân tích (dàn ý tài liệu,
                                           khối video đầy đủ, video máy đã bóc, thư viện template) – trả lời bằng set-plan
  style-refs <pid>                         Tạo phong cách bằng AI: mô tả của người dùng + ĐƯỜNG DẪN TUYỆT ĐỐI ảnh/PDF tham chiếu (cả tài liệu ZIP/HTML) và
                                           khung trích từ video mẫu (mở từng ảnh bằng công cụ Read)
  prompt style-gen <pid>                   Prompt tạo phong cách (đúng như Claude API nhận, kèm ảnh)
  status <pid>                             Tóm tắt video + job + yêu cầu đang chờ của dự án

Sửa
  set-design <pid> <key> <sid> <json-file|->  Ghi {"template","params","assumptions","alternatives","reason","confidence"} cho cảnh [--note "..."]
  set-svg <pid> <key> <sid> <svg-file|->      Ghi hình minh hoạ SVG cho cảnh illustration [--brief "..."]
  set-cartoon <pid> <key> <sid> <js-file|->   Ghi mã cảnh hoạt hình vẽ tay (vẽ thử; in lỗi + ảnh khung để soát) [--note "..."]
  set-custom <pid> <key> <sid> <code-file|->  Ghi mã cảnh tùy biến (HyperFrames HTML / Remotion TSX), kiểm bằng lint [--note "..."]
  set-plan <pid> <fileId> <json-file|->     Ghi kế hoạch video của tài liệu {"videos":[…],"proposed":[…]} (kiểm như đường API)
  set-script <pid> <key> <json-file|->     Ghi kịch bản viết lại {"title","scenes":[{title,visual,onscreen,vo,seconds}],"assumptions"}
  set-theme <pid> <json-file|-|json>        Ghi phong cách {"theme":{…},"rationale","closest"} (kiểm màu/tương phản/phông), tự dựng ảnh xem trước
  set-reading <pid> <key> <sid> <idx> <cách đọc...>  Sửa cách đọc một câu (khoá như sửa tay)
  set-subs <pid> <key> <lang> <json-file|->  Ghi bản dịch phụ đề {"translations":[{"id":"s1#0","text":"..."}]} (kiểm id, số khớp lời thoại)
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

const VALUE_FLAGS = new Set(["note", "brief", "timeout", "reason", "glossary", "lang"]);

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

const json = (io: Io, v: unknown) => io.out(JSON.stringify(v, null, 2));

function need(pos: string[], n: number, usage: string) {
  if (pos.length < n) throw new UsageError(`Thiếu tham số. Cách dùng: pnpm cvs ${usage}`);
}

export async function main(argv: string[], io: Io): Promise<number> {
  const api = createApi(io.base, io.fetch);
  const wait = (id: number, sec: number) => waitJob(api, id, sec, io.sleep, io.err);
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
        json(io, await projectsView(api));
        return 0;
      case "videos":
        need(a, 1, "videos <pid>");
        json(io, await videosView(api, a[0]));
        return 0;
      case "video":
        need(a, 2, "video <pid> <key>");
        json(io, await videoView(api, a[0], a[1]));
        return 0;
      case "templates":
        json(io, await templatesView(api));
        return 0;
      case "readings": {
        need(a, 1, "readings <pid> [key] [--warn]");
        const rows = (await api.get(`/projects/${enc(a[0])}/reading`)).filter((r: any) => (!flags.warn || (r.warnings.length && !r.locked)) && (!a[1] || r.key === a[1]));
        json(io, rows.map((r: any) => ({ key: r.key, id: `${r.scene}#${r.idx}`, scene: r.scene, idx: r.idx, text: r.text, tts: r.tts, locked: r.locked, warnings: r.warnings, suggest: r.suggest ?? undefined })));
        return 0;
      }
      case "prompt": {
        need(a, a[0] === "style-gen" ? 2 : 3, "prompt <design|illustration|custom|readings|review-readings|style-gen> <pid> <key> [sid] [--note \"...\"]");
        // dịch phụ đề: note = "<lang> [all]"
        const note = a[0] === "translate-subs" ? `${flags.lang ?? ""}${flags.all ? " all" : ""}` : flags.note;
        const p = await getPrompt(api, a[0], a[1], a[2], a[3], note);
        io.out(`===== SYSTEM =====\n${p.system}\n\n===== NỘI DUNG =====\n${p.content}`);
        return 0;
      }
      case "subs": {
        need(a, 2, "subs <pid> <key> [--lang en]");
        const v = await api.get(vpath(a[0], a[1]));
        json(io, v.data.scenes.flatMap((s: any) => s.sentences.map((x: any, k: number) => ({ id: `${s.id}#${k}`, text: x.text, ...(flags.lang ? { [flags.lang]: x.subs?.[flags.lang] ?? null } : { subs: x.subs ?? {} }) }))));
        return 0;
      }
      case "set-subs": {
        need(a, 4, "set-subs <pid> <key> <lang> <json-file|->");
        let d: any;
        try {
          d = JSON.parse(io.readFile(a[3]));
        } catch (e) {
          throw new Error(`File JSON không đọc được: ${(e as Error).message}`);
        }
        json(io, await setSubs(api, a[0], a[1], a[2], d));
        return 0;
      }
      case "files": {
        need(a, 1, "files <pid>");
        const p = await api.get(`/projects/${enc(a[0])}`);
        json(io, p.files.map((f: any) => ({ id: f.id, name: f.name, level: f.level, kind: f.kind, videos: f.summary?.videos ?? [], analyzable: /\.docx$/i.test(f.summary?.stored ?? ""), plan: f.summary?.plan ? { by: f.summary.plan.by, at: f.summary.plan.at, videos: f.summary.plan.videos.length, proposed: f.summary.plan.proposed.length } : null })));
        return 0;
      }
      case "doc": {
        need(a, 2, "doc <pid> <fileId>");
        const p = await getPrompt(api, "analyze-doc", a[0], a[1]);
        io.out(`===== SYSTEM =====\n${p.system}\n\n===== NỘI DUNG =====\n${p.content}`);
        return 0;
      }
      case "set-plan":
      case "set-script": {
        const plan = cmd === "set-plan";
        need(a, 3, plan ? "set-plan <pid> <fileId> <json-file|->" : "set-script <pid> <key> <json-file|->");
        let d: any;
        try {
          d = JSON.parse(io.readFile(a[2]));
        } catch (e) {
          throw new Error(`File JSON không đọc được: ${(e as Error).message}`);
        }
        const r = await api.post(plan ? `/projects/${enc(a[0])}/files/${enc(a[1])}/plan` : `${vpath(a[0], a[1])}/script`, d);
        json(io, plan ? { ok: r.ok, videos: r.plan?.videos.map((v: any) => ({ key: v.key, title: v.title, mode: v.suggestedMode, scenes: v.scenes?.length ?? null, issues: v.issues.length })), proposed: r.plan?.proposed.length ?? 0 } : r);
        return 0;
      }
      case "style-refs": {
        need(a, 1, "style-refs <pid>");
        const r = await api.get(`/projects/${enc(a[0])}/style-refs`);
        json(io, { prompt: r.prompt, base: r.base, images: r.images.map((x: any) => ({ path: x.file, name: x.name })), videoFrames: r.video ? r.video.frames.map((f: any) => ({ path: f.file, t: f.t })) : [], video: r.video?.name ?? null, docs: (r.docs ?? []).map((d: any) => ({ name: d.name, kind: d.kind, images: d.images.map((x: any) => ({ path: x.file, label: x.label })), pdfs: d.pdfs.map((f: any) => ({ path: f.file, name: f.name })), notes: d.notes })), preset: r.preset ?? null, next: `pnpm -s cvs prompt style-gen ${a[0]}` });
        return 0;
      }
      case "set-theme": {
        need(a, 2, "set-theme <pid> <json-file|-|json>");
        let d: any;
        try {
          d = JSON.parse(a[1].trim().startsWith("{") ? a.slice(1).join(" ") : io.readFile(a[1]));
        } catch (e) {
          throw new Error(`JSON không đọc được: ${(e as Error).message}`);
        }
        const r = await api.post(`/projects/${enc(a[0])}/themes`, d);
        json(io, { ...r, next: `pnpm -s cvs wait ${r.previewJob} (ảnh xem trước)` });
        return 0;
      }
      case "status": {
        need(a, 1, "status <pid>");
        const [vids, jobs, reqs] = await Promise.all([api.get(`/projects/${enc(a[0])}/videos`), api.get(`/projects/${enc(a[0])}/jobs`), pendingRequests(api, a[0])]);
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
        json(io, await setSceneDesign(api, a[0], a[1], a[2], d, flags.note));
        return 0;
      }
      case "set-svg": {
        need(a, 4, "set-svg <pid> <key> <sid> <svg-file|-> [--brief \"...\"]");
        const r = await setSvg(api, a[0], a[1], a[2], io.readFile(a[3]), flags.brief, flags.note);
        json(io, r);
        return 0;
      }
      case "set-cartoon": {
        need(a, 4, "set-cartoon <pid> <key> <sid> <js-file|->");
        const raw = io.readFile(a[3]);
        // nhận cả câu trả lời đầy đủ (khối ```js + ```json) lẫn mã thuần
        const code = raw.match(/```(?:js|javascript)\s*([\s\S]*?)```/)?.[1] ?? raw;
        let assumptions: string[] | undefined;
        try {
          const j = raw.match(/```json\s*([\s\S]*?)```/)?.[1];
          assumptions = j ? JSON.parse(j).assumptions : undefined;
        } catch {
          assumptions = undefined;
        }
        const r = await setCartoon(api, a[0], a[1], a[2], code, flags.note, assumptions);
        json(io, r);
        return (r as { ok?: boolean }).ok ? 0 : 1;
      }
      case "set-custom": {
        need(a, 4, "set-custom <pid> <key> <sid> <code-file|->");
        const r = await setCustomScene(api, a[0], a[1], a[2], io.readFile(a[3]), flags.note);
        json(io, r);
        return 0;
      }
      case "set-reading": {
        need(a, 5, "set-reading <pid> <key> <sid> <idx> <cách đọc...>");
        const idx = Number(a[3]);
        if (!Number.isInteger(idx) || idx < 0) throw new UsageError("idx phải là số thứ tự câu (từ 0)");
        json(io, await setReading(api, a[0], a[1], a[2], idx, a.slice(4).join(" ")));
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
        json(io, await suggestReading(api, a[0], a[1], a[2], idx, a.slice(4).join(" "), flags.reason, glossary));
        return 0;
      }
      case "check": {
        need(a, 2, "check <pid> <key>");
        const job = await startCheck(api, a[0], a[1]);
        if (job.kind !== "design") io.err(`Video đang có job #${job.id} (${job.kind}) – chờ job đó trước`);
        const j = await wait(job.id, Number(flags.timeout ?? 540));
        if (j.status === "timeout") {
          io.err(`Chưa xong – chạy: pnpm cvs wait ${job.id} rồi pnpm cvs qa ${a[0]} ${a[1]}`);
          return 2;
        }
        if (j.status !== "done") throw new Error(`Job #${job.id} ${j.status}: ${j.error ?? j.message ?? ""}`);
        json(io, (await qaReport(api, a[0], a[1])).summary);
        return 0;
      }
      case "qa":
        need(a, 2, "qa <pid> <key>");
        json(io, (await qaReport(api, a[0], a[1])).summary);
        return 0;
      case "render": {
        need(a, 2, "render <pid> <key>");
        const job = await renderVideo(api, a[0], a[1]);
        json(io, { job: job.id, kind: job.kind, status: job.status, next: `pnpm cvs wait ${job.id}` });
        return 0;
      }
      case "wait": {
        need(a, 1, "wait <jobId>");
        const j = await wait(Number(a[0]), Number(flags.timeout ?? 540));
        json(io, { id: j.id, kind: j.kind, video: j.video_key, status: j.status, message: j.message, error: j.error });
        return j.status === "done" ? 0 : j.status === "timeout" ? 2 : 1;
      }
      case "pending":
        json(io, await pendingRequests(api));
        return 0;
      case "done":
      case "fail": {
        need(a, cmd === "fail" ? 2 : 1, cmd === "fail" ? "fail <reqId> <lý do...>" : "done <reqId> [lời nhắn...]");
        json(io, await markRequest(api, a[0], cmd === "done" ? "done" : "failed", a.slice(1).join(" ")));
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
    base: apiBase(),
    fetch,
    out: (s) => console.log(s),
    err: (s) => console.error(s),
    readFile: (p) => readFileSync(p === "-" ? 0 : p, "utf8"),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  // gọi qua lệnh `pnpm` riêng của ứng dụng (claude-code-runner) → bỏ "-s"/"cvs" đứng đầu
  const args = process.argv.slice(2);
  while (args[0] === "-s" || args[0] === "cvs") args.shift();
  process.exitCode = await main(args, io);
}
