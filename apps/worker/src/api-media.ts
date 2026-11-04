// API nhạc nền + âm lượng (bước Giọng đọc) và ảnh miễn phí có ghi nguồn (ảnh của cảnh).

import { existsSync } from "node:fs";
import type { Hono } from "hono";
import { activeJobFor, enqueueJob, getProject, listVideos, paths, updateProject } from "@cvs/db";
import { audioKey, currentTiming, deleteMusic, listMusic, MAX_MUSIC_BYTES, musicFile, MusicError, normalizeMusic, saveMusic, varietyQa,
  importStock, searchStock, setPexelsKey, STOCK_UA, StockError, stockSettings, type StockSource,
} from "@cvs/studio";

/** Video đã render mà tiếng trộn theo cài đặt khác (nhạc/mức/mục tiêu âm lượng) – render trước khi có khoá cũng tính là cũ. */
export function staleAudio(projectId: string): string[] {
  const p = getProject(projectId);
  const key = audioKey(projectId, p?.settings.music);
  return listVideos(projectId)
    .filter((v) => v.include && !v.existing && existsSync(paths.render(projectId, v.key)) && (v.qa as { audioKey?: string } | null)?.audioKey !== key)
    .map((v) => v.key);
}

export function mediaRoutes(app: Hono) {
  // ---------- ảnh miễn phí có ghi nguồn ----------
  app.get("/stock/settings", (c) => c.json({ pexels: !!stockSettings().pexelsKey, userAgent: STOCK_UA }));
  app.put("/stock/settings", async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== "object" || !(b.pexelsKey === null || typeof b.pexelsKey === "string")) return c.json({ error: 'Cần {"pexelsKey": "…" | null}' }, 400);
    try {
      setPexelsKey(b.pexelsKey);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    return c.json({ pexels: !!stockSettings().pexelsKey });
  });
  app.get("/projects/:id/stock/search", async (c) => {
    if (!getProject(c.req.param("id"))) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const sources = (c.req.query("sources") ?? "").split(",").filter((s): s is StockSource => ["openverse", "wikimedia", "pexels"].includes(s));
    try {
      return c.json(await searchStock(c.req.query("q") ?? "", sources.length ? { sources } : {}));
    } catch (e) {
      if (e instanceof StockError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  app.post("/projects/:id/stock/import", async (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b.source !== "string" || typeof b.id !== "string") return c.json({ error: 'Cần {"source", "id"}' }, 400);
    try {
      return c.json(await importStock(id, b.source as StockSource, b.id));
    } catch (e) {
      if (e instanceof StockError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });

  // "Nguy cơ giống trình chiếu" theo thiết kế hiện tại (cảnh chưa thiết kế = thiết kế tự động) – cho bước Sản xuất
  app.get("/projects/:id/variety", (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const out = listVideos(id)
      .filter((v) => v.include && !v.existing)
      .map((v) => ({ key: v.key, items: varietyQa(v.data, currentTiming(id, v.data)) }))
      .filter((x) => x.items.length);
    return c.json(out);
  });

  const musicView = (id: string) => {
    const m = listMusic(id);
    const withPath = <T extends { id: string; source: "project" | "library" }>(x: T) => ({ ...x, path: musicFile(id, x.source, x.id) });
    return { project: m.project.map(withPath), library: m.library.map(withPath), libraryDir: m.libraryDir, music: getProject(id)?.settings.music ?? null, stale: staleAudio(id) };
  };
  app.get("/projects/:id/music", (c) => {
    if (!getProject(c.req.param("id"))) return c.json({ error: "Không tìm thấy dự án" }, 404);
    return c.json(musicView(c.req.param("id")));
  });
  app.post("/projects/:id/music", async (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    if (Number(c.req.header("content-length") ?? 0) > MAX_MUSIC_BYTES + 64 * 1024) return c.json({ error: "Nhạc quá lớn (tối đa 40 MB)" }, 413);
    const f = (await c.req.formData().catch(() => null))?.get("file");
    if (!f || typeof f === "string") return c.json({ error: 'Thiếu file nhạc (trường "file")' }, 400);
    try {
      return c.json(await saveMusic(id, f.name, Buffer.from(await f.arrayBuffer())));
    } catch (e) {
      if (e instanceof MusicError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  app.delete("/projects/:id/music/:mid", (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const m = getProject(id)!.settings.music;
    if (!deleteMusic(id, c.req.param("mid"))) return c.json({ error: "Không có file nhạc" }, 404);
    if (m?.source === "project" && m.file === c.req.param("mid")) updateProject(id, { settings: { music: null } });
    return c.json(musicView(id));
  });
  // {music: {file, source, volumeDb, duck, fadeIn, fadeOut, license} | null}
  app.patch("/projects/:id/music", async (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== "object") return c.json({ error: "Thân yêu cầu phải là JSON" }, 400);
    const music = normalizeMusic(b.music);
    if (b.music && !music) return c.json({ error: "Cài đặt nhạc nền không hợp lệ" }, 400);
    if (music && !musicFile(id, music.source, music.file)) return c.json({ error: "Không có file nhạc này – tải lên hoặc chép vào thư mục nhạc rồi thử lại" }, 400);
    updateProject(id, { settings: { music } });
    return c.json(musicView(id));
  });
  // Trộn lại tiếng cho video đã render có tiếng cũ (không dựng lại hình khi còn bản dựng gốc)
  app.post("/projects/:id/music/remix", (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const jobs = staleAudio(id).map((k) => activeJobFor(id, k) ?? enqueueJob(id, "remix", k, { skipStyle: true }));
    return c.json({ ok: true, jobs: jobs.map((j) => ({ id: j.id, key: j.video_key, kind: j.kind })) });
  });
}
