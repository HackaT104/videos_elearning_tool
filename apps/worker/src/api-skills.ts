// API thư viện skill dựng cảnh (dùng chung) và mẫu video từ catalog awesome-opus5-5-videos (bước Phong cách).

import type { Hono } from "hono";
import { getProject } from "@cvs/db";
import {
  AWESOME, deleteSkill, getSkill, importSamplePoster, importSkillUrl, listSkills, listStyleSamples, MAX_SKILL_BYTES, saveSkill, SampleError, SKILL_SUGGESTIONS, SkillError, StockError,
} from "@cvs/studio";

/** Lỗi do người dùng/nguồn ngoài → 400 kèm thông báo; lỗi khác để onError (500). */
const known = (e: unknown) => e instanceof SkillError || e instanceof SampleError;

export function skillRoutes(app: Hono) {
  app.get("/skills", (c) => c.json({ skills: listSkills(), suggestions: SKILL_SUGGESTIONS }));
  app.get("/skills/:sid", (c) => {
    const s = getSkill(c.req.param("sid"));
    return s ? c.json(s) : c.json({ error: "Không có skill này" }, 404);
  });
  // nhập từ link GitHub: {"url": "..."}
  app.post("/skills", async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b.url !== "string" || !b.url.trim()) return c.json({ error: 'Cần {"url": "link GitHub tới SKILL.md / file .md / thư mục skill"}' }, 400);
    try {
      return c.json(await importSkillUrl(b.url));
    } catch (e) {
      if (known(e)) return c.json({ error: (e as Error).message }, 400);
      throw e;
    }
  });
  // tải lên file .md (multipart, trường "file")
  app.post("/skills/upload", async (c) => {
    if (Number(c.req.header("content-length") ?? 0) > MAX_SKILL_BYTES + 64 * 1024) return c.json({ error: "File quá lớn (tối đa 300 KB)" }, 413);
    const form = await c.req.formData().catch(() => null);
    const f = form?.get("file");
    if (!f || typeof f === "string") return c.json({ error: 'Thiếu file .md (trường "file")' }, 400);
    if (!/\.(md|markdown|txt)$/i.test(f.name)) return c.json({ error: "Chỉ nhận file .md" }, 400);
    if (f.size > MAX_SKILL_BYTES) return c.json({ error: "File quá lớn (tối đa 300 KB)" }, 413);
    try {
      return c.json(saveSkill(Buffer.from(await f.arrayBuffer()).toString("utf8"), `tải lên: ${f.name}`, null, f.name.replace(/\.\w+$/, "")));
    } catch (e) {
      if (known(e)) return c.json({ error: (e as Error).message }, 400);
      throw e;
    }
  });
  app.delete("/skills/:sid", (c) => {
    try {
      deleteSkill(c.req.param("sid"));
      return c.json({ ok: true });
    } catch (e) {
      if (known(e)) return c.json({ error: (e as Error).message }, 400);
      throw e;
    }
  });

  // ---------- mẫu video (catalog awesome-opus5-5-videos) ----------
  app.get("/style-samples", async (c) => {
    try {
      return c.json({ ...(await listStyleSamples({ refresh: c.req.query("refresh") === "1" })), source: AWESOME });
    } catch (e) {
      if (known(e)) return c.json({ error: (e as Error).message }, 502);
      throw e;
    }
  });
  // chọn mẫu → tải poster vào ảnh dự án (ảnh tham chiếu); {"preset": "awesome:<slug>"}
  app.post("/projects/:id/style-samples/poster", async (c) => {
    const id = c.req.param("id");
    if (!getProject(id)) return c.json({ error: "Không tìm thấy dự án" }, 404);
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b.preset !== "string") return c.json({ error: 'Cần {"preset": "awesome:<slug>"}' }, 400);
    try {
      return c.json({ asset: await importSamplePoster(id, b.preset) });
    } catch (e) {
      if (known(e)) return c.json({ error: (e as Error).message }, 400);
      if (e instanceof StockError) return c.json({ error: (e as Error).message }, 502);
      throw e;
    }
  });
}

/** Skill chọn cho dự án/video phải có trong thư viện (null/"" = cách dựng mặc định). Lỗi → thông báo, null = hợp lệ. */
export function skillError(skill: unknown): string | null {
  if (skill === undefined || skill === null || skill === "") return null;
  return typeof skill === "string" && getSkill(skill) ? null : `Skill "${String(skill)}" không có trong thư viện`;
}
