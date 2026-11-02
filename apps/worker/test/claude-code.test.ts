// Cầu nối Claude Code: PATCH thiết kế cảnh (kiểm như AI trong app), hàng đợi yêu cầu, prompt, và lệnh `pnpm cvs` gọi API thật (qua app.request).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-cc-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, getVideo, setVideoFlags, upsertVideo } = await import("@cvs/db");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { TEMPLATES } = await import("@cvs/engine");
const { main, parseArgs } = await import("../../../scripts/cvs");

let pid = "";
const KEY = "CC-L1_V1";
const norm = createNormalizer();
const video = () => ({
  key: KEY, course: "CC", level: "L1", module: "", unit: "", seq: "", title: "Thẩm định và thẩm tra", style: "giay-ky-thuat", engine: "hyperframes",
  voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
  scenes: [
    { id: "s1", scriptStart: 0, scriptEnd: 10, title: "So sánh", visual: "So sánh hai bên", onscreen: ["Thẩm định", "Thẩm tra"], sentences: makeSentences("Thẩm định diễn ra trước khi dự án đăng ký. Thẩm tra diễn ra định kỳ sau mỗi kỳ giám sát.", norm), assumptions: ["AI: chữ cũ", "Ghi chú người duyệt"] },
    { id: "s2", scriptStart: 10, scriptEnd: 20, title: "Hiện trường", visual: "Công nhân", onscreen: [], sentences: makeSentences("Công nhân đội mũ bảo hộ. Họ kiểm tra máy.", norm) },
  ],
});
const patch = (sid: string, body: unknown) => app.request(`/api/projects/${pid}/videos/${KEY}/scenes/${sid}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><script>alert(1)</script>
<g id="part-1"><rect x="0" y="500" width="800" height="100" fill="var(--bg2)"/><path class="draw" pathLength="1" d="M0 500 H800" fill="none" stroke="var(--ink)"/></g>
<g id="part-2"><circle cx="400" cy="200" r="60" fill="var(--accent)"/><rect x="350" y="260" width="100" height="200" fill="var(--card)" stroke="var(--ink)"/><line x1="350" y1="300" x2="300" y2="380" stroke="var(--ink)"/><line x1="450" y1="300" x2="500" y2="380" stroke="var(--ink)"/></g></svg>`;

beforeAll(() => {
  pid = createProject("Dự án Claude Code", "CC", ["L1"]).id;
  upsertVideo(pid, video() as any);
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("PATCH thiết kế cảnh", () => {
  it("template hợp lệ → lưu, thiết kế cũ vào lịch sử, assumptions AI cũ được thay, bỏ duyệt", async () => {
    setVideoFlags(pid, KEY, { approved: true });
    const ex = TEMPLATES["split-compare"].example;
    let r = await patch("s1", { design: { template: "title-card", params: TEMPLATES["title-card"].example }, by: "ai" });
    expect(await r.json()).toEqual({ ok: true, errors: [] });
    r = await patch("s1", { design: { template: "split-compare", params: ex }, assumptions: ["Nhãn «Trước»"], note: "đổi sang so sánh", by: "ai" });
    expect(r.status).toBe(200);
    const row = getVideo(pid, KEY)!;
    const s = row.data.scenes[0];
    expect(row.approved).toBe(false);
    expect(s.design).toMatchObject({ template: "split-compare", by: "ai" });
    expect(s.history?.map((h) => h.template)).toEqual(["title-card"]);
    expect(s.assumptions).toEqual(["Ghi chú người duyệt", "AI: Nhãn «Trước»"]);
    expect(s.notes).toEqual(["đổi sang so sánh"]);
  });

  it("lịch sử giữ tối đa 5 thiết kế", async () => {
    for (let i = 0; i < 6; i++) await patch("s1", { design: { template: "title-card", params: { title: `Tiêu đề ${i}` } } });
    expect(getVideo(pid, KEY)!.data.scenes[0].history).toHaveLength(5);
  });

  it("từ chối: template lạ, thiếu tham số, cue vượt số câu, illustration không brief, cảnh/video không có", async () => {
    const bad = async (body: unknown) => (await (await patch("s1", body)).json()).errors.join("\n");
    expect(await bad({ design: { template: "khong-co", params: {} } })).toMatch(/không có trong thư viện/);
    expect(await bad({ design: { template: "split-compare", params: {} } })).toMatch(/Thiếu/);
    expect(await bad({ design: { template: "title-card", params: { title: "A", at: { cue: 5, f: 0 } } } })).toMatch(/vượt quá số câu/);
    expect(await bad({ design: { template: "illustration", params: { title: "A" } } })).toMatch(/brief/);
    expect(await bad({ design: { template: "title-card", params: { title: "A" } }, by: "robot" })).toMatch(/by/);
    expect((await patch("s9", { design: { template: "title-card", params: { title: "A" } } })).status).toBe(404);
    const before = getVideo(pid, KEY)!.data.scenes[0].design;
    expect((await patch("s1", { design: { template: "split-compare", params: {} } })).status).toBe(400);
    expect(getVideo(pid, KEY)!.data.scenes[0].design).toEqual(before);
  });

  it("illustration: SVG được lọc + gắn svgKey; đổi tham số không gửi SVG (cùng brief) → giữ hình; SVG sơ sài bị từ chối", async () => {
    const brief = "Công nhân đội mũ bảo hộ đứng trên sàn xưởng";
    let r = await patch("s2", { design: { template: "illustration", params: { title: "Bảo hộ", brief, svg: SVG } }, by: "ai" });
    expect(await r.json()).toEqual({ ok: true, errors: [] });
    let p = getVideo(pid, KEY)!.data.scenes[1].design!.params as any;
    expect(p.svg).toContain('id="part-2"');
    expect(p.svg).not.toContain("script");
    expect(p.svgKey).toMatch(/^[a-f0-9]{16}$/);
    r = await patch("s2", { design: { template: "illustration", params: { title: "Đổi tiêu đề", brief } } });
    p = getVideo(pid, KEY)!.data.scenes[1].design!.params as any;
    expect(p.title).toBe("Đổi tiêu đề");
    expect(p.svg).toContain('id="part-2"');
    const weak = await (await patch("s2", { design: { template: "illustration", params: { brief, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><circle cx="1" cy="1" r="1"/></svg>' } } })).json();
    expect(weak.ok).toBe(false);
    expect(weak.errors.join(" ")).toMatch(/SVG: .*(sơ sài|part)/);
  });

  it("cảnh tùy biến: mã phải qua lint HyperFrames", async () => {
    const r = await (await patch("s2", { design: { template: "custom", customCode: { hyperframes: "<div>không theo hợp đồng</div>" } } })).json();
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/header-comment|template-wrap/);
    const empty = await (await patch("s2", { design: { template: "custom" } })).json();
    expect(empty.errors[0]).toMatch(/customCode\.hyperframes/);
  });
});

describe("hàng đợi yêu cầu Claude Code", () => {
  const post = (body: unknown) => app.request("/api/claude-code/requests", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  it("tạo – kiểm dữ liệu vào – liệt kê đang chờ – đánh dấu xong", async () => {
    expect((await post({ projectId: "khong-co", kind: "agent" })).status).toBe(404);
    expect((await post({ projectId: pid, kind: "xoa-het" })).status).toBe(400);
    expect((await post({ projectId: pid, videoKey: KEY, kind: "revise", note: "x" })).status).toBe(400); // thiếu cảnh
    expect((await post({ projectId: pid, videoKey: KEY, sceneId: "s1", kind: "revise" })).status).toBe(400); // thiếu note
    expect((await post({ projectId: pid, videoKey: KEY, sceneId: "s9", kind: "revise", note: "x" })).status).toBe(404);
    const a = await (await post({ projectId: pid, videoKey: KEY, sceneId: "s1", kind: "revise", note: "  chữ to hơn " })).json();
    const b = await (await post({ projectId: pid, kind: "fix-readings" })).json();
    expect(a).toMatchObject({ kind: "revise", status: "pending", note: "chữ to hơn", scene_id: "s1" });
    const pending = await (await app.request("/api/claude-code/requests?status=pending")).json();
    expect(pending.map((x: any) => x.id)).toEqual([a.id, b.id]);
    const bad = await app.request(`/api/claude-code/requests/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "lam-xong" }), headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
    const done = await (await app.request(`/api/claude-code/requests/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", message: "Đã đổi" }), headers: { "content-type": "application/json" } })).json();
    expect(done).toMatchObject({ status: "done", message: "Đã đổi" });
    const left = await (await app.request(`/api/claude-code/requests?status=pending&projectId=${pid}`)).json();
    expect(left.map((x: any) => x.id)).toEqual([b.id]);
  });

  it("prompt đúng như đường API: design có thư viện + lời thoại + ghi chú; readings; illustration cần brief", async () => {
    const p = async (body: object) => app.request("/api/claude-code/prompt", { method: "POST", body: JSON.stringify({ projectId: pid, videoKey: KEY, ...body }), headers: { "content-type": "application/json" } });
    const d = await (await p({ kind: "design", sceneId: "s1", note: "dùng hai cột" })).json();
    expect(d.system).toContain("THƯ VIỆN TEMPLATE");
    expect(d.system).toContain("KHÔNG BỊA SỐ LIỆU");
    expect(d.content).toContain("Thẩm định diễn ra trước khi dự án đăng ký.");
    expect(d.content).toContain("GHI CHÚ SỬA CỦA NGƯỜI DUYỆT (bắt buộc làm theo): dùng hai cột");
    const ill = await (await p({ kind: "illustration", sceneId: "s1" })).json();
    expect(ill.error).toMatch(/brief/);
    const ok = await (await p({ kind: "illustration", sceneId: "s1", note: "Hai người bắt tay" })).json();
    expect(ok.system).toContain('viewBox="0 0 800 600"');
    const rd = await (await p({ kind: "readings" })).json();
    expect(rd.content).toContain('"fixes"');
    expect((await p({ kind: "xyz" })).status).toBe(400);
  });
});

describe("lệnh pnpm cvs", () => {
  const run = async (...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const calls: string[] = [];
    const code = await main(argv, {
      base: "http://cvs.test/api",
      fetch: (async (u: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(u).replace("http://cvs.test", "")}`);
        return app.request(String(u), init);
      }) as typeof fetch,
      out: (s) => out.push(s),
      err: (s) => err.push(s),
      readFile: (p) => (p.startsWith("mem:") ? p.slice(4) : readFileSync(p, "utf8")),
      sleep: async () => {},
    });
    return { code, out: out.join("\n"), err: err.join("\n"), calls };
  };

  it("parseArgs: cờ có giá trị, --x=y, cờ boolean, thiếu giá trị", () => {
    expect(parseArgs(["set-svg", "p", "k", "s1", "a.svg", "--brief", "hai người", "--note=x", "--quiet"])).toEqual({ pos: ["set-svg", "p", "k", "s1", "a.svg"], flags: { brief: "hai người", note: "x", quiet: "1" } });
    expect(() => parseArgs(["x", "--note"])).toThrow(/Thiếu giá trị/);
  });

  it("help, lệnh lạ, thiếu tham số, worker không chạy", async () => {
    expect((await run()).out).toContain("set-design");
    expect((await run("abc")).code).toBe(64);
    expect((await run("video", pid)).err).toMatch(/Thiếu tham số/);
    const down = await main(["projects"], { base: "http://127.0.0.1:9/api", fetch: (async () => { throw new TypeError("fetch failed"); }) as any, out: () => {}, err: (s) => expect(s).toMatch(/KHOI_DONG/), readFile: () => "", sleep: async () => {} });
    expect(down).toBe(1);
  });

  it("set-design từ file JSON → PATCH; video in thiết kế (SVG rút gọn) + timing", async () => {
    const f = join(storage, "design.json");
    writeFileSync(f, JSON.stringify({ template: "split-compare", params: TEMPLATES["split-compare"].example, assumptions: ["Biểu tượng"] }));
    const r = await run("set-design", pid, KEY, "s1", f, "--note", "Claude Code: so sánh");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ ok: true, errors: [] });
    expect(r.calls).toContain(`PATCH /api/projects/${pid}/videos/${KEY}/scenes/s1`);
    expect(getVideo(pid, KEY)!.data.scenes[0].design!.by).toBe("ai");
    const bad = await run("set-design", pid, KEY, "s1", "mem:{\"template\":\"split-compare\",\"params\":{}}");
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/Thiếu/);
    const v = JSON.parse((await run("video", pid, KEY)).out);
    expect(v.scenes[0]).toMatchObject({ id: "s1", design: { template: "split-compare" }, sentences: [{ idx: 0, text: "Thẩm định diễn ra trước khi dự án đăng ký." }, expect.anything()] });
    expect(v.scenes[0].timing.dur).toBeGreaterThan(0);
    expect(v.scenes[1].design.params.svg).toMatch(/^\(SVG \d+ ký tự/);
  });

  it("set-svg giữ tham số cảnh, set-reading khoá cách đọc, templates, pending/done", async () => {
    const r = await run("set-svg", pid, KEY, "s2", `mem:${SVG}`);
    expect(JSON.parse(r.out).ok).toBe(true);
    expect((getVideo(pid, KEY)!.data.scenes[1].design!.params as any).title).toBe("Đổi tiêu đề");
    expect((await run("set-svg", pid, KEY, "s1", `mem:${SVG}`)).err).toMatch(/--brief/);
    expect((await run("set-reading", pid, KEY, "s1", "0", "thẩm", "định")).code).toBe(0);
    expect(getVideo(pid, KEY)!.data.scenes[0].sentences[0]).toMatchObject({ tts: "thẩm định", ttsLocked: true });
    expect((await run("set-reading", pid, KEY, "s1", "7", "x")).err).toMatch(/Không tìm thấy câu/);
    const t = JSON.parse((await run("templates")).out);
    expect(t.templates.some((x: any) => x.id === "hub-spoke" && x.schema && x.example)).toBe(true);
    expect(t.icons.count).toBeGreaterThan(10);
    expect(t.kineticPresets.length).toBeGreaterThan(3);
    const pending = JSON.parse((await run("pending")).out);
    expect(pending.length).toBeGreaterThan(0);
    const d = await run("done", String(pending[0].id), "Đã", "xong");
    expect(JSON.parse(d.out)).toMatchObject({ status: "done", message: "Đã xong" });
    expect((await run("fail", "1")).code).toBe(64);
  });
});

describe("hàng đợi Claude Code: không tạo việc trùng", () => {
  it("cùng loại + video đang chờ → trả lại việc cũ; sửa cảnh khác nội dung → gộp; huỷ được việc đang chờ", async () => {
    const { addClaudeRequest, createProject, getClaudeRequest } = await import("@cvs/db");
    const pid = createProject("Trùng", "TR", ["L1"]).id;
    const a = addClaudeRequest({ projectId: pid, videoKey: "V1", kind: "agent" });
    const b = addClaudeRequest({ projectId: pid, videoKey: "V1", kind: "agent" });
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
    expect(addClaudeRequest({ projectId: pid, videoKey: "V2", kind: "agent" }).id).not.toBe(a.id);
    const r1 = addClaudeRequest({ projectId: pid, videoKey: "V1", sceneId: "s1", kind: "revise", note: "chữ to hơn" });
    const r2 = addClaudeRequest({ projectId: pid, videoKey: "V1", sceneId: "s1", kind: "revise", note: "đổi màu nhấn" });
    expect(r2.id).toBe(r1.id);
    expect(r2.merged).toBe(true);
    expect(getClaudeRequest(r1.id)!.note).toContain("đổi màu nhấn");
    const res = await app.request(`/api/claude-code/requests/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    expect(addClaudeRequest({ projectId: pid, videoKey: "V1", kind: "agent" }).duplicate).toBeUndefined();
  });
});
