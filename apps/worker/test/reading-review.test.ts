// Claude rà soát cách đọc: lưu đề xuất (không đổi tts), chấp nhận / bỏ qua / chấp nhận tất cả, chặn sản xuất khi còn đề xuất,
// job rà soát (Claude giả), prompt cho Claude Code và lệnh `pnpm cvs suggest-reading`.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-rr-"));
process.env.CVS_STORAGE = storage;

const fake = vi.hoisted(() => ({ review: [] as any[], fix: [] as any[], calls: [] as any[] }));
vi.mock("@cvs/ai", async (orig) => ({
  ...(await orig<typeof import("@cvs/ai")>()),
  aiAvailable: () => true,
  reviewReadings: vi.fn(async (items: any[], context: string) => (fake.calls.push({ items, context }), fake.review)),
  fixReadings: vi.fn(async (items: any[]) => (fake.calls.push({ fixItems: items }), fake.fix)),
}));

const { app } = await import("../src/api");
const { createProject, getVideo, glossaryFor, upsertVideo } = await import("@cvs/db");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { aiFixReading, aiReviewReadings, readingIssues, stepNormalize } = await import("@cvs/studio");
const { main } = await import("../../../scripts/cvs");

let pid = "";
const KEY = "RR-L1_V1";
const norm = createNormalizer();
const video = () => ({
  key: KEY, course: "RR", level: "L1", module: "", unit: "", seq: "", title: "An toàn ISO 45001", style: "giay-ky-thuat", engine: "hyperframes",
  voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
  scenes: [
    { id: "s1", scriptStart: 0, scriptEnd: 10, title: "Mở đầu", visual: "", onscreen: [], sentences: makeSentences("Bộ phận HSE kiểm tra định kỳ. Công nhân đội mũ bảo hộ.", norm) },
    { id: "s2", scriptStart: 10, scriptEnd: 20, title: "Tiêu chuẩn", visual: "", onscreen: [], sentences: makeSentences("Tiêu chuẩn mới ra đời năm ngoái. Ai cũng cần biết.", norm) },
  ],
});
const sent = (sid: string, i: number) => getVideo(pid, KEY)!.data.scenes.find((s) => s.id === sid)!.sentences[i];
const req = (method: string, path: string, body?: unknown) => app.request(`/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
const patchSentence = (body: unknown) => req("PATCH", `/projects/${pid}/videos/${KEY}/sentence`, body);
const suggest = (scene: string, idx: number, tts: string, extra: object = {}) => patchSentence({ scene, idx, suggest: { tts, by: "claude-code", ...extra } });
const ctx = () => ({ projectId: pid, key: KEY, settings: {} as any, progress: () => {}, shouldStop: () => false, log: () => {} });

beforeAll(() => {
  pid = createProject("Dự án đọc", "RR", ["L1"]).id;
});
beforeEach(() => {
  upsertVideo(pid, video() as any);
  fake.calls.length = 0;
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("đề xuất cách đọc qua API", () => {
  it("lưu đề xuất không đổi tts; kiểm dữ liệu vào; câu có đề xuất tính là cần soát (kể cả câu đã khoá)", async () => {
    const before = sent("s2", 1).tts;
    expect(readingIssues(getVideo(pid, KEY)!.data).filter((i) => i.scene === "s2")).toEqual([]);
    let r = await suggest("s2", 1, "Ai cũng cần biết rõ.", { reason: "thử", glossary: [{ term: "HSE", reading: "hát ét ét" }] });
    expect(r.status).toBe(200);
    expect(sent("s2", 1)).toMatchObject({ tts: before, suggest: { tts: "Ai cũng cần biết rõ.", reason: "thử", by: "claude-code" } });
    const issues = readingIssues(getVideo(pid, KEY)!.data).filter((i) => i.scene === "s2");
    expect(issues).toMatchObject([{ idx: 1, suggested: true }]);
    expect(issues[0].warnings[0]).toMatch(/Claude đề xuất/);
    const bad = async (body: unknown) => (await patchSentence(body)).status;
    expect(await bad({ scene: "s2", idx: 1, suggest: { tts: " ", by: "ai" } })).toBe(400);
    expect(await bad({ scene: "s2", idx: 1, suggest: { tts: "x", by: "robot" } })).toBe(400);
    expect(await bad({ scene: "s2", idx: 1, suggest: { tts: "x", by: "ai", glossary: [{ term: "A" }] } })).toBe(400);
    expect(await bad({ scene: "s2", idx: 1, suggest: { tts: before, by: "ai" } })).toBe(400); // trùng cách đọc hiện tại
    expect(await bad({ scene: "s9", idx: 0, suggest: { tts: "x", by: "ai" } })).toBe(404);
    expect(await bad({ scene: "s2", idx: 1, action: "xoa" })).toBe(400);
    expect(await bad({ scene: "s2", idx: 0, action: "accept" })).toBe(400); // không có đề xuất
    const rows = await (await req("GET", `/projects/${pid}/reading`)).json();
    expect(rows.find((x: any) => x.scene === "s2" && x.idx === 1).suggest.tts).toBe("Ai cũng cần biết rõ.");
    expect((await (await req("GET", `/projects/${pid}/progress`)).json()).reading).toBeGreaterThanOrEqual(1);
  });

  it("chấp nhận: tts = đề xuất, khoá, thêm thuật ngữ mới, xoá đề xuất; bỏ qua: chỉ xoá đề xuất", async () => {
    await suggest("s1", 0, "Bộ phận hát ét ét kiểm tra định kỳ.", { glossary: [{ term: "HSE", reading: "hát ét ét" }] });
    await suggest("s2", 0, "Tiêu chuẩn mới ra đời năm ngoái nhé.");
    const r = await (await patchSentence({ scene: "s1", idx: 0, action: "accept" })).json();
    expect(r).toEqual({ ok: true, tts: "Bộ phận hát ét ét kiểm tra định kỳ.", warnings: [] });
    expect(sent("s1", 0)).toEqual({ text: "Bộ phận HSE kiểm tra định kỳ.", tts: "Bộ phận hát ét ét kiểm tra định kỳ.", ttsLocked: true });
    expect(glossaryFor(pid).filter((g) => g.term === "HSE")).toHaveLength(1);
    const before = sent("s2", 0).tts;
    expect((await patchSentence({ scene: "s2", idx: 0, action: "reject" })).status).toBe(200);
    expect(sent("s2", 0)).toEqual({ text: "Tiêu chuẩn mới ra đời năm ngoái.", tts: before });
  });

  it("chấp nhận tất cả (cả dự án / một video); thuật ngữ đã có không thêm trùng", async () => {
    await suggest("s1", 1, "Công nhân đội mũ bảo hộ lao động.", { glossary: [{ term: "hse", reading: "khác" }] });
    await suggest("s2", 1, "Ai cũng phải biết.");
    expect((await req("POST", `/projects/${pid}/reading/accept-all`, { key: "khong-co" })).status).toBe(404);
    const r = await (await req("POST", `/projects/${pid}/reading/accept-all`, { key: KEY })).json();
    expect(r).toEqual({ ok: true, accepted: 2 });
    expect(sent("s1", 1)).toMatchObject({ tts: "Công nhân đội mũ bảo hộ lao động.", ttsLocked: true });
    expect(sent("s2", 1).suggest).toBeUndefined();
    expect(glossaryFor(pid).filter((g) => g.term.toLowerCase() === "hse")).toHaveLength(1);
    expect(await (await req("POST", `/projects/${pid}/reading/accept-all`, {})).json()).toEqual({ ok: true, accepted: 0 });
  });
});

describe("sản xuất & agent", () => {
  it("bước Chuẩn hoá dừng khi còn đề xuất (trừ khi bỏ qua cảnh báo); agent không ghi đè câu có đề xuất", async () => {
    await suggest("s1", 0, "Bộ phận hát ét ét kiểm tra.");
    await expect(stepNormalize(ctx())).rejects.toThrow(/Claude đề xuất/);
    await stepNormalize(ctx(), true);
    expect(sent("s1", 0).suggest?.tts).toBe("Bộ phận hát ét ét kiểm tra."); // chuẩn hoá lại giữ đề xuất
    fake.fix = [{ id: "s1#0", tts: "GHI ĐÈ" }];
    expect(await aiFixReading(ctx())).toBe(0);
    expect(fake.calls).toEqual([]); // câu có đề xuất không gửi đi sửa tự động
    expect(sent("s1", 0).tts).not.toBe("GHI ĐÈ");
  });

  it("job rà soát: gửi MỌI câu, lưu đề xuất by ai, thay đề xuất AI cũ, giữ đề xuất Claude Code, bỏ đề xuất cho câu đã đổi", async () => {
    await suggest("s2", 0, "Đề xuất từ Claude Code.");
    const v = getVideo(pid, KEY)!.data;
    v.scenes[1].sentences[1].suggest = { tts: "đề xuất AI cũ", by: "ai" };
    upsertVideo(pid, v);
    fake.review = [
      { id: "s1#0", tts: "Bộ phận hát ét ét kiểm tra định kỳ.", reason: "HSE đọc theo chữ cái", glossary: [{ term: "HSE", reading: "hát ét ét" }] },
      { id: "s1#1", tts: sent("s1", 1).tts }, // trùng → bỏ
    ];
    const r = await aiReviewReadings(ctx(), KEY);
    expect(r).toEqual({ videos: 1, suggestions: 1 });
    expect(fake.calls[0].items).toHaveLength(4);
    expect(fake.calls[0].items[0]).toMatchObject({ id: "s1#0", text: "Bộ phận HSE kiểm tra định kỳ." });
    expect(fake.calls[0].items[0].warnings.join()).toMatch(/HSE/);
    expect(fake.calls[0].context).toContain("An toàn ISO 45001");
    expect(sent("s1", 0)).toMatchObject({ tts: expect.stringContaining("HSE"), suggest: { tts: "Bộ phận hát ét ét kiểm tra định kỳ.", reason: "HSE đọc theo chữ cái", by: "ai" } });
    expect(sent("s2", 0).suggest?.by).toBe("claude-code");
    expect(sent("s2", 1).suggest).toBeUndefined();
    // cả dự án (không key) qua job API: xếp hàng một lượt mỗi dự án
    const [j1] = await (await req("POST", `/projects/${pid}/jobs`, { kind: "reading-review", keys: [null] })).json();
    const [j2] = await (await req("POST", `/projects/${pid}/jobs`, { kind: "reading-review", keys: [null] })).json();
    expect(j2.id).toBe(j1.id);
  });
});

describe("Claude Code", () => {
  const run = async (...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(argv, { base: "http://cvs.test/api", fetch: ((u: string, init?: RequestInit) => app.request(String(u), init)) as typeof fetch, out: (s) => out.push(s), err: (s) => err.push(s), readFile: () => "", sleep: async () => {} });
    return { code, out: out.join("\n"), err: err.join("\n") };
  };

  it("yêu cầu review-readings vào hàng đợi; prompt review-readings có mọi câu", async () => {
    const q = await (await req("POST", "/claude-code/requests", { projectId: pid, kind: "review-readings" })).json();
    expect(q).toMatchObject({ kind: "review-readings", status: "pending" });
    const p = await (await req("POST", "/claude-code/prompt", { projectId: pid, videoKey: KEY, kind: "review-readings" })).json();
    expect(p.content).toContain('"suggestions"');
    for (const id of ["s1#0", "s1#1", "s2#0", "s2#1"]) expect(p.content).toContain(`"${id}"`);
    expect(p.system).toContain("i sô");
  });

  it("readings in mọi câu (--warn: chỉ câu cảnh báo); suggest-reading lưu đề xuất by claude-code, không đổi tts", async () => {
    const all = JSON.parse((await run("readings", pid, KEY)).out);
    expect(all.map((r: any) => r.id)).toEqual(["s1#0", "s1#1", "s2#0", "s2#1"]);
    expect(JSON.parse((await run("readings", pid, KEY, "--warn")).out).map((r: any) => r.id)).toEqual(["s1#0"]);
    const before = sent("s1", 0).tts;
    const r = await run("suggest-reading", pid, KEY, "s1", "0", "Bộ", "phận", "hát ét ét", "kiểm tra định kỳ.", "--reason", "HSE đọc theo chữ cái", "--glossary", "HSE=hát ét ét; PPE = pê pê e");
    expect(r.code).toBe(0);
    expect(sent("s1", 0)).toMatchObject({ tts: before, suggest: { tts: "Bộ phận hát ét ét kiểm tra định kỳ.", reason: "HSE đọc theo chữ cái", by: "claude-code", glossary: [{ term: "HSE", reading: "hát ét ét" }, { term: "PPE", reading: "pê pê e" }] } });
    expect(JSON.parse((await run("readings", pid, KEY)).out)[0].suggest.by).toBe("claude-code");
    expect((await run("suggest-reading", pid, KEY, "s1", "0", "x", "--glossary", "HSE")).code).toBe(64);
    expect((await run("suggest-reading", pid, KEY, "s1", "-1", "x")).code).toBe(64);
    expect((await run("suggest-reading", pid, KEY, "s9", "0", "x")).err).toMatch(/Không tìm thấy câu/);
  });
});
