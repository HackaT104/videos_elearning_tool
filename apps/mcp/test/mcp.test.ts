// Máy chủ MCP cho Claude Desktop: công cụ gọi API thật (app.request), ảnh khung trả về dạng ảnh MCP (JPEG ≤ 1280 px), prompt + tài nguyên kỹ năng.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const storage = mkdtempSync(join(tmpdir(), "cvs-mcp-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../../worker/src/api");
const { createProject, getVideo, setVideoQa, updateJob, upsertVideo, addClaudeRequest, getClaudeRequest } = await import("@cvs/db");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { TEMPLATES } = await import("@cvs/engine");
const { createServer } = await import("../src/server");
const { createApi } = await import("../../../scripts/lib/cvs-api");

const KEY = "MC-L1_V1";
let pid = "";
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as { content: any[]; isError?: boolean };
const json = (r: { content: any[] }) => JSON.parse(r.content[0].text);

beforeAll(async () => {
  pid = createProject("Dự án MCP", "MC", ["L1"]).id;
  const norm = createNormalizer();
  upsertVideo(pid, {
    key: KEY, course: "MC", level: "L1", module: "", unit: "", seq: "", title: "Thẩm định", style: "giay-ky-thuat", engine: "hyperframes",
    voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
    scenes: [{ id: "s1", scriptStart: 0, scriptEnd: 10, title: "Mở đầu", visual: "Tiêu đề", onscreen: [], sentences: makeSentences("Thẩm định diễn ra trước khi đăng ký.", norm) }],
  } as any);
  const dir = join(storage, "projects", pid, "frames", KEY);
  mkdirSync(dir, { recursive: true });
  const png = (f: string) => sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#204060" } }).png().toFile(join(dir, f));
  await png("a.png");
  await png("b.png");
  setVideoQa(pid, KEY, { ok: true, items: [], frames: [{ t: 1, file: join(dir, "a.png"), scene: "s1", label: "s1 · câu 1 + 1,5 s" }, { t: 3, file: join(dir, "b.png"), scene: "s1", label: "s1 · cuối cảnh" }] });
  // sleep giả: job dựng xong ngay ở lần chờ đầu tiên (test không chạy vòng job của worker)
  const api = createApi("http://cvs.test/api", ((u: string, init?: RequestInit) => app.request(String(u), init)) as typeof fetch);
  const server = createServer({ api, sleep: async () => {
    const jobs = await (await app.request(`/api/projects/${pid}/jobs`)).json();
    for (const j of jobs) if (j.status === "queued") updateJob(j.id, { status: "done", message: "xong" });
  } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("máy chủ MCP course-video-studio", () => {
  it("liệt kê công cụ có mô tả tiếng Việt + JSON schema, prompt và tài nguyên kỹ năng", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ["list_projects", "list_videos", "get_video", "list_pending_requests", "get_prompt", "list_templates", "set_scene_design", "set_svg", "set_custom_scene", "set_reading", "suggest_reading", "set_subs", "set_theme", "set_doc_plan", "set_script", "check_video", "render_video", "job_status", "mark_request_done", "mark_request_failed", "get_style_refs"]) expect(names).toContain(n);
    const sd = tools.find((t) => t.name === "set_scene_design")!;
    expect(sd.inputSchema.required).toEqual(expect.arrayContaining(["projectId", "videoKey", "sceneId", "template"]));
    expect(sd.description).toMatch(/thiết kế/);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("xu-ly-yeu-cau-dang-cho");
    const p = await client.getPrompt({ name: "xu-ly-yeu-cau-dang-cho", arguments: {} });
    expect((p.messages[0].content as any).text).toMatch(/list_pending_requests[\s\S]*check_video[\s\S]*mark_request_done/);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(expect.arrayContaining(["cvs://skills/cvs-claude-code/SKILL.md", "cvs://skills/cvs-scene-design/SKILL.md"]));
    const r = await client.readResource({ uri: "cvs://skills/cvs-scene-design/SKILL.md" });
    expect((r.contents[0] as any).text).toMatch(/Thiết kế cảnh/);
  });

  it("xem dự án/video, lấy prompt, ghi thiết kế (lỗi → isError/ok:false), hàng đợi", async () => {
    expect(json(await call("list_projects")).some((p: any) => p.id === pid)).toBe(true);
    expect(json(await call("list_videos", { projectId: pid }))[0].key).toBe(KEY);
    expect(json(await call("get_video", { projectId: pid, videoKey: KEY })).scenes[0].sentences[0].text).toMatch(/Thẩm định/);
    expect((await call("get_prompt", { kind: "design", projectId: pid, videoKey: KEY, sceneId: "s1" })).content[0].text).toMatch(/===== SYSTEM =====/);
    const ok = json(await call("set_scene_design", { projectId: pid, videoKey: KEY, sceneId: "s1", template: "title-card", params: TEMPLATES["title-card"].example, reason: "Mở đầu" }));
    expect(ok).toEqual({ ok: true, errors: [] });
    expect(getVideo(pid, KEY)!.data.scenes[0].design).toMatchObject({ template: "title-card", by: "ai" });
    const bad = await call("set_scene_design", { projectId: pid, videoKey: KEY, sceneId: "s1", template: "split-compare", params: {} });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/Thiếu/);
    expect((await call("get_video", { projectId: "khong-co", videoKey: KEY })).isError).toBe(true);
    const req = addClaudeRequest({ projectId: pid, videoKey: KEY, kind: "design-video" });
    expect(json(await call("list_pending_requests", { projectId: pid })).map((r: any) => r.id)).toContain(req.id);
    expect(json(await call("mark_request_done", { requestId: req.id, message: "Đã thiết kế" }))).toMatchObject({ status: "done" });
    expect(getClaudeRequest(req.id)!.message).toBe("Đã thiết kế");
  });

  it("check_video: chạy job dựng + QA, trả báo cáo và ảnh khung JPEG ≤ 1280 px (mặc định khung cuối cảnh)", async () => {
    const r = await call("check_video", { projectId: pid, videoKey: KEY });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0].text)).toMatchObject({ ok: true, items: [] });
    const imgs = r.content.filter((c) => c.type === "image");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    const meta = await sharp(Buffer.from(imgs[0].data, "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1280, 720]);
    expect(r.content[r.content.indexOf(imgs[0]) - 1].text).toMatch(/cuối cảnh/);
    const all = await call("check_video", { projectId: pid, videoKey: KEY, rerun: false, allFrames: true });
    expect(all.content.filter((c) => c.type === "image")).toHaveLength(2);
  });
});
