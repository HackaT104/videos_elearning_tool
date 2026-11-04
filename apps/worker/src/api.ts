// API HTTP cho giao diện (Next.js proxy /api/* → đây). Chạy cùng tiến trình worker.

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import {
  checkTts, createNormalizer, DEFAULT_GLOSSARY, SUB_LANGS, LEVEL_PRESETS, readXlsxHeaders, renormalizeVideo, tierOfLevel, EDGE_VOICES,
  type ColumnMap, type GlossaryEntry, type Video,
} from "@cvs/core";
import {
  addGlossary, createProject, deleteGlossary, deleteVideo, enqueueJob, getFile, getJob, getProject, getVideo, glossaryFor, listFiles, listGlossary, listJobs,
  listProjects, listVideos, paths, setVideoFlags, STORAGE, updateJob, updateProject, upsertVideo, activeJobFor, cacheVoices, listVoices, type JobKind,
  addClaudeRequest, CLAUDE_REQUEST_KINDS, getClaudeRequest, listClaudeRequests, updateClaudeRequest, type ClaudeRequestKind,
} from "@cvs/db";
import {
  AssetError, assetFile, deleteAsset, listAssets, MAX_ASSET_BYTES, saveAsset,
  applySceneEdit, claudeCodePrompt, archiveItems, archiveSnapshots, deleteItems, claudeAuthStatus, claudeLogout, submitClaudeLoginCode, saveClaudeKey, startClaudeLogin, testClaude, cleanupCandidates, crossLevelWarnings, currentTiming, exportProject, ingestFile, listStylePreviews, openFolder, readingIssues, renormalizeProject, undoSceneDesign,
  acceptAllReadings, resolveReadingSuggestion, setReadingSuggestion, videoVtt, pickFolder, NoGuiError,
  claudeRunnerStatus, startClaudeRun, installClaudeCode, openClaudeLogin, claudeCodeSettings, setClaudeCodeSettings,
  applyDocPlan, docPlanView, saveDocPlan, saveScriptReply,
  applyOverlayDefaults,
  deleteCustomTheme, deleteStyleVideo, ensureProjectTheme, listCustomThemes, listStyleVideos, loadBrief, previewKey, saveStyleVideo, saveThemeReply, saveThemeToLibrary,
  setStyleBrief, StyleRefError, styleRefs, tweakCustomTheme, MAX_REF_VIDEO_BYTES, saveStyleDoc, listStyleDocs, deleteStyleDoc, StyleDocError, MAX_STYLE_DOC_BYTES,
  checkLocation, dataInfo, defaultVideoDir, listLocations, requestDataMove, setDefaultVideoDir,
} from "@cvs/studio";
import { overlayRoutes, overlayStale } from "./api-overlay";
import { mediaRoutes } from "./api-media";
import { claudeDesktopRoutes } from "./claude-desktop";
import {
  CIT_TERMS_URL, CitClient, citManagerState, ensureCitRunning, ensureZerottsRunning, installCit, installZerotts, restartCit, restartZerotts,
  ZEROTTS_REPO, ZEROTTS_VOICES, ZerottsClient, zerottsManagerState,
} from "@cvs/tts";
import { DEFAULT_FONT_PAIR, FONT_PAIRS, fontFaceUrlCss, fontFilePath, isCustomThemeId, THEMES, THEME_IDS } from "@cvs/themes";
import { TEMPLATES, ICON_NAMES, KINETIC_PRESETS } from "@cvs/engine";
import { aiAvailable, aiBlockedReason, setApiAllowed } from "@cvs/ai";
import { isLocalRequest, quitApp } from "./desktop";
import { setupStatus, startSetup } from "./setup";
import { APP_VERSION, checkForUpdate, installUpdate, saveUpdateSettings, updateStatus } from "./update";

const app = new Hono().basePath("/api");
overlayRoutes(app);
mediaRoutes(app);
claudeDesktopRoutes(app);

app.onError((e, c) => c.json({ error: e.message }, 500));

// ---------- hệ thống ----------
app.get("/health", (c) => c.json({ ok: true, storage: STORAGE, ai: aiAvailable(), version: APP_VERSION }));

// ---------- ứng dụng trên máy tính: thoát, chuẩn bị lần đầu, cập nhật ----------
const remoteAddr = (c: { env: unknown }) => (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
app.post("/app/quit", (c) => {
  if (!isLocalRequest(remoteAddr(c), c.req.raw.headers)) return c.json({ error: "Chỉ thoát được ngay trên máy tính đang chạy ứng dụng" }, 403);
  quitApp();
  return c.json({ ok: true });
});
app.get("/setup/status", (c) => c.json(setupStatus()));
app.post("/setup/run", (c) => {
  if (!isLocalRequest(remoteAddr(c), c.req.raw.headers)) return c.json({ error: "Chỉ chạy được ngay trên máy tính đang chạy ứng dụng" }, 403);
  startSetup();
  return c.json(setupStatus());
});
app.get("/update/status", (c) => c.json(updateStatus()));
app.post("/update/check", async (c) => c.json(await checkForUpdate()));
app.post("/update/settings", async (c) => {
  if (!isLocalRequest(remoteAddr(c), c.req.raw.headers)) return c.json({ error: "Chỉ đổi được ngay trên máy tính đang chạy ứng dụng" }, 403);
  try {
    saveUpdateSettings(await c.req.json());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  return c.json(updateStatus());
});
app.post("/update/install", (c) => {
  if (!isLocalRequest(remoteAddr(c), c.req.raw.headers)) return c.json({ error: "Chỉ cập nhật được ngay trên máy tính đang chạy ứng dụng" }, 403);
  const r = installUpdate();
  return r.ok ? c.json(updateStatus()) : c.json({ error: r.error }, 400);
});
app.get("/meta", (c) =>
  c.json({
    themes: THEME_IDS.map((id) => ({ id, name: THEMES[id].name, description: THEMES[id].description, dark: THEMES[id].dark, colors: THEMES[id].colors, fonts: { display: THEMES[id].fonts.display.family, body: THEMES[id].fonts.body.family, displayWeight: THEMES[id].fonts.display.weight } })),
    templates: Object.values(TEMPLATES).map((t) => ({ id: t.id, label: t.label, when: t.when, example: t.example, schema: t.schema })),
    icons: ICON_NAMES,
    kineticPresets: KINETIC_PRESETS,
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
app.get("/claude/status", (c) => c.json({ ...claudeAuthStatus(), available: aiAvailable(), blocked: aiBlockedReason(), useApi: claudeCodeSettings().useApi }));
app.post("/claude/key", async (c) => {
  const { apiKey } = await c.req.json();
  saveClaudeKey(String(apiKey ?? ""));
  return c.json(await testClaude());
});
app.post("/claude/login", async (c) => {
  await startClaudeLogin();
  return c.json(claudeAuthStatus());
});
app.post("/claude/login/code", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = submitClaudeLoginCode(String(b.code ?? ""));
  return c.json(r, r.ok ? 200 : 400);
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
  const { path, projectId } = await c.req.json().catch(() => ({}));
  if (typeof path !== "string" || !path) return c.json({ error: "Thiếu đường dẫn" }, 400);
  const p = resolve(path);
  // ngoài storage: chỉ mở thư mục vừa xuất của dự án
  const exported = projectId ? getProject(String(projectId))?.settings.lastExport?.dir : undefined;
  if (!(p === STORAGE || p.startsWith(STORAGE + sep) || (exported && p === resolve(exported)))) return c.json({ error: "Đường dẫn ngoài thư mục lưu trữ" }, 400);
  if (!existsSync(p)) return c.json({ error: "Thư mục chưa có – hãy xuất trước" }, 404);
  openFolder(statSync(p).isDirectory() ? p : dirname(p));
  return c.json({ ok: true });
});
// Hộp chọn thư mục của hệ điều hành trên máy chạy worker (Windows/macOS/Linux có giao diện). Không có → {error, noGui} để web cho gõ đường dẫn.
app.post("/pick-folder", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try {
    return c.json(await pickFolder(typeof b.initial === "string" ? b.initial : undefined));
  } catch (e) {
    return c.json({ error: (e as Error).message, noGui: e instanceof NoGuiError }, 400);
  }
});

// ---------- dự án ----------
app.get("/projects", (c) => c.json(listProjects().map((p) => ({ ...p, videos: listVideos(p.id).length }))));
app.post("/projects", async (c) => {
  const b = await c.req.json();
  if (!b.name || !b.course) return c.json({ error: "Cần tên khóa và mã khóa" }, 400);
  const p = createProject(b.name, b.course, b.levels?.length ? b.levels : ["L1"], b.settings ?? {});
  applyOverlayDefaults(p.id); // phụ đề + logo "dùng cho mọi dự án"
  return c.json(getProject(p.id));
});
app.get("/projects/:id", (c) => {
  const p = getProject(c.req.param("id"));
  if (!p) return c.json({ error: "Không tìm thấy dự án" }, 404);
  return c.json({ ...p, files: listFiles(p.id), warnings: crossLevelWarnings(p.id), out: paths.out(p.id) });
});
/** Phong cách được chọn phải có: sẵn có, hoặc tuỳ chỉnh của dự án / thư viện (chép vào dự án). Lỗi → thông báo, null = hợp lệ. */
function styleError(pid: string, style: unknown): string | null {
  if (style === undefined || THEME_IDS.includes(style as never)) return null;
  if (!isCustomThemeId(style)) return `Phong cách "${String(style)}" không có`;
  try {
    ensureProjectTheme(pid, style);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
app.patch("/projects/:id", async (c) => {
  const b = await c.req.json();
  const bad = styleError(c.req.param("id"), b.settings?.style);
  if (bad) return c.json({ error: bad }, 400);
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
  // Tự dựng sẵn mẫu cho mọi phong cách từ chính video vừa tải lên để người dùng chọn trước khi sản xuất.
  const p = getProject(id);
  if (firstKey && p && !p.settings.styleConfirmed) enqueueJob(id, "theme-preview", firstKey, {});
  return c.json(out);
});
// ---------- Claude đọc và phân tích tài liệu: kế hoạch video ----------
app.get("/projects/:id/files/:fid/plan", (c) => {
  if (!getFile(c.req.param("id"), c.req.param("fid"))) return c.json({ error: "Không tìm thấy tài liệu" }, 404);
  return c.json(docPlanView(c.req.param("id"), c.req.param("fid")));
});
// Claude Code gửi kế hoạch (`pnpm cvs set-plan`) – kiểm như đường API
app.post("/projects/:id/files/:fid/plan", async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!getFile(c.req.param("id"), c.req.param("fid"))) return c.json({ error: "Không tìm thấy tài liệu" }, 404);
  try {
    const r = await saveDocPlan(c.req.param("id"), c.req.param("fid"), b?.plan ?? b, "claude-code");
    return c.json(r, r.ok ? 200 : 400);
  } catch (e) {
    return c.json({ ok: false, errors: [(e as Error).message] }, 400);
  }
});
app.post("/projects/:id/files/:fid/apply", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!getFile(c.req.param("id"), c.req.param("fid"))) return c.json({ error: "Không tìm thấy tài liệu" }, 404);
  try {
    return c.json(await applyDocPlan(c.req.param("id"), c.req.param("fid"), b.choices ?? []));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
// Claude Code gửi kịch bản viết lại (`pnpm cvs set-script`)
app.post("/projects/:id/videos/:key/script", async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!getProject(c.req.param("id"))) return c.json({ error: "Không tìm thấy dự án" }, 404);
  try {
    const r = await saveScriptReply(c.req.param("id"), c.req.param("key"), b);
    return c.json(r, r.ok ? 200 : 400);
  } catch (e) {
    return c.json({ ok: false, errors: [(e as Error).message] }, 400);
  }
});

// ---------- ảnh của dự án (dùng trong cảnh image-focus) ----------
const IMG_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
app.get("/projects/:id/assets", (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  return c.json(listAssets(id));
});
app.post("/projects/:id/assets", async (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  // chặn sớm theo Content-Length (multipart thêm ít byte ranh giới)
  if (Number(c.req.header("content-length") ?? 0) > MAX_ASSET_BYTES + 64 * 1024) return c.json({ error: "Ảnh quá lớn (tối đa 10 MB)" }, 413);
  const form = await c.req.formData().catch(() => null);
  const f = form?.get("file");
  if (!f || typeof f === "string") return c.json({ error: "Thiếu file ảnh (trường \"file\")" }, 400);
  if (f.size > MAX_ASSET_BYTES) return c.json({ error: "Ảnh quá lớn (tối đa 10 MB)" }, 413);
  try {
    return c.json(saveAsset(id, f.name, Buffer.from(await f.arrayBuffer())));
  } catch (e) {
    if (e instanceof AssetError) return c.json({ error: e.message }, 400);
    throw e;
  }
});
app.get("/projects/:id/assets/:aid", (c) => {
  const file = getProject(c.req.param("id")) ? assetFile(c.req.param("id"), c.req.param("aid")) : null;
  if (!file) return c.json({ error: "Không có ảnh" }, 404);
  return c.body(readFileSync(file), 200, {
    "Content-Type": IMG_MIME[extname(file).slice(1)] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    // SVG mở trực tiếp: không chạy script, không tải ngoài (đã lọc – thêm một lớp chặn)
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": "private, max-age=31536000, immutable",
  });
});
app.delete("/projects/:id/assets/:aid", (c) => {
  const id = c.req.param("id");
  const aid = c.req.param("aid");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  // cảnh đang dùng ảnh này sẽ hiện khung giữ chỗ – báo lại cho giao diện
  const usedBy = listVideos(id).flatMap((v) => v.data.scenes.filter((s) => s.design?.params?.image === aid).map((s) => `${v.key} ${s.id}`));
  if (!deleteAsset(id, aid)) return c.json({ error: "Không có ảnh" }, 404);
  return c.json({ ok: true, usedBy });
});

// ---------- phong cách tuỳ chỉnh + tạo phong cách bằng AI ----------
const styleGenJob = (id: string) => listJobs(id, 50).find((j) => j.kind === "style-gen") ?? null;
app.get("/projects/:id/themes", (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  return c.json({ ...listCustomThemes(id), brief: loadBrief(id), videos: listStyleVideos(id), docs: listStyleDocs(id), job: styleGenJob(id) });
});
// Đề bài (mô tả + ảnh + video mẫu + phong cách gốc); mode "api" → xếp job style-gen. Claude Code: giao diện gửi yêu cầu "style-gen" sau đó.
app.post("/projects/:id/style-gen", async (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  const b = await c.req.json().catch(() => ({}));
  try {
    const brief = setStyleBrief(id, b);
    if (b.mode !== "api") return c.json({ brief, job: null });
    const active = styleGenJob(id);
    const job = active && ["queued", "running"].includes(active.status) ? active : enqueueJob(id, "style-gen", null, {});
    return c.json({ brief, job });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
// Claude Code: tư liệu tham chiếu (đường dẫn tuyệt đối để mở bằng Read)
app.get("/projects/:id/style-refs", async (c) => {
  if (!getProject(c.req.param("id"))) return c.json({ error: "Không tìm thấy dự án" }, 404);
  try {
    return c.json(await styleRefs(c.req.param("id")));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
// Video mẫu: gửi thô (body = nội dung file, tên trong x-file-name), ghi thẳng ra đĩa – không qua formData (≤ 200 MB)
app.post("/projects/:id/style-refs/video", async (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  if (Number(c.req.header("content-length") ?? 0) > MAX_REF_VIDEO_BYTES) return c.json({ error: "Video quá lớn (tối đa 200 MB)" }, 413);
  const body = c.req.raw.body;
  if (!body) return c.json({ error: "Thiếu nội dung video" }, 400);
  try {
    return c.json(await saveStyleVideo(id, decodeURIComponent(c.req.header("x-file-name") ?? "video.mp4"), body as unknown as AsyncIterable<Uint8Array>));
  } catch (e) {
    if (e instanceof StyleRefError) return c.json({ error: e.message }, 400);
    throw e;
  }
});
// Tài liệu phong cách (ZIP/PDF/HTML ≤ 100 MB): gửi thô như video
app.post("/projects/:id/style-refs/doc", async (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  if (Number(c.req.header("content-length") ?? 0) > MAX_STYLE_DOC_BYTES) return c.json({ error: "Tài liệu quá lớn (tối đa 100 MB)" }, 413);
  const body = c.req.raw.body;
  if (!body) return c.json({ error: "Thiếu nội dung tài liệu" }, 400);
  try {
    return c.json(await saveStyleDoc(id, decodeURIComponent(c.req.header("x-file-name") ?? "tai-lieu.zip"), body as unknown as AsyncIterable<Uint8Array>));
  } catch (e) {
    if (e instanceof StyleDocError) return c.json({ error: e.message }, 400);
    throw e;
  }
});
app.delete("/projects/:id/style-refs/doc/:did", (c) => (deleteStyleDoc(c.req.param("id"), c.req.param("did")) ? c.json({ ok: true }) : c.json({ error: "Không có tài liệu" }, 404)));
app.delete("/projects/:id/style-refs/video/:vid", (c) => (deleteStyleVideo(c.req.param("id"), c.req.param("vid")) ? c.json({ ok: true }) : c.json({ error: "Không có video" }, 404)));
/** Dựng ảnh xem trước cho một phong cách trên cảnh đại diện (cùng bộ ảnh mẫu). */
const queuePreview = (id: string, style: string) => enqueueJob(id, "theme-preview", previewKey(id), { styles: [style] });
// Claude Code gửi phong cách (`pnpm cvs set-theme`) – kiểm như đường API, rồi tự dựng ảnh xem trước
app.post("/projects/:id/themes", async (c) => {
  const id = c.req.param("id");
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  const b = await c.req.json().catch(() => null);
  const r = saveThemeReply(id, b, "claude-code");
  if (!r.ok) return c.json({ ok: false, errors: r.errors }, 400);
  return c.json({ ok: true, id: r.record!.id, name: r.record!.theme.name, adjustments: r.record!.adjustments, previewJob: queuePreview(id, r.record!.id).id });
});
// Chỉnh tay: {colors?: {accent: "#…"}, fontPair?, name?}
app.patch("/projects/:id/themes/:tid", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const r = tweakCustomTheme(id, c.req.param("tid"), b ?? {});
  if (!r.ok) return c.json({ ok: false, errors: r.errors, error: r.errors.join("; ") }, 400);
  return c.json({ ok: true, record: r.record, previewJob: queuePreview(id, r.record!.id).id });
});
app.post("/projects/:id/themes/:tid/library", (c) => {
  try {
    return c.json({ ok: true, record: saveThemeToLibrary(c.req.param("id"), c.req.param("tid")) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
});
app.delete("/projects/:id/themes/:tid", (c) => {
  const r = deleteCustomTheme(c.req.param("id"), c.req.param("tid"), c.req.query("from") === "library" ? "library" : "project");
  return r.ok ? c.json(r) : c.json(r, 400);
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
    overlayStale: overlayStale(projectId, v),
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
  const bad = styleError(id, video.style);
  if (bad) return c.json({ error: bad }, 400);
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
// Ghi thiết kế một cảnh (Claude Code / sửa tay): kiểm như AI trong app, thiết kế cũ vào lịch sử để hoàn tác, bỏ duyệt.
app.patch("/projects/:id/videos/:key/scenes/:sid", async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== "object") return c.json({ ok: false, errors: ["Thân yêu cầu phải là JSON"] }, 400);
  const r = applySceneEdit(c.req.param("id"), c.req.param("key"), c.req.param("sid"), { design: b.design, assumptions: b.assumptions, note: b.note, by: b.by });
  return c.json(r, r.ok ? 200 : /Không tìm thấy|Không có cảnh/.test(r.errors[0] ?? "") ? 404 : 400);
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
        rows.push({ key: v.key, scene: s.id, idx: k, text: x.text, tts: x.tts, locked: !!x.ttsLocked, changed: x.tts !== x.text, rules: r.rules, warnings: checkTts(x.tts), suggest: x.suggest ?? null, voice: v.data.voice });
      }
  }
  return c.json(rows);
});
// Một câu: {tts} sửa tay · {suggest} lưu đề xuất (không đổi tts) · {action: "accept" | "reject"} duyệt đề xuất.
app.patch("/projects/:id/videos/:key/sentence", async (c) => {
  const id = c.req.param("id");
  const b = (await c.req.json().catch(() => null)) as { scene: string; idx: number; tts?: string; suggest?: unknown; action?: string } | null;
  if (!b || typeof b.scene !== "string" || !Number.isInteger(b.idx)) return c.json({ error: 'Cần "scene" và "idx"' }, 400);
  if (b.suggest !== undefined || b.action !== undefined) {
    if (b.action !== undefined && !["accept", "reject"].includes(b.action)) return c.json({ error: '"action" phải là accept | reject' }, 400);
    const err = b.action ? resolveReadingSuggestion(id, c.req.param("key"), b.scene, b.idx, b.action === "accept") : setReadingSuggestion(id, c.req.param("key"), b.scene, b.idx, b.suggest);
    if (err) return c.json({ error: err }, err === "Không tìm thấy câu" ? 404 : 400);
    const x = getVideo(id, c.req.param("key"))!.data.scenes.find((s) => s.id === b.scene)!.sentences[b.idx];
    return c.json({ ok: true, tts: x.tts, warnings: checkTts(x.tts) });
  }
  const v = getVideo(id, c.req.param("key"));
  const s = v?.data.scenes.find((x) => x.id === b.scene);
  if (!v || !s?.sentences[b.idx]) return c.json({ error: "Không tìm thấy câu" }, 404);
  if (typeof b.tts !== "string" || !b.tts.trim()) return c.json({ error: "Cách đọc không được trống" }, 400);
  s.sentences[b.idx] = { ...s.sentences[b.idx], tts: b.tts, ttsLocked: true };
  upsertVideo(id, v.data);
  return c.json({ ok: true, warnings: checkTts(b.tts) });
});
// Chấp nhận mọi đề xuất cách đọc của Claude (cả dự án, hoặc một video với {key}).
app.post("/projects/:id/reading/accept-all", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
  if (b.key !== undefined && (typeof b.key !== "string" || !getVideo(id, b.key))) return c.json({ error: "Không tìm thấy video" }, 404);
  return c.json({ ok: true, accepted: acceptAllReadings(id, b.key) });
});
app.post("/projects/:id/videos/:key/renormalize", (c) => {
  const id = c.req.param("id");
  const v = getVideo(id, c.req.param("key"))!;
  upsertVideo(id, renormalizeVideo(v.data, { glossary: glossaryFor(id) }));
  return c.json({ ok: true });
});
app.get("/projects/:id/videos/:key/vtt", (c) => {
  const id = c.req.param("id");
  const v = getVideo(id, c.req.param("key"));
  if (!v) return c.json({ error: "Không tìm thấy video" }, 404);
  const lang = c.req.query("lang") ?? "vi";
  if (!SUB_LANGS.some((l) => l.code === lang)) return c.json({ error: "Ngôn ngữ phụ đề không hỗ trợ" }, 400);
  return c.text(videoVtt(id, v.data, lang), 200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" });
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
    if (active && ["agent", "produce", "voice", "visual", "render", "design", "revise", "remix"].includes(b.kind)) return active;
    // rà soát cách đọc: một lượt mỗi dự án
    const review = b.kind === "reading-review" ? listJobs(id, 50).find((j) => j.kind === "reading-review" && ["queued", "running"].includes(j.status)) : null;
    if (review) return review;
    // phân tích tài liệu: một lượt mỗi tài liệu
    const fid = (b.payload as { fileId?: string } | undefined)?.fileId;
    if (b.kind === "analyze-doc" && !getFile(id, String(fid ?? ""))) throw new Error("Không tìm thấy tài liệu cần phân tích");
    const doc = b.kind === "analyze-doc" ? listJobs(id, 100).find((j) => j.kind === "analyze-doc" && j.payload?.fileId === fid && ["queued", "running"].includes(j.status)) : null;
    if (doc) return doc;
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

// ---------- yêu cầu AI chờ Claude Code (khi không có Claude API) ----------
app.post("/claude-code/requests", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!getProject(String(b.projectId ?? ""))) return c.json({ error: "Không tìm thấy dự án" }, 404);
  if (!CLAUDE_REQUEST_KINDS.includes(b.kind)) return c.json({ error: `"kind" phải là ${CLAUDE_REQUEST_KINDS.join(" | ")}` }, 400);
  const v = b.videoKey ? getVideo(b.projectId, String(b.videoKey)) : null;
  if (b.videoKey && !v && b.kind !== "write-script") return c.json({ error: "Không tìm thấy video" }, 404);
  if (b.sceneId && !v?.data.scenes.some((s) => s.id === b.sceneId)) return c.json({ error: "Không tìm thấy cảnh" }, 404);
  if (["revise", "illustration", "custom-scene"].includes(b.kind) && !b.sceneId) return c.json({ error: "Cần mã cảnh (sceneId)" }, 400);
  if (b.kind === "analyze-doc" && !getFile(b.projectId, String(b.fileId ?? ""))) return c.json({ error: "Cần mã tài liệu (fileId) của dự án" }, 400);
  if (b.kind === "write-script" && !b.videoKey) return c.json({ error: "Cần mã video (videoKey)" }, 400);
  if (b.kind === "translate-subs" && !SUB_LANGS.some((l) => l.code !== "vi" && l.code === b.note)) return c.json({ error: "Cần mã ngôn ngữ đích trong note (en, ja, ko, zh, fr, de, es, th)" }, 400);
  if (b.kind === "style-gen" && !loadBrief(b.projectId)) return c.json({ error: "Chưa có đề bài tạo phong cách (POST /projects/:id/style-gen)" }, 400);
  if (b.kind === "revise" && !String(b.note ?? "").trim()) return c.json({ error: "Cần nội dung yêu cầu sửa (note)" }, 400);
  if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > 4000)) return c.json({ error: '"note" phải là chuỗi ≤ 4000 ký tự' }, 400);
  const req = addClaudeRequest({ projectId: b.projectId, videoKey: b.videoKey ?? null, sceneId: b.sceneId ?? null, fileId: b.kind === "analyze-doc" ? String(b.fileId) : null, kind: b.kind as ClaudeRequestKind, note: b.note?.trim() || null });
  // {run: true} (người dùng đã đồng ý) hoặc bật "tự chạy không hỏi" → Claude Code chạy ngay trên máy này
  const run = !req.duplicate && (b.run === true || claudeCodeSettings().auto) ? startClaudeRun() : null;
  return c.json({ ...req, run });
});
app.get("/claude-code/requests", (c) => c.json(listClaudeRequests({ status: c.req.query("status"), projectId: c.req.query("projectId"), videoKey: c.req.query("videoKey"), fileId: c.req.query("fileId") })));
app.patch("/claude-code/requests/:rid", async (c) => {
  const id = Number(c.req.param("rid"));
  const b = await c.req.json().catch(() => ({}));
  if (!getClaudeRequest(id)) return c.json({ error: "Không có yêu cầu" }, 404);
  if (!["pending", "running", "done", "failed", "cancelled"].includes(b.status)) return c.json({ error: '"status" phải là done | failed | pending | running | cancelled' }, 400);
  if (b.status === "cancelled" && getClaudeRequest(id)!.status !== "pending") return c.json({ error: "Chỉ huỷ được việc đang chờ" }, 400);
  if (b.message !== undefined && typeof b.message !== "string") return c.json({ error: '"message" phải là chuỗi' }, 400);
  return c.json(updateClaudeRequest(id, { status: b.status, message: b.message?.slice(0, 4000) ?? null }));
});
// Tự chạy Claude Code trên máy này (gói Claude đã đăng ký): trạng thái, chạy, cài, đăng nhập, tự chạy không hỏi.
app.get("/claude-code/runner", async (c) => c.json(await claudeRunnerStatus(c.req.query("refresh") === "1")));
app.post("/claude-code/run", (c) => c.json(startClaudeRun()));
app.post("/claude-code/install", (c) => c.json(installClaudeCode()));
app.post("/claude-code/login", (c) => c.json(openClaudeLogin()));
app.post("/claude-code/settings", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.auto !== undefined && typeof b.auto !== "boolean") return c.json({ error: '"auto" phải là true | false' }, 400);
  if (b.useApi !== undefined && typeof b.useApi !== "boolean") return c.json({ error: '"useApi" phải là true | false' }, 400);
  const s = setClaudeCodeSettings({ auto: b.auto, useApi: b.useApi });
  setApiAllowed(s.useApi);
  return c.json(s);
});
// Prompt đúng như Claude API nhận – Claude Code làm theo prompt này. "analyze-doc" dùng fileId (mã tài liệu) thay videoKey.
const PROMPT_KINDS = ["design", "illustration", "custom", "readings", "review-readings", "analyze-doc", "write-script", "translate-subs", "style-gen"];
app.post("/claude-code/prompt", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!PROMPT_KINDS.includes(b.kind)) return c.json({ error: `"kind" phải là ${PROMPT_KINDS.join(" | ")}` }, 400);
  try {
    return c.json(await claudeCodePrompt(String(b.projectId ?? ""), String((b.kind === "analyze-doc" ? b.fileId : b.videoKey) ?? ""), b.kind, b.sceneId, b.note));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
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
// {dest?: thư mục người dùng chọn, extras?: kèm phụ đề + lời thoại}
app.post("/projects/:id/export", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!getProject(c.req.param("id"))) return c.json({ error: "Không tìm thấy dự án" }, 404);
  try {
    return c.json(await exportProject(c.req.param("id"), { dest: b.dest === undefined ? undefined : b.dest === null || b.dest === "" ? null : b.dest, extras: b.extras === true }));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
// ---------- nơi lưu: ổ đĩa / ổ mạng / cloud, thư mục xuất mặc định, chuyển dữ liệu làm việc ----------
const localOnly = (c: Context) => isLocalRequest(remoteAddr(c), c.req.raw.headers);
app.get("/storage/locations", (c) => c.json({ locations: listLocations(), videoDir: defaultVideoDir() }));
app.post("/storage/check", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try {
    return c.json(checkLocation(b.path));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
app.post("/storage/default", async (c) => {
  if (!localOnly(c)) return c.json({ error: "Chỉ đổi được ngay trên máy tính đang chạy ứng dụng" }, 403);
  const b = await c.req.json().catch(() => ({}));
  try {
    return c.json(setDefaultVideoDir(b.path ?? null));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
app.get("/storage/data", (c) => c.json(dataInfo()));
app.post("/storage/data/move", async (c) => {
  if (!localOnly(c)) return c.json({ error: "Chỉ chuyển được ngay trên máy tính đang chạy ứng dụng" }, 403);
  const b = await c.req.json().catch(() => ({}));
  try {
    return c.json(requestDataMove(b.path ?? null));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
app.get("/projects/:id/cleanup", (c) => c.json(cleanupCandidates(c.req.param("id"))));
app.post("/projects/:id/cleanup", async (c) => {
  const { paths: ps } = await c.req.json();
  return c.json({ archivedTo: archiveItems(c.req.param("id"), ps) });
});
app.post("/projects/:id/cleanup/delete", async (c) => {
  const { paths: ps } = await c.req.json();
  if (!Array.isArray(ps)) return c.json({ error: "Thiếu danh sách đường dẫn" }, 400);
  return c.json({ deleted: deleteItems(c.req.param("id"), ps) });
});
app.get("/projects/:id/cleanup/archive", (c) => c.json({ dir: paths.archive(c.req.param("id")), project: paths.project(c.req.param("id")), items: archiveSnapshots(c.req.param("id")) }));

// ---------- tệp trong thư mục lưu trữ (video, ảnh, giọng) ----------
const MIME: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8" };
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
