// API HTTP cho giao diện (Next.js proxy /api/* → đây). Chạy cùng tiến trình worker.

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  checkTts, createNormalizer, DEFAULT_GLOSSARY, LEVEL_PRESETS, readXlsxHeaders, renormalizeVideo, tierOfLevel, EDGE_VOICES,
  type ColumnMap, type GlossaryEntry, type Video,
} from "@cvs/core";
import {
  addGlossary, createProject, deleteGlossary, deleteVideo, enqueueJob, getJob, getProject, getVideo, glossaryFor, listFiles, listGlossary, listJobs,
  listProjects, listVideos, paths, setVideoFlags, STORAGE, updateJob, updateProject, upsertVideo, activeJobFor, cacheVoices, listVoices, type JobKind,
} from "@cvs/db";
import {
  archiveItems, claudeAuthStatus, claudeLogout, saveClaudeKey, startClaudeLogin, testClaude, cleanupCandidates, crossLevelWarnings, currentTiming, exportProject, ingestFile, listStylePreviews, openFolder, readingIssues, renormalizeProject, undoSceneDesign,
} from "@cvs/studio";
import {
  CIT_TERMS_URL, CitClient, citManagerState, ensureCitRunning, ensureZerottsRunning, installCit, installZerotts, restartCit, restartZerotts,
  ZEROTTS_REPO, ZEROTTS_VOICES, ZerottsClient, zerottsManagerState,
} from "@cvs/tts";
import { DEFAULT_FONT_PAIR, FONT_PAIRS, fontFaceUrlCss, fontFilePath, THEMES, THEME_IDS } from "@cvs/themes";
import { TEMPLATES, ICON_NAMES } from "@cvs/engine";
import { aiAvailable } from "@cvs/ai";

const app = new Hono().basePath("/api");

app.onError((e, c) => c.json({ error: e.message }, 500));

// ---------- hệ thống ----------
app.get("/health", (c) => c.json({ ok: true, storage: STORAGE, ai: aiAvailable() }));
app.get("/meta", (c) =>
  c.json({
    themes: THEME_IDS.map((id) => ({ id, name: THEMES[id].name, description: THEMES[id].description, dark: THEMES[id].dark, colors: THEMES[id].colors, fonts: { display: THEMES[id].fonts.display.family, body: THEMES[id].fonts.body.family, displayWeight: THEMES[id].fonts.display.weight } })),
    templates: Object.values(TEMPLATES).map((t) => ({ id: t.id, label: t.label, when: t.when, example: t.example, schema: t.schema })),
    icons: ICON_NAMES,
    levels: LEVEL_PRESETS,
    defaultGlossary: DEFAULT_GLOSSARY,
    ai: aiAvailable(),
    edgeVoices: EDGE_VOICES,
    zerottsVoices: ZEROTTS_VOICES,
    fonts: FONT_PAIRS.map((p) => ({ id: p.id, name: p.name, description: p.description, display: p.display.family, body: p.body.family, displayWeight: p.display.weight, generic: p.display.generic ?? "sans-serif" })),
  }),
);
// Phông cho trang xem trước: CSS @font-face trỏ tới file trong gói @fontsource (trình duyệt chỉ tải phần ký tự cần).
app.get("/fonts.css", (c) => {
  const refs = FONT_PAIRS.flatMap((p) => [p.display, p.body]);
  return c.body(fontFaceUrlCss(refs, (pkg, file) => `/api/fonts/${pkg}/${file}`), 200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400" });
});
app.get("/fonts/:pkg/:file", (c) => {
  const p = fontFilePath(c.req.param("pkg"), c.req.param("file"));
  if (!p) return c.text("Không có phông", 404);
  return c.body(readFileSync(p), 200, { "content-type": "font/woff2", "cache-control": "public, max-age=604800, immutable" });
});
app.get("/tts/status", async (c) => {
  const cit = new CitClient();
  const st = await cit.status();
  if (st.ok) {
    try {
      cacheVoices("cit", await cit.voices());
    } catch {
      /* bỏ qua */
    }
  }
  return c.json({ ...st, url: cit.baseUrl, mock: process.env.CVS_TTS_MOCK === "1", manager: citManagerState(), terms: CIT_TERMS_URL });
});
app.get("/claude/status", (c) => c.json({ ...claudeAuthStatus(), available: aiAvailable() }));
app.post("/claude/key", async (c) => {
  const { apiKey } = await c.req.json();
  saveClaudeKey(String(apiKey ?? ""));
  return c.json(await testClaude());
});
app.post("/claude/login", async (c) => {
  await startClaudeLogin();
  return c.json(claudeAuthStatus());
});
app.post("/claude/logout", async (c) => {
  await claudeLogout();
  return c.json(claudeAuthStatus());
});
app.post("/claude/test", async (c) => c.json(await testClaude()));
app.get("/cit/manager", (c) => c.json(citManagerState()));
app.post("/cit/install", (c) => {
  // chạy nền: tải ~400 MB rồi cài; giao diện đọc tiến độ qua /cit/manager
  installCit()
    .then(() => ensureCitRunning())
    .catch(() => undefined);
  return c.json({ ok: true });
});
app.post("/cit/restart", async (c) => c.json({ ok: await restartCit() }));
// ZeroTTS: 8 giọng cố định – hiện được cả khi máy chủ chưa chạy (chưa có trong bộ nhớ đệm).
const zerottsRows = () => ZEROTTS_VOICES.map((v) => ({ provider: "zerotts", id: v.id, name: v.name, gender: v.gender ?? null, region: null, description: v.description ?? null, cloned: 0 }));
app.get("/tts/voices", (c) => {
  const provider = c.req.query("provider");
  const rows = listVoices(provider);
  if ((!provider || provider === "zerotts") && !rows.some((r) => r.provider === "zerotts")) rows.push(...zerottsRows());
  return c.json(rows);
});
app.get("/zerotts/status", async (c) => {
  const z = new ZerottsClient({ retries: 0 });
  const st = await z.status();
  if (st.ok) {
    try {
      cacheVoices("zerotts", await z.voices());
    } catch {
      /* bỏ qua */
    }
  }
  return c.json({ ...st, url: z.baseUrl, mock: process.env.CVS_TTS_MOCK === "1", manager: zerottsManagerState(), repo: ZEROTTS_REPO });
});
app.post("/zerotts/install", (c) => {
  // chạy nền: venv + pip + tải mô hình (~300–900 MB) + int8; giao diện đọc tiến độ qua /zerotts/status
  if (zerottsManagerState().installing) return c.json({ ok: true, already: true });
  installZerotts()
    .then(() => ensureZerottsRunning())
    .catch(() => undefined);
  return c.json({ ok: true });
});
app.post("/zerotts/restart", async (c) => c.json({ ok: await restartZerotts() }));
app.post("/open-folder", async (c) => {
  const { path } = await c.req.json();
  const p = resolve(path);
  if (!p.startsWith(STORAGE)) return c.json({ error: "Đường dẫn ngoài thư mục lưu trữ" }, 400);
  openFolder(p);
  return c.json({ ok: true });
});

// ---------- dự án ----------
app.get("/projects", (c) => c.json(listProjects().map((p) => ({ ...p, videos: listVideos(p.id).length }))));
app.post("/projects", async (c) => {
  const b = await c.req.json();
  if (!b.name || !b.course) return c.json({ error: "Cần tên khóa và mã khóa" }, 400);
  return c.json(createProject(b.name, b.course, b.levels?.length ? b.levels : ["L1"], b.settings ?? {}));
});
app.get("/projects/:id", (c) => {
  const p = getProject(c.req.param("id"));
  if (!p) return c.json({ error: "Không tìm thấy dự án" }, 404);
  return c.json({ ...p, files: listFiles(p.id), warnings: crossLevelWarnings(p.id), out: paths.out(p.id) });
});
app.patch("/projects/:id", async (c) => {
  const b = await c.req.json();
  const p = updateProject(c.req.param("id"), b);
  if (b.applyToVideos) {
    for (const v of listVideos(p.id)) {
      const d = v.data;
      if (b.settings?.style) d.style = b.settings.style;
      if (b.settings?.engine) d.engine = b.settings.engine;
      if (b.settings && "font" in b.settings) d.font = b.settings.font && b.settings.font !== DEFAULT_FONT_PAIR ? b.settings.font : undefined;
      upsertVideo(p.id, d);
    }
  }
  return c.json(p);
});

// ---------- tải file ----------
app.post("/projects/:id/upload", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const level = String(form.get("level") ?? "L1");
  const maps = form.get("columnMaps") ? (JSON.parse(String(form.get("columnMaps"))) as Record<string, ColumnMap>) : undefined;
  const out = [];
  let firstKey: string | undefined;
  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    const buf = Buffer.from(await f.arrayBuffer());
    try {
      const r = await ingestFile(id, f.name, buf, level, maps);
      out.push({ name: f.name, kind: r.result.kind, videos: r.result.videos.map((v) => v.key), warnings: r.result.warnings, outline: r.result.outline, topic: r.result.topic, fileId: r.fileId });
      firstKey ??= r.result.videos[0]?.key;
    } catch (e) {
      out.push({ name: f.name, error: (e as Error).message });
    }
  }
  // Tự dựng sẵn 10 mẫu phong cách từ chính video vừa tải lên để người dùng chọn trước khi sản xuất.
  const p = getProject(id);
  if (firstKey && p && !p.settings.styleConfirmed) enqueueJob(id, "theme-preview", firstKey, {});
  return c.json(out);
});
app.get("/projects/:id/styles", (c) => {
  const id = c.req.param("id");
  const job = listJobs(id, 50).find((j) => j.kind === "theme-preview" && ["queued", "running"].includes(j.status)) ?? null;
  return c.json({ previews: listStylePreviews(id), job });
});
app.get("/projects/:id/progress", async (c) => {
  // Trạng thái từng bước – giao diện dùng để dẫn người dùng đi đúng thứ tự.
  const id = c.req.param("id");
  const p = getProject(id);
  if (!p) return c.json({ error: "Không tìm thấy dự án" }, 404);
  const vids = listVideos(id).filter((v) => v.include && !v.existing);
  const reading = vids.reduce((n, v) => n + readingIssues(v.data).length, 0);
  // "citOk" = giọng sẵn sàng cho các nguồn giọng mà video đang dùng (CIT và/hoặc ZeroTTS)
  const used = new Set(vids.map((v) => v.data.voice.provider));
  const cit = used.has("cit") || used.size === 0 ? await new CitClient().status() : { ok: true };
  const z = zerottsManagerState();
  const zOk = !used.has("zerotts") || z.running || z.installed;
  return c.json({
    uploaded: listFiles(id).length > 0,
    videos: vids.length,
    reading,
    styleConfirmed: !!p.settings.styleConfirmed,
    style: p.settings.style,
    citOk: (cit.ok && zOk) || process.env.CVS_TTS_MOCK === "1",
    rendered: vids.filter((v) => existsSync(paths.render(id, v.key))).length,
    approved: vids.filter((v) => v.approved).length,
  });
});
app.post("/xlsx-headers", async (c) => {
  const form = await c.req.formData();
  const f = form.get("file");
  if (!f || typeof f === "string") return c.json({ error: "Thiếu file" }, 400);
  return c.json(await readXlsxHeaders(Buffer.from(await f.arrayBuffer())));
});

// ---------- video ----------
const videoSummary = (projectId: string, v: ReturnType<typeof listVideos>[number]) => {
  const timing = currentTiming(projectId, v.data);
  const job = activeJobFor(projectId, v.key);
  return {
    key: v.key,
    level: v.level,
    title: v.title,
    include: v.include,
    existing: v.existing,
    status: v.status,
    approved: v.approved,
    scenes: v.data.scenes.length,
    scriptSeconds: v.data.scenes.reduce((m, s) => Math.max(m, s.scriptEnd), 0),
    seconds: timing.total,
    estimated: timing.estimated,
    engine: v.data.engine,
    style: v.data.style,
    font: v.data.font,
    voice: v.data.voice,
    pace: v.data.pace,
    aiWritten: !!v.data.aiWritten,
    qaOk: (v.qa as any)?.ok ?? null,
    rendered: existsSync(paths.render(projectId, v.key)),
    job,
    assumptions: v.data.scenes.reduce((n, s) => n + (s.assumptions?.length ?? 0), 0),
  };
};
app.get("/projects/:id/videos", (c) => {
  const id = c.req.param("id");
  return c.json(listVideos(id).map((v) => videoSummary(id, v)));
});
app.get("/projects/:id/videos/:key", (c) => {
  const id = c.req.param("id");
  const v = getVideo(id, c.req.param("key"));
  if (!v) return c.json({ error: "Không tìm thấy video" }, 404);
  return c.json({ ...v, summary: videoSummary(id, v), timing: currentTiming(id, v.data) });
});
app.put("/projects/:id/videos/:key", async (c) => {
  const id = c.req.param("id");
  const video = (await c.req.json()) as Video;
  if (video.key !== c.req.param("key")) return c.json({ error: "Mã video không khớp" }, 400);
  upsertVideo(id, video);
  setVideoFlags(id, video.key, { approved: false });
  return c.json({ ok: true });
});
// Hoàn tác lần sửa cảnh gần nhất rồi render lại (giữ giọng).
app.post("/projects/:id/videos/:key/scenes/:sid/undo", (c) => {
  const id = c.req.param("id");
  const key = c.req.param("key");
  if (!undoSceneDesign(id, key, c.req.param("sid"))) return c.json({ error: "Cảnh này chưa có lần sửa nào để hoàn tác" }, 400);
  const job = enqueueJob(id, "render", key, { skipStyle: true });
  return c.json({ ok: true, job });
});
app.patch("/projects/:id/videos/:key", async (c) => {
  const id = c.req.param("id");
  const key = c.req.param("key");
  const b = await c.req.json();
  if (b.approve) {
    const v = getVideo(id, key)!;
    if (!(v.qa as any)?.ok && !b.override) return c.json({ error: "QA chưa đạt – xem báo cáo hoặc đánh dấu bỏ qua" }, 400);
  }
  setVideoFlags(id, key, { include: b.include, existing: b.existing, approved: b.approve ?? b.approved });
  return c.json({ ok: true });
});
app.delete("/projects/:id/videos/:key", (c) => {
  deleteVideo(c.req.param("id"), c.req.param("key"));
  return c.json({ ok: true });
});
app.post("/projects/:id/normalize", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = c.req.param("id");
  if (b.text !== undefined) return c.json(createNormalizer({ glossary: glossaryFor(id) })(b.text));
  renormalizeProject(id);
  return c.json({ ok: true });
});
app.get("/projects/:id/reading", (c) => {
  const id = c.req.param("id");
  const norm = createNormalizer({ glossary: glossaryFor(id) });
  const rows = [];
  for (const v of listVideos(id)) {
    if (!v.include || v.existing) continue;
    for (const s of v.data.scenes)
      for (const [k, x] of s.sentences.entries()) {
        const r = norm(x.text);
        rows.push({ key: v.key, scene: s.id, idx: k, text: x.text, tts: x.tts, locked: !!x.ttsLocked, changed: x.tts !== x.text, rules: r.rules, warnings: checkTts(x.tts), voice: v.data.voice });
      }
  }
  return c.json(rows);
});
app.patch("/projects/:id/videos/:key/sentence", async (c) => {
  const id = c.req.param("id");
  const b = (await c.req.json()) as { scene: string; idx: number; tts: string };
  const v = getVideo(id, c.req.param("key"))!;
  const s = v.data.scenes.find((x) => x.id === b.scene)!;
  s.sentences[b.idx] = { ...s.sentences[b.idx], tts: b.tts, ttsLocked: true };
  upsertVideo(id, v.data);
  return c.json({ ok: true, warnings: checkTts(b.tts) });
});
app.post("/projects/:id/videos/:key/renormalize", (c) => {
  const id = c.req.param("id");
  const v = getVideo(id, c.req.param("key"))!;
  upsertVideo(id, renormalizeVideo(v.data, { glossary: glossaryFor(id) }));
  return c.json({ ok: true });
});
app.get("/projects/:id/videos/:key/vtt", (c) => {
  const id = c.req.param("id");
  const v = getVideo(id, c.req.param("key"))!;
  const t = currentTiming(id, v.data);
  const ts = (s: number) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23);
  const lines = ["WEBVTT", ""];
  v.data.scenes.forEach((s, i) => {
    const st = t.scenes[i];
    s.sentences.forEach((x, k) => lines.push(`${ts(st.start + st.cues[k])} --> ${ts(st.start + (st.ends[k] ?? st.dur))}`, x.text, ""));
  });
  return c.text(lines.join("\n"), 200, { "Content-Type": "text/vtt; charset=utf-8" });
});
app.post("/projects/:id/voice-preset", async (c) => {
  // áp cấu hình giọng/nhịp theo cấp độ (xen kẽ nam/nữ cho Cơ bản)
  const id = c.req.param("id");
  const b = await c.req.json();
  const vids = listVideos(id).filter((v) => (!b.level || v.level === b.level) && (!b.keys?.length || b.keys.includes(v.key)) && v.include && !v.existing);
  vids.forEach((v, i) => {
    const d = v.data;
    const preset = LEVEL_PRESETS[tierOfLevel(d.level)];
    if (b.voice) d.voice = { ...d.voice, ...b.voice };
    if (b.alternate) d.voice.voiceId = i % 2 === 0 ? b.alternate[0] : b.alternate[1];
    if (b.pace) d.pace = { ...d.pace, ...b.pace };
    if (b.resetPreset) {
      d.pace = { ...preset.pace };
      d.voice.speed = preset.speed;
    }
    upsertVideo(id, d);
  });
  return c.json({ ok: true, count: vids.length });
});

// ---------- job ----------
app.get("/projects/:id/jobs", (c) => c.json(listJobs(c.req.param("id"))));
app.post("/projects/:id/jobs", async (c) => {
  const id = c.req.param("id");
  const b = (await c.req.json()) as { kind: JobKind; keys?: (string | null)[]; payload?: unknown };
  const keys = b.keys?.length ? b.keys : [null];
  const jobs = keys.map((k) => {
    const active = k ? activeJobFor(id, k) : null;
    if (active && ["agent", "produce", "voice", "visual", "render", "design", "revise"].includes(b.kind)) return active;
    return enqueueJob(id, b.kind, k, b.payload ?? {});
  });
  return c.json(jobs);
});
app.get("/jobs/:jid", (c) => c.json(getJob(Number(c.req.param("jid")))));
app.patch("/jobs/:jid", async (c) => {
  const jid = Number(c.req.param("jid"));
  const { action } = await c.req.json();
  const j = getJob(jid);
  if (!j) return c.json({ error: "Không có job" }, 404);
  if (action === "pause" && ["queued", "running"].includes(j.status)) updateJob(jid, { status: "paused", message: "Đã tạm dừng" });
  else if (action === "resume" && j.status === "paused") updateJob(jid, { status: "queued", message: "Tiếp tục" });
  else if (action === "cancel") updateJob(jid, { status: "canceled", message: "Đã hủy" });
  else if (action === "retry" && ["failed", "canceled"].includes(j.status)) return c.json(enqueueJob(j.project_id, j.kind, j.video_key, j.payload));
  return c.json(getJob(jid));
});

// ---------- glossary ----------
app.get("/glossary", (c) => {
  const p = c.req.query("project");
  return c.json({ shared: listGlossary(null), project: p ? listGlossary(p) : [], defaults: DEFAULT_GLOSSARY });
});
app.post("/glossary", async (c) => {
  const b = (await c.req.json()) as GlossaryEntry & { project?: string | null };
  if (!b.term || !b.reading) return c.json({ error: "Cần cụm từ và cách đọc" }, 400);
  addGlossary(b.project ?? null, b);
  return c.json({ ok: true });
});
app.delete("/glossary/:gid", (c) => {
  deleteGlossary(Number(c.req.param("gid")));
  return c.json({ ok: true });
});

// ---------- xuất & dọn dẹp ----------
app.post("/projects/:id/export", async (c) => c.json(await exportProject(c.req.param("id"))));
app.get("/projects/:id/cleanup", (c) => c.json(cleanupCandidates(c.req.param("id"))));
app.post("/projects/:id/cleanup", async (c) => {
  const { paths: ps } = await c.req.json();
  return c.json({ archivedTo: archiveItems(c.req.param("id"), ps) });
});

// ---------- tệp trong thư mục lưu trữ (video, ảnh, giọng) ----------
const MIME: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png", ".mp3": "audio/mpeg", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8" };
app.get("/files", (c) => {
  const p = resolve(c.req.query("path") ?? "");
  if (!(p === STORAGE || p.startsWith(STORAGE + sep)) || !existsSync(p) || statSync(p).isDirectory()) return c.json({ error: "Không có tệp" }, 404);
  const size = statSync(p).size;
  const type = MIME[extname(p).toLowerCase()] ?? "application/octet-stream";
  const range = c.req.header("range")?.match(/bytes=(\d*)-(\d*)/);
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (c.req.query("download")) headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(p.split(sep).pop()!)}"`;
  if (range) {
    const s = range[1] ? Number(range[1]) : 0;
    const e = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    return new Response(Readable.toWeb(createReadStream(p, { start: s, end: e })) as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${s}-${e}/${size}`, "Content-Length": String(e - s + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(p)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
});

export function startApi(port = Number(process.env.CVS_API_PORT ?? 3001)) {
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  console.log(`API: http://127.0.0.1:${port}/api`);
}

export { app };
