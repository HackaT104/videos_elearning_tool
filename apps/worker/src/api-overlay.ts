// API phụ đề và logo: cài đặt của dự án (kiểm/kẹp), mặc định cho mọi dự án, dựng lại hình các video đã render,
// bản dịch phụ đề từng câu (người dùng sửa tay / Claude Code ghi qua `pnpm cvs set-subs`).

import { existsSync } from "node:fs";
import type { Hono } from "hono";
import { normalizeLogo, normalizeSubtitle, overlayKey, resolveOverlay, SUB_LANGS } from "@cvs/core";
import { activeJobFor, enqueueJob, getProject, getVideo, listVideos, paths, updateProject } from "@cvs/db";
import { missingSubs, overlayDefaults, saveOverlayDefaults, setSubs } from "@cvs/studio";

type Row = ReturnType<typeof listVideos>[number];
/** Bản render có phụ đề gắn cứng/logo khác cài đặt hiện tại (render cũ không ghi khoá = không phủ gì). */
export const overlayStale = (projectId: string, v: Row, settings = getProject(projectId)?.settings) =>
  existsSync(paths.render(projectId, v.key)) && ((v.qa as { overlayKey?: string } | null)?.overlayKey ?? overlayKey(resolveOverlay(null))) !== overlayKey(resolveOverlay(settings, v.data));

export function staleOverlay(projectId: string): string[] {
  const p = getProject(projectId);
  return listVideos(projectId).filter((v) => v.include && !v.existing && overlayStale(projectId, v, p?.settings)).map((v) => v.key);
}

export function overlayRoutes(app: Hono) {
  const view = (id: string) => {
    const p = getProject(id)!;
    const o = resolveOverlay(p.settings);
    const vids = listVideos(id).filter((v) => v.include && !v.existing);
    const d = overlayDefaults();
    return {
      ...o,
      langs: SUB_LANGS,
      // mặc định cho mọi dự án đang là logo của dự án này
      isDefault: !!d && JSON.stringify(normalizeLogo(d.logo).assetId ?? null) === JSON.stringify(o.logo.assetId ?? null),
      hasDefault: !!d,
      rendered: vids.filter((v) => existsSync(paths.render(id, v.key))).map((v) => v.key),
      stale: staleOverlay(id),
      missing: Object.fromEntries(o.subtitle.languages.filter((l) => l !== "vi").map((l) => [l, vids.reduce((n, v) => n + missingSubs(v.data, l), 0)])),
    };
  };
  app.get("/projects/:id/overlay", (c) => {
    if (!getProject(c.req.param("id"))) return c.json({ error: "Không tìm thấy dự án" }, 404);
    return c.json(view(c.req.param("id")));
  });
  // {subtitle?, logo?, defaults?: true|false} – giá trị ngoài khoảng được kẹp, logo phải là ảnh của dự án
  app.patch("/projects/:id/overlay", async (c) => {
    const id = c.req.param("id");
    const p = getProject(id);
    if (!p) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== "object") return c.json({ error: "Thân yêu cầu phải là JSON" }, 400);
    const cur = resolveOverlay(p.settings);
    const subtitle = b.subtitle !== undefined ? normalizeSubtitle(b.subtitle, cur.subtitle) : cur.subtitle;
    const logo = b.logo !== undefined ? normalizeLogo(b.logo, cur.logo) : cur.logo;
    if (b.logo?.assetId && logo.assetId !== b.logo.assetId) return c.json({ error: "Mã ảnh logo không hợp lệ" }, 400);
    if (logo.assetId && !existsSync(`${paths.assets(id)}/${logo.assetId}`)) return c.json({ error: "Không có ảnh logo này trong dự án – tải lại logo" }, 400);
    updateProject(id, { settings: { subtitle, logo } });
    try {
      if (b.defaults === true || b.defaults === false) saveOverlayDefaults(id, b.defaults);
      else if (view(id).isDefault && overlayDefaults()) saveOverlayDefaults(id, true); // đang là mặc định → cập nhật theo
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    return c.json(view(id));
  });
  // Dựng lại hình (giữ giọng) cho video đã render: {all: true} mọi video đã render, mặc định chỉ video có phụ đề/logo cũ
  app.post("/projects/:id/overlay/rerender", async (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const b = await c.req.json().catch(() => ({}));
    const v = view(id);
    const keys = b?.all === true ? v.rendered : v.stale;
    const jobs = keys.map((k) => activeJobFor(id, k) ?? enqueueJob(id, "visual", k, { skipStyle: true }));
    return c.json({ ok: true, jobs: jobs.map((j) => ({ id: j.id, key: j.video_key, kind: j.kind })) });
  });
  // Bản dịch phụ đề: {lang, translations: [{id: "sN#idx", text}], by?: "user" | "claude-code"}; text rỗng = xoá
  app.patch("/projects/:id/videos/:key/subs", async (c) => {
    const id = c.req.param("id");
    const key = c.req.param("key");
    if (!getProject(id) || !getVideo(id, key)) return c.json({ ok: false, errors: ["Không tìm thấy video"] }, 404);
    const b = await c.req.json().catch(() => null);
    const by = b?.by === "claude-code" ? "claude-code" : "user";
    const r = setSubs(id, key, b?.lang, b?.translations, by);
    return c.json(r, r.ok ? 200 : 400);
  });
}
