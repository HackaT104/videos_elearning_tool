// Phần dùng chung của `pnpm cvs` (scripts/cvs.ts) và máy chủ MCP cho Claude Desktop (apps/mcp): gọi API worker,
// rút gọn dữ liệu cho agent đọc, và các thao tác ghi (thiết kế cảnh, SVG, mã cảnh, render, soát QA).

export const DEFAULT_API = "http://127.0.0.1:3001/api";
export const apiBase = (env: Record<string, string | undefined> = process.env) => (env.CVS_API ?? DEFAULT_API).replace(/\/$/, "");

export type Api = ReturnType<typeof createApi>;

export function createApi(base: string, f: typeof fetch = fetch) {
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await f(`${base}${path}`, { method, headers: body !== undefined ? { "content-type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error(`Không kết nối được worker ở ${base} – mở ứng dụng bằng KHOI_DONG.cmd (hoặc pnpm start) rồi thử lại`);
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
  /** Tải tệp trong thư mục lưu trữ (ảnh khung, ảnh tham chiếu) qua /files. */
  const file = async (path: string): Promise<Buffer> => {
    let res: Response;
    try {
      res = await f(`${base}/files?path=${encodeURIComponent(path)}`);
    } catch {
      throw new Error(`Không kết nối được worker ở ${base}`);
    }
    if (!res.ok) throw new Error(`Không tải được ${path} (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  };
  return {
    base,
    get: <T = any>(p: string) => call<T>("GET", p),
    post: <T = any>(p: string, b: unknown) => call<T>("POST", p, b),
    patch: <T = any>(p: string, b: unknown) => call<T>("PATCH", p, b),
    file,
  };
}

export const enc = encodeURIComponent;
export const vpath = (pid: string, key: string) => `/projects/${enc(pid)}/videos/${enc(key)}`;
export const elideSvg = (d: unknown) => JSON.parse(JSON.stringify(d ?? null, (k, v) => (k === "svg" && typeof v === "string" ? `(SVG ${v.length} ký tự – giữ nguyên brief để giữ hình)` : k === "svgKey" ? undefined : v)));

// ---------- xem ----------
export const projectsView = async (api: Api) =>
  (await api.get("/projects")).map((p: any) => ({ id: p.id, name: p.name, course: p.course, videos: p.videos, style: p.settings?.style, styleConfirmed: !!p.settings?.styleConfirmed }));

export const videosView = async (api: Api, pid: string) =>
  (await api.get(`/projects/${enc(pid)}/videos`)).map((v: any) => ({ key: v.key, title: v.title, status: v.status, include: v.include, scenes: v.scenes, seconds: v.seconds, estimated: v.estimated, engine: v.engine, style: v.style, qaOk: v.qaOk, rendered: v.rendered, approved: v.approved, job: v.job ? { id: v.job.id, kind: v.job.kind, status: v.job.status, message: v.job.message } : null }));

export async function videoView(api: Api, pid: string, key: string) {
  const v = await api.get(vpath(pid, key));
  const d = v.data;
  return {
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
  };
}

export async function templatesView(api: Api) {
  const m = await api.get("/meta");
  return {
    templates: m.templates,
    icons: { count: m.icons.length, names: m.icons },
    kineticPresets: m.kineticPresets ?? [],
    themes: m.themes.map((t: any) => ({ id: t.id, name: t.name, dark: t.dark, fonts: t.fonts })),
    fonts: m.fonts.map((f: any) => ({ id: f.id, name: f.name, display: f.display, body: f.body })),
  };
}

export const pendingRequests = (api: Api, projectId?: string) => api.get(`/claude-code/requests?status=pending,running${projectId ? `&projectId=${enc(projectId)}` : ""}`);

export const markRequest = (api: Api, id: number | string, status: "done" | "failed", message?: string) => api.patch(`/claude-code/requests/${enc(String(id))}`, { status, message: message || undefined });

/** Đúng prompt mà Claude API nhận. translate-subs: note = "<lang> [all]"; analyze-doc: key = mã tài liệu. */
export const getPrompt = (api: Api, kind: string, pid: string, key?: string, sceneId?: string, note?: string) =>
  api.post<{ system: string; content: string }>("/claude-code/prompt", { kind, projectId: pid, videoKey: key, fileId: key, sceneId, note });

export type QaFrame = { file: string; label?: string; scene?: string; t?: number };

/** Báo cáo QA rút gọn + danh sách ảnh khung (đường dẫn tuyệt đối trong thư mục lưu trữ). */
export async function qaReport(api: Api, pid: string, key: string) {
  const v = await api.get(vpath(pid, key));
  const qa = v.qa;
  if (!qa) return { summary: { ok: null, message: "Chưa có báo cáo QA – chạy check" }, frames: [] as QaFrame[] };
  const frames: Record<string, string[]> = {};
  for (const f of qa.frames ?? []) (frames[f.scene ?? "?"] ??= []).push(`${f.file}  (${f.label ?? ""})`);
  return { summary: { ok: qa.ok, checkedAt: qa.checkedAt, items: qa.items, assumptions: qa.assumptions, sheet: qa.sheet, frames, rendered: qa.rendered ?? null }, frames: (qa.frames ?? []) as QaFrame[] };
}

// ---------- ghi ----------
export type DesignReply = { template: string; params?: Record<string, unknown>; customCode?: unknown; assumptions?: string[]; alternatives?: string[]; reason?: string; confidence?: number };

export function setSceneDesign(api: Api, pid: string, key: string, sid: string, d: DesignReply, note?: string) {
  if (!d || typeof d.template !== "string") throw new Error('JSON cần dạng {"template": "...", "params": {...}, "assumptions": [...]}');
  return api.patch(`${vpath(pid, key)}/scenes/${enc(sid)}`, { design: { template: d.template, params: d.params ?? {}, customCode: d.customCode, ...(d.reason ? { decision: { alternatives: d.alternatives, reason: d.reason, confidence: d.confidence } } : {}) }, assumptions: d.assumptions ?? [], note, by: "ai" });
}

/** Ghi SVG cho cảnh illustration, giữ các tham số khác của cảnh. */
export async function setSvg(api: Api, pid: string, key: string, sid: string, svg: string, brief?: string, note?: string) {
  const v = await api.get(vpath(pid, key));
  const scene = v.data.scenes.find((s: any) => s.id === sid);
  if (!scene) throw new Error(`Không có cảnh ${sid}`);
  const cur = scene.design?.template === "illustration" ? scene.design.params : {};
  const b = brief ?? cur.brief;
  if (!b) throw new Error('Cảnh chưa là illustration có brief – thêm --brief "mô tả hình" (hoặc set-design template illustration trước)');
  return api.patch(`${vpath(pid, key)}/scenes/${enc(sid)}`, { design: { template: "illustration", params: { ...cur, brief: b, svg } }, note, by: "ai" });
}

/** Ghi mã cảnh tùy biến theo engine của video. */
export async function setCustomScene(api: Api, pid: string, key: string, sid: string, code: string, note?: string) {
  const v = await api.get(vpath(pid, key));
  return api.patch(`${vpath(pid, key)}/scenes/${enc(sid)}`, { design: { template: "custom", customCode: { [v.data.engine]: code } }, assumptions: ["Cảnh tùy biến do AI (Claude Code) viết mã"], note, by: "ai" });
}

export type Glossary = { term: string; reading: string }[];
export const setReading = (api: Api, pid: string, key: string, sid: string, idx: number, tts: string) => api.patch(`${vpath(pid, key)}/sentence`, { scene: sid, idx, tts });
export const suggestReading = (api: Api, pid: string, key: string, sid: string, idx: number, tts: string, reason?: string, glossary?: Glossary) =>
  api.patch(`${vpath(pid, key)}/sentence`, { scene: sid, idx, suggest: { tts, reason, glossary, by: "claude-code" } });
export const setSubs = (api: Api, pid: string, key: string, lang: string, d: unknown) =>
  api.patch(`${vpath(pid, key)}/subs`, { lang, translations: Array.isArray(d) ? d : (d as any)?.translations, by: "claude-code" });

/** Xếp hàng render (chưa có giọng → sản xuất đủ; đã render → không bắt chọn lại phong cách). */
export async function renderVideo(api: Api, pid: string, key: string) {
  const v = await api.get(vpath(pid, key));
  const kind = v.summary?.estimated ? "produce" : "render";
  const [job] = await api.post(`/projects/${enc(pid)}/jobs`, { kind, keys: [key], payload: v.summary?.rendered ? { skipStyle: true } : {} });
  return job;
}

/** Xếp job dựng + QA (giữ thiết kế đã ghi). */
export const startCheck = async (api: Api, pid: string, key: string) => (await api.post(`/projects/${enc(pid)}/jobs`, { kind: "design", keys: [key], payload: {} }))[0];

/** Chờ job tới trạng thái cuối; trả về job (status "timeout" nếu hết giờ). */
export async function waitJob(api: Api, id: number, timeoutSec: number, sleep: (ms: number) => Promise<void>, log: (s: string) => void = () => {}) {
  const until = Date.now() + timeoutSec * 1000;
  let last = "";
  for (;;) {
    const j = await api.get(`/jobs/${id}`);
    if (!j) throw new Error(`Không có job ${id}`);
    const line = `#${id} ${j.kind} ${j.status} ${Math.round(j.progress ?? 0)}% ${j.message ?? ""}`;
    if (line !== last) log(line);
    last = line;
    if (["done", "failed", "canceled"].includes(j.status)) return j;
    if (Date.now() >= until) return { ...j, status: "timeout" };
    await sleep(2000);
  }
}
