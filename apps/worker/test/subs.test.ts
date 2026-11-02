// Phụ đề nhiều ngôn ngữ + logo: API cài đặt (kẹp, kiểm logo, mặc định cho dự án mới, dựng lại hình), lưu/kiểm bản dịch,
// VTT theo ngôn ngữ, job dịch bằng Claude (giả), yêu cầu + lệnh `pnpm cvs` cho Claude Code, xuất .vtt mỗi ngôn ngữ.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-subs-"));
process.env.CVS_STORAGE = storage;

const fake = vi.hoisted(() => ({ calls: [] as any[], reply: null as null | ((items: any[]) => any[]) }));
vi.mock("@cvs/ai", async (orig) => ({
  ...(await orig<typeof import("@cvs/ai")>()),
  aiAvailable: () => true,
  translateSubs: vi.fn(async (items: any[], lang: string, context: string, memory: any[]) => (fake.calls.push({ items, lang, context, memory }), fake.reply!(items))),
}));

const { app } = await import("../src/api");
const { createProject, getProject, getVideo, listClaudeRequests, setVideoFlags, setVideoQa, upsertVideo, paths } = await import("@cvs/db");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { aiTranslateSubs, exportProject, saveAsset } = await import("@cvs/studio");
const { FFMPEG } = await import("@cvs/tts");
const { main } = await import("../../../scripts/cvs");

// PNG 2×1 hợp lệ
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000002000000010806000000f478d4fa0000000d4944415478da63f8cfc0f01f0005000201a9e2a4c20000000049454e44ae426082", "hex");
let pid = "";
const KEY = "SB-L1_V1";
const norm = createNormalizer();
const video = () => ({
  key: KEY, course: "SB", level: "L1", module: "", unit: "", seq: "", title: "Tín chỉ carbon", style: "giay-ky-thuat", engine: "hyperframes",
  voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
  scenes: [
    { id: "s1", scriptStart: 0, scriptEnd: 10, title: "Mở đầu", visual: "", onscreen: [], sentences: makeSentences("Mỗi tín chỉ là 1 tấn CO₂. Thẩm tra diễn ra định kỳ.", norm) },
    { id: "s2", scriptStart: 10, scriptEnd: 20, title: "Tiếp", visual: "", onscreen: [], sentences: makeSentences("Năm 2015 có Thỏa thuận Paris.", norm) },
  ],
});
const req = async (method: string, path: string, body?: unknown) => {
  const r = await app.request(`/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};
const sent = (sid: string, i: number) => getVideo(pid, KEY)!.data.scenes.find((s) => s.id === sid)!.sentences[i];
const cli = async (argv: string[], file = "") => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { base: "http://cvs.test/api", fetch: ((u: string, init?: RequestInit) => app.request(String(u), init)) as typeof fetch, out: (s) => out.push(s), err: (s) => err.push(s), readFile: () => file, sleep: async () => {} });
  return { code, out: out.join("\n"), err: err.join("\n") };
};
const ctx = () => ({ projectId: pid, key: KEY, settings: {} as any, progress: () => {}, shouldStop: () => false, log: () => {} });

beforeAll(() => {
  pid = createProject("Phụ đề", "SB", ["L1"]).id;
});
beforeEach(() => {
  upsertVideo(pid, video() as any);
  fake.calls.length = 0;
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("cài đặt phụ đề và logo", () => {
  it("kẹp giá trị, kiểm logo là ảnh của dự án, báo video cần dựng lại hình", async () => {
    let r = await req("PATCH", `/projects/${pid}/overlay`, { subtitle: { mode: "burn", size: 500, offset: 50, languages: ["vi", "en", "xx"] } });
    expect(r.status).toBe(200);
    expect(r.body.subtitle).toMatchObject({ mode: "burn", size: 72, offset: 30, languages: ["vi", "en"] });
    expect(r.body.missing).toEqual({ en: 3 });
    expect((await req("PATCH", `/projects/${pid}/overlay`, { logo: { assetId: "../x.png" } })).status).toBe(400);
    expect((await req("PATCH", `/projects/${pid}/overlay`, { logo: { assetId: "0123456789abcdef-2x1.png" } })).body.error).toMatch(/Không có ảnh logo/);
    const a = saveAsset(pid, "logo.png", PNG);
    r = await req("PATCH", `/projects/${pid}/overlay`, { logo: { assetId: a.id, size: 12 } });
    expect(r.body.logo).toMatchObject({ assetId: a.id, size: 12 });
    // video đã render khi chưa có lớp phủ → cũ, cần dựng lại hình (giữ giọng)
    const mp4 = paths.render(pid, KEY);
    mkdirSync(join(mp4, ".."), { recursive: true });
    execFileSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x36:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", mp4]);
    expect((await req("GET", `/projects/${pid}/overlay`)).body.stale).toEqual([KEY]);
    expect((await req("GET", `/projects/${pid}/videos`)).body[0].overlayStale).toBe(true);
    const j = await req("POST", `/projects/${pid}/overlay/rerender`, {});
    expect(j.body.jobs).toMatchObject([{ key: KEY, kind: "visual" }]);
    // bản render ghi khoá khớp cài đặt → không còn cũ
    const { overlayKey, resolveOverlay } = await import("@cvs/core");
    setVideoQa(pid, KEY, { ok: true, items: [], overlayKey: overlayKey(resolveOverlay(getProject(pid)!.settings)) });
    expect((await req("GET", `/projects/${pid}/overlay`)).body.stale).toEqual([]);
    rmSync(mp4);
  });
  it("'Dùng cho mọi dự án' → dự án mới nhận phụ đề + logo (chép file logo)", async () => {
    const a = saveAsset(pid, "logo.png", PNG);
    const r = await req("PATCH", `/projects/${pid}/overlay`, { logo: { assetId: a.id, position: "bottom-right" }, subtitle: { size: 44 }, defaults: true });
    expect(r.body.isDefault).toBe(true);
    const p2 = (await req("POST", "/projects", { name: "Mới", course: "NEW" })).body;
    expect(p2.settings.logo).toMatchObject({ assetId: a.id, position: "bottom-right" });
    expect(p2.settings.subtitle.size).toBe(44);
    expect(existsSync(join(paths.assets(p2.id), a.id))).toBe(true);
    expect((await req("PATCH", `/projects/${pid}/overlay`, { defaults: false })).body.hasDefault).toBe(false);
    const p3 = (await req("POST", "/projects", { name: "Mới 2", course: "NEW" })).body;
    expect(p3.settings.logo).toBeUndefined();
  });
});

describe("bản dịch phụ đề", () => {
  const put = (body: unknown) => req("PATCH", `/projects/${pid}/videos/${KEY}/subs`, body);
  it("kiểm ngôn ngữ, id, độ dài; số khác gốc: Claude Code → lỗi, người dùng → cảnh báo; text rỗng = xoá", async () => {
    expect((await put({ lang: "vi", translations: [{ id: "s1#0", text: "x" }] })).status).toBe(400);
    expect((await put({ lang: "xx", translations: [{ id: "s1#0", text: "x" }] })).status).toBe(400);
    expect((await put({ lang: "en", translations: [{ id: "s9#0", text: "x" }] })).body.errors[0]).toMatch(/Không có câu/);
    expect((await put({ lang: "en", translations: [{ id: "s1#0", text: "x".repeat(700) }] })).status).toBe(400);
    const bad = await put({ lang: "en", translations: [{ id: "s1#0", text: "Each credit is 2 tonnes of CO₂." }], by: "claude-code" });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0]).toMatch(/số/);
    expect(sent("s1", 0).subs).toBeUndefined();
    const ok = await put({ lang: "en", translations: [{ id: "s1#0", text: "Each credit is 2 tonnes of CO₂." }] });
    expect(ok.body).toMatchObject({ ok: true, saved: 1 });
    expect(ok.body.warnings[0]).toMatch(/số/);
    await put({ lang: "en", translations: [{ id: "s1#0", text: "  Each credit  is 1 tonne of CO₂. " }, { id: "s2#0", text: "In 2015 came the Paris Agreement." }] });
    expect(sent("s1", 0).subs).toEqual({ en: "Each credit is 1 tonne of CO₂." });
    expect(sent("s1", 0).text).toBe("Mỗi tín chỉ là 1 tấn CO₂."); // tiếng Việt giữ nguyên
    await put({ lang: "en", translations: [{ id: "s2#0", text: "" }] });
    expect(sent("s2", 0).subs).toBeUndefined();
  });
  it("VTT theo ngôn ngữ (?lang=en), có vị trí cue; ngôn ngữ lạ → 400", async () => {
    await put({ lang: "en", translations: [{ id: "s1#1", text: "Verification happens periodically." }] });
    const en = await req("GET", `/projects/${pid}/videos/${KEY}/vtt?lang=en`);
    expect(en.body).toContain("Verification happens periodically.");
    expect(en.body).not.toContain("Thẩm tra");
    expect(en.body).toMatch(/ line:\d+(\.\d)?%,(end|start) position:50%,center size:\d+% align:center/);
    expect((await req("GET", `/projects/${pid}/videos/${KEY}/vtt`)).body).toContain("Thẩm tra diễn ra định kỳ.");
    expect((await req("GET", `/projects/${pid}/videos/${KEY}/vtt?lang=klingon`)).status).toBe(400);
  });
  it("job dịch bằng Claude API: chỉ câu thiếu, ghi bản dịch, bỏ câu đã đổi lời trong lúc dịch", async () => {
    await put({ lang: "ja", translations: [{ id: "s1#0", text: "1クレジットは1トンのCO₂です。" }] });
    fake.reply = (items) => items.map((i) => ({ id: i.id, text: `JA ${i.text.match(/\d+/g)?.join(" ") ?? ""}`.trim() }));
    const r = await aiTranslateSubs(ctx() as any, KEY, "ja");
    expect(fake.calls[0].items.map((i: any) => i.id)).toEqual(["s1#1", "s2#0"]);
    expect(fake.calls[0].context).toContain("Tín chỉ carbon");
    expect(r.saved).toBe(2);
    expect(sent("s2", 0).subs?.ja).toBe("JA 2015");
    expect(getProject(pid)!.settings.subtitle!.languages).toContain("ja");
  });
});

describe("Claude Code dịch phụ đề", () => {
  it("yêu cầu cần mã ngôn ngữ; cùng video gộp ngôn ngữ; prompt + subs + set-subs qua pnpm cvs", async () => {
    expect((await req("POST", "/claude-code/requests", { projectId: pid, kind: "translate-subs", videoKey: KEY })).status).toBe(400);
    const r1 = await req("POST", "/claude-code/requests", { projectId: pid, kind: "translate-subs", videoKey: KEY, note: "en" });
    const r2 = await req("POST", "/claude-code/requests", { projectId: pid, kind: "translate-subs", videoKey: KEY, note: "ko" });
    expect(r2.body).toMatchObject({ id: r1.body.id, merged: true, note: "en ko" });
    expect(listClaudeRequests({ projectId: pid, status: "pending" }).filter((x) => x.kind === "translate-subs")).toHaveLength(1);

    const p = await cli(["prompt", "translate-subs", pid, KEY, "--lang", "ko"]);
    expect(p.code).toBe(0);
    expect(p.out).toContain("Tiếng Hàn");
    expect(p.out).toContain('"id": "s1#0"');
    expect(p.out).toMatch(/Giữ NGUYÊN mọi con số/);

    const s = await cli(["subs", pid, KEY, "--lang", "ko"]);
    expect(JSON.parse(s.out)).toEqual([{ id: "s1#0", text: "Mỗi tín chỉ là 1 tấn CO₂.", ko: null }, { id: "s1#1", text: "Thẩm tra diễn ra định kỳ.", ko: null }, { id: "s2#0", text: "Năm 2015 có Thỏa thuận Paris.", ko: null }]);

    const bad = await cli(["set-subs", pid, KEY, "ko", "f.json"], JSON.stringify({ translations: [{ id: "s2#0", text: "2016년 파리협정" }] }));
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/số trong bản dịch/);
    const good = await cli(["set-subs", pid, KEY, "ko", "f.json"], JSON.stringify({ translations: [{ id: "s2#0", text: "2015년 파리협정이 체결되었습니다." }] }));
    expect(good.code).toBe(0);
    expect(JSON.parse(good.out)).toMatchObject({ ok: true, saved: 1 });
    expect(sent("s2", 0).subs?.ko).toBe("2015년 파리협정이 체결되었습니다.");
    // đủ bản dịch → prompt báo đã xong
    await cli(["set-subs", pid, KEY, "ko", "f.json"], JSON.stringify([{ id: "s1#0", text: "크레딧 하나는 CO₂ 1톤입니다." }, { id: "s1#1", text: "검증은 정기적으로 이루어집니다." }]));
    expect((await cli(["prompt", "translate-subs", pid, KEY, "--lang", "ko"])).err).toMatch(/đã có phụ đề/);
  });
});

describe("xuất kèm phụ đề", () => {
  it("mỗi ngôn ngữ một file <mã>.<ngôn ngữ>.vtt cạnh MP4", async () => {
    await req("PATCH", `/projects/${pid}/overlay`, { subtitle: { languages: ["vi", "en"] } });
    await req("PATCH", `/projects/${pid}/videos/${KEY}/subs`, { lang: "en", translations: [{ id: "s1#0", text: "Each credit is 1 tonne of CO₂." }] });
    const mp4 = paths.render(pid, KEY);
    mkdirSync(join(mp4, ".."), { recursive: true });
    execFileSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x36:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", mp4]);
    setVideoFlags(pid, KEY, { approved: true });
    const dest = mkdtempSync(join(tmpdir(), "cvs-subs-out-"));
    const r = await exportProject(pid, { dest, extras: true });
    const dir = join(r.dir, "Cap_do_1");
    expect(readFileSync(join(dir, `${KEY}.vi.vtt`), "utf8")).toContain("Mỗi tín chỉ là 1 tấn CO₂.");
    expect(readFileSync(join(dir, `${KEY}.en.vtt`), "utf8")).toContain("Each credit is 1 tonne of CO₂.");
    expect(existsSync(join(dir, `${KEY}.vtt`))).toBe(false);
    rmSync(dest, { recursive: true, force: true });
  });
});
