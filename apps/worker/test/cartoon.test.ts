// Hoạt hình vẽ tay qua API: cài đặt dự án, prompt Claude Code "cartoon", set-cartoon (lint trước khi vẽ thử), chính sách template,
// skill có sẵn "Hoạt hình vẽ tay". Vẽ thử thật (Chromium) chỉ khi CVS_RENDER_TESTS=1.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-cartoon-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, getVideo, paths, upsertVideo } = await import("@cvs/db");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { CARTOON_SAMPLE, getSkill, listSkills } = await import("@cvs/studio");

let pid = "";
const KEY = "HH-L1_V1";
const norm = createNormalizer();
const req = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });

beforeAll(() => {
  pid = createProject("Hoạt hình", "HH", ["L1"]).id;
  upsertVideo(pid, {
    key: KEY, course: "HH", level: "L1", module: "", unit: "", seq: "", title: "An toàn máy", style: "giay-ky-thuat", engine: "hyperframes",
    voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
    scenes: [{ id: "s1", scriptStart: 0, scriptEnd: 10, title: "Rủi ro", visual: "Kỹ sư phát hiện dây hở", onscreen: ["Kiểm tra trước khi vận hành"], sentences: makeSentences("Kỹ sư đến máy. Anh thấy dây điện hở.", norm) }],
  } as any);
});
afterAll(() => {
  try {
    rmSync(storage, { recursive: true, force: true });
  } catch {
    /* Windows: file còn bị giữ */
  }
});

describe("cài đặt + chính sách", () => {
  it("cài đặt sai bị từ chối; bật → AI (Claude Code) thấy template cartoon; tắt → không", async () => {
    for (const bad of [{ enabled: "yes" }, { enabled: true, quality: "4k" }, { enabled: true, clawd: 1 }, { enabled: true, x: 1 }])
      expect((await req("PATCH", `/projects/${pid}`, { settings: { cartoon: bad } })).status).toBe(400);
    const prompt = async () => (await (await req("POST", "/claude-code/prompt", { kind: "design", projectId: pid, videoKey: KEY, sceneId: "s1" })).json()).system as string;
    expect(await prompt()).not.toContain("### cartoon");
    expect((await req("PATCH", `/projects/${pid}`, { settings: { cartoon: { enabled: true, quality: "nhe" } } })).status).toBe(200);
    expect(await prompt()).toContain("### cartoon");
    // AI chọn cartoon qua set-design (PATCH by ai): cần brief; chữ vẫn theo kịch bản
    const patch = (body: unknown) => req("PATCH", `/projects/${pid}/videos/${KEY}/scenes/s1`, body);
    expect((await (await patch({ design: { template: "cartoon", params: {} }, by: "ai" })).json()).errors.join()).toMatch(/brief/);
    expect((await (await patch({ design: { template: "cartoon", params: { brief: "Kỹ sư thấy dây hở", title: "Chữ tự nghĩ" } }, by: "ai" })).json()).errors.join()).toMatch(/«Chữ tự nghĩ»/);
    expect(await (await patch({ design: { template: "cartoon", params: { brief: "Kỹ sư thấy dây hở", title: "Kiểm tra trước khi vận hành", code: "lén ghi mã" } }, by: "ai" })).json()).toEqual({ ok: true, errors: [] });
    // mã cảnh không ghi được qua set-design (chỉ qua set-cartoon có vẽ thử)
    expect(getVideo(pid, KEY)!.data.scenes[0].design!.params.code).toBeUndefined();
  });
  it("prompt cartoon cho Claude Code: có mốc câu + brief; cảnh không phải cartoon → lỗi rõ", async () => {
    const r = await (await req("POST", "/claude-code/prompt", { kind: "cartoon", projectId: pid, videoKey: KEY, sceneId: "s1" })).json();
    expect(r.system).toContain("function scene(t)");
    expect(r.system).toContain("CHỈ dùng kysu()");
    expect(r.content).toContain("Kỹ sư thấy dây hở");
    expect(r.content).toContain("[câu 1]");
  });
  it("set-cartoon: mã lỗi lint → từ chối, không lưu, không mở trình duyệt", async () => {
    const r = await (await req("POST", `/projects/${pid}/videos/${KEY}/scenes/s1/cartoon`, { code: "function scene(t) { fetch('http://x') }" })).json();
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/mạng/);
    expect(r.frames).toEqual([]);
    expect(getVideo(pid, KEY)!.data.scenes[0].design!.params.code).toBeUndefined();
    expect((await (await req("POST", `/projects/${pid}/videos/${KEY}/scenes/s9/cartoon`, { code: "x" })).json()).errors.join()).toMatch(/Không có cảnh/);
  });
  it.runIf(process.env.CVS_RENDER_TESTS === "1")("set-cartoon mã đạt: vẽ thử, trả ảnh khung, lưu mã, bỏ clip cũ", async () => {
    const r = await (await req("POST", `/projects/${pid}/videos/${KEY}/scenes/s1/cartoon`, { code: CARTOON_SAMPLE, assumptions: ["máy ép"] })).json();
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.frames.length).toBeGreaterThan(1);
    const d = getVideo(pid, KEY)!.data.scenes[0];
    expect(d.design!.params.code).toBe(CARTOON_SAMPLE);
    expect(d.assumptions).toContain("AI: máy ép");
  }, 180_000);
});

describe("dọn dẹp", () => {
  it("chỉ liệt kê clip hoạt hình không còn cảnh nào dùng + ảnh vẽ thử", async () => {
    const dir = paths.cartoon(pid);
    mkdirSync(join(dir, "check"), { recursive: true });
    for (const f of ["aaaaaaaaaaaaaaaa.mp4", "bbbbbbbbbbbbbbbb.mp4"]) writeFileSync(join(dir, f), "x");
    const v = getVideo(pid, KEY)!.data;
    v.scenes[0].design = { template: "cartoon", params: { brief: "x", clip: "aaaaaaaaaaaaaaaa.mp4" }, by: "ai" };
    upsertVideo(pid, v);
    const items = (await (await req("GET", `/projects/${pid}/cleanup`)).json()) as { path: string; label: string }[];
    const mine = items.filter((x) => x.path.startsWith(dir)).map((x) => x.label);
    expect(mine).toEqual(["Clip hoạt hình cũ bbbbbbbbbbbbbbbb.mp4", "Ảnh vẽ thử hoạt hình"]);
  });
});

describe("skill có sẵn", () => {
  it("Hoạt hình vẽ tay có trong thư viện, có ghi nguồn, không xoá được", async () => {
    expect(listSkills()[0]).toMatchObject({ id: "san-co-hoat-hinh-ve-tay", builtin: true, license: "MIT" });
    expect(getSkill("san-co-hoat-hinh-ve-tay")!.text).toContain("Timing theo người xem");
    const del = await req("DELETE", "/skills/san-co-hoat-hinh-ve-tay");
    expect(del.status).toBe(400);
    expect((await req("PATCH", `/projects/${pid}`, { settings: { skill: "san-co-hoat-hinh-ve-tay" }, applyToVideos: true })).status).toBe(200);
    const p = await (await req("POST", "/claude-code/prompt", { kind: "design", projectId: pid, videoKey: KEY, sceneId: "s1" })).json();
    expect(p.system).toContain("«Hoạt hình vẽ tay (nguyên tắc)»");
  });
});
