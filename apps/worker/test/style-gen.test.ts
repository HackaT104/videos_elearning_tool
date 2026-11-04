// Tạo phong cách bằng AI: tải video mẫu (trích khung ffmpeg), ảnh tham chiếu, đề bài, job "style-gen" (Claude giả lập, kiểm ảnh gửi đi),
// lệnh Claude Code (style-refs, prompt style-gen, set-theme), job dựng ảnh xem trước, getTheme tra phong cách tuỳ chỉnh, chọn/chỉnh/xoá/thư viện.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ calls: [] as { input: any; images: { file: string; label: string }[] }[], reply: null as unknown }));
vi.mock("@cvs/ai", async (orig) => {
  const m = await orig<typeof import("@cvs/ai")>();
  return {
    ...m,
    aiAvailable: () => false,
    generateStyle: async (input: never, images: never) => {
      ai.calls.push({ input, images });
      return ai.reply;
    },
  };
});

const storage = mkdtempSync(join(tmpdir(), "cvs-sg-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, getProject, listJobs, upsertVideo, paths } = await import("@cvs/db");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { forgetCustomTheme, getTheme, contrastRatio } = await import("@cvs/themes");
const { listStylePreviews, pickFrameTimes, runStyleGen, stylePreview } = await import("@cvs/studio");
const { main } = await import("../../../scripts/cvs");

const KEY = "SG-L1_V1";
const norm = createNormalizer();
let pid = "";
const req = (path: string, init?: RequestInit & { json?: unknown }) =>
  app.request(`/api${path}`, init?.json !== undefined ? { ...init, body: JSON.stringify(init.json), headers: { "content-type": "application/json" } } : init);
const run = async (...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    base: "http://cvs.test/api",
    fetch: (async (u: string, init?: RequestInit) => app.request(String(u), init)) as typeof fetch,
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    readFile: (p) => readFileSync(p, "utf8"),
    sleep: async () => {},
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
};
const theme = (o: Record<string, unknown> = {}) => ({
  theme: {
    name: "Giấy kraft ấm",
    description: "Nền giấy kraft, chữ nâu đậm, nhấn cam đất.",
    colors: { bg: "#E9DCC4", bg2: "#DFCFB2", bg3: "#F3EADA", grid: "#D6C4A3", ink: "#2E2216", inkSoft: "#5E4B37", accent: "#E07B39", alt: "#2F6B6B", money: "#7A5A12", warn: "#A8322A", card: "#F3EADA", cardBorder: "#C9B38D", line: "#2E2216", highlight: "#F2C48D" },
    fontPair: "viet-tay",
    card: "sketch",
    ground: "custom",
    groundSpec: { pattern: "lines", patternOpacity: 0.07, patternSize: 44, noise: 0.18 },
    radius: 12,
    stroke: 3,
    motion: { enterEase: "back.out(1.3)", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.9, slowEnterEase: "sine.out", slowEnterDur: 1.1, rise: 26, camera: 0.012 },
    kickerUpper: false,
    ...o,
  },
  rationale: "Nền kraft lấy từ ảnh 1; cam đất từ khung video.",
  closest: "am-moc",
});
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

beforeAll(() => {
  pid = createProject("Phong cách AI", "SG", ["L1"]).id;
  upsertVideo(pid, {
    key: KEY, course: "SG", level: "L1", module: "", unit: "", seq: "", title: "Khoá và gắn thẻ", style: "giay-ky-thuat", engine: "hyperframes",
    voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
    scenes: [{ id: "s1", scriptStart: 0, scriptEnd: 10, title: "So sánh", visual: "So sánh hai bên", onscreen: ["Khoá", "Thẻ"], sentences: makeSentences("Khoá ngắt nguồn điện. Thẻ báo cho mọi người biết.", norm), design: { template: "split-compare", params: { title: "Khoá và thẻ", left: { label: "Khoá", icon: "search", points: [{ text: "Ngắt nguồn điện" }] }, right: { label: "Thẻ", icon: "magnifier", points: [{ text: "Báo cho mọi người" }] } }, by: "user" } }],
  } as any);
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("chọn mốc khung", () => {
  it("ưu tiên chuyển cảnh, bù mốc chia đều, cách nhau đủ xa", () => {
    expect(pickFrameTimes(8, [], 8)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
    const t = pickFrameTimes(60, [10, 10.2, 30, 45], 6);
    expect(t).toHaveLength(6);
    expect(t).toEqual(expect.arrayContaining([10.3, 30.3, 45.3]));
    expect(pickFrameTimes(100, Array.from({ length: 40 }, (_, i) => i * 2.5), 8)).toHaveLength(8);
  });
});

let vid = "";
let imgs: string[] = [];
describe("tư liệu tham chiếu", () => {
  it("video mẫu (testsrc + smptebars) → lưu theo luồng, 8 khung 960 px; từ chối đuôi lạ / không phải video", async () => {
    const d = mkdtempSync(join(tmpdir(), "cvs-sgv-"));
    const f = join(d, "mau.mp4");
    ff(["-f", "lavfi", "-i", "testsrc=duration=5:size=640x360:rate=25", "-f", "lavfi", "-i", "smptebars=duration=5:size=640x360:rate=25", "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-pix_fmt", "yuv420p", f]);
    const r = await req(`/projects/${pid}/style-refs/video`, { method: "POST", body: readFileSync(f), headers: { "x-file-name": encodeURIComponent("Video mẫu.mp4"), "content-type": "video/mp4" } });
    const v = await r.json();
    expect(r.status).toBe(200);
    expect(v).toMatchObject({ name: "Video mẫu.mp4", duration: 10 });
    expect(v.frames).toHaveLength(8);
    // có một khung ngay sau lần chuyển cảnh ở giây 5
    expect(v.frames.some((x: any) => x.t > 5 && x.t < 5.6)).toBe(true);
    const w = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width", "-of", "csv=p=0", v.frames[0].file]).toString().trim();
    expect(w).toBe("960");
    vid = v.id;
    // cùng nội dung → cùng mã
    expect((await (await req(`/projects/${pid}/style-refs/video`, { method: "POST", body: readFileSync(f), headers: { "x-file-name": "lai.mp4" } })).json()).id).toBe(vid);
    expect((await req(`/projects/${pid}/style-refs/video`, { method: "POST", body: "abc", headers: { "x-file-name": "a.exe" } })).status).toBe(400);
    expect((await (await req(`/projects/${pid}/style-refs/video`, { method: "POST", body: "khong phai video", headers: { "x-file-name": "a.mp4" } })).json()).error).toMatch(/Không đọc được video/);
  });

  it("ảnh tham chiếu (tải như ảnh dự án) + đề bài: kiểm số ảnh, loại ảnh, cần mô tả hoặc tư liệu", async () => {
    const d = mkdtempSync(join(tmpdir(), "cvs-sgi-"));
    for (const [i, src] of ["color=c=0xE9DCC4:s=1600x900", "color=c=0xE07B39:s=800x800"].entries()) {
      ff(["-f", "lavfi", "-i", src, "-frames:v", "1", join(d, `${i}.png`)]);
      const fd = new FormData();
      fd.append("file", new Blob([readFileSync(join(d, `${i}.png`))]), `tham-chieu-${i}.png`);
      imgs.push((await (await req(`/projects/${pid}/assets`, { method: "POST", body: fd })).json()).id);
    }
    const bad = async (b: unknown) => (await (await req(`/projects/${pid}/style-gen`, { method: "POST", json: b })).json()).error;
    expect(await bad({})).toMatch(/Cần mô tả/);
    expect(await bad({ prompt: "x", images: Array(7).fill(imgs[0]) .map((x, i) => x + i) })).toMatch(/Tối đa 6/);
    expect(await bad({ prompt: "x", images: ["khong-co"] })).toMatch(/Không có ảnh/);
    expect(await bad({ prompt: "x", video: "0123456789abcdef" })).toMatch(/video tham chiếu/);
    // Claude Code: chưa có đề bài → không nhận yêu cầu
    expect((await req("/claude-code/requests", { method: "POST", json: { projectId: pid, kind: "style-gen", note: "x" } })).status).toBe(400);
    const r = await req(`/projects/${pid}/style-gen`, { method: "POST", json: { prompt: "Giấy kraft ấm, chữ viết tay, thân thiện", images: imgs, video: vid, mode: "api" } });
    const j = await r.json();
    expect(j.brief).toMatchObject({ images: imgs, video: vid, base: null });
    expect(j.job).toMatchObject({ kind: "style-gen", status: "queued" });
    // bấm lại khi job còn chờ → không tạo thêm
    expect((await (await req(`/projects/${pid}/style-gen`, { method: "POST", json: { prompt: "Giấy kraft ấm, chữ viết tay, thân thiện", images: imgs, video: vid, mode: "api" } })).json()).job.id).toBe(j.job.id);
  });
});

let apiId = "";
describe("job style-gen (Claude API giả lập)", () => {
  it("gửi 2 ảnh + 8 khung kèm nhãn, lưu phong cách, dựng ảnh xem trước; getTheme đọc từ đĩa", async () => {
    ai.reply = theme({ colors: { ...theme().theme.colors, accent: "#F2A66B" } }); // cam nhạt: thiếu tương phản → tự chỉnh
    const prog: string[] = [];
    const r = await runStyleGen(pid, (_p, m) => prog.push(m));
    const call = ai.calls[0];
    expect(call.images).toHaveLength(10);
    expect(call.images[0].label).toBe("Ảnh tham chiếu 1: tham-chieu-0.png");
    expect(call.images[2].label).toMatch(/^Khung 1 của video mẫu «Video mẫu.mp4» \(giây [\d.]+\)$/);
    expect(call.images.every((x) => existsSync(x.file))).toBe(true);
    expect(call.images[0].file).toMatch(/style-refs[/\\]img[/\\].+\.jpg$/); // ảnh thu nhỏ cho API
    expect(call.input).toMatchObject({ prompt: "Giấy kraft ấm, chữ viết tay, thân thiện", images: 2, frames: 8, subject: { project: "Phong cách AI", videoTitle: "Khoá và gắn thẻ", scene: { title: "So sánh" } } });
    expect(r.id).toMatch(/^tuy-chinh-giay-kraft-am-[a-f0-9]{6}$/);
    expect(r.adjustments.map((a: any) => a.field)).toContain("colors.accent");
    expect(existsSync(r.preview!)).toBe(true);
    expect(listStylePreviews(pid)!.styles.map((s) => s.style)).toContain(r.id);
    expect(prog.join("\n")).toMatch(/10 ảnh tham chiếu/);
    apiId = r.id;
    forgetCustomTheme(apiId); // như worker vừa khởi động lại
    const t = getTheme(apiId);
    expect(t.name).toBe("Giấy kraft ấm");
    expect(t.fonts.display.family).toBe("Patrick Hand");
    expect(contrastRatio(t.colors.accent, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
    const list = await (await req(`/projects/${pid}/themes`)).json();
    expect(list.project[0]).toMatchObject({ id: apiId, by: "ai", closest: "am-moc", prompt: "Giấy kraft ấm, chữ viết tay, thân thiện" });
    expect(list.brief.last).toBe(apiId);
  }, 120_000);
});

describe("Claude Code: pnpm cvs style-refs / prompt style-gen / set-theme", () => {
  let ccId = "";
  it("style-refs in đường dẫn tuyệt đối; prompt giống đường API", async () => {
    const r = await run("style-refs", pid);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.images).toHaveLength(2);
    expect(j.videoFrames).toHaveLength(8);
    for (const x of [...j.images, ...j.videoFrames]) expect(existsSync(x.path) && x.path.startsWith(storage)).toBe(true);
    const p = await run("prompt", "style-gen", pid);
    expect(p.code).toBe(0);
    expect(p.out).toContain("===== SYSTEM =====");
    expect(p.out).toContain("Giấy kraft ấm, chữ viết tay");
    expect(p.out).toContain("2 ảnh người dùng tải lên + 8 khung hình");
  });

  it("set-theme: từ chối CSS/khoá lạ; hợp lệ → lưu + xếp job ảnh xem trước", async () => {
    let r = await run("set-theme", pid, JSON.stringify(theme({ css: "body{background:url(x)}" })));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Khoá "css"/);
    r = await run("set-theme", pid, JSON.stringify({ ...theme(), closest: "khong-co" }));
    expect(r.err).toMatch(/closest/);
    r = await run("set-theme", pid, JSON.stringify(theme({ name: "Kraft Claude Code" })));
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j).toMatchObject({ ok: true, name: "Kraft Claude Code" });
    ccId = j.id;
    const job = listJobs(pid, 20).find((x) => x.id === j.previewJob)!;
    expect(job).toMatchObject({ kind: "theme-preview", video_key: KEY, payload: { styles: [ccId] } });
    // yêu cầu Claude Code nhận được khi đã có đề bài
    expect((await req("/claude-code/requests", { method: "POST", json: { projectId: pid, kind: "style-gen", note: "Giấy kraft" } })).status).toBe(200);
  });

  it("job dựng ảnh xem trước (như worker chạy theme-preview với styles)", async () => {
    const shots = await stylePreview(pid, KEY, undefined, [ccId]);
    expect(shots).toEqual([{ style: ccId, file: join(paths.project(pid), "styles", KEY, `${ccId}.png`) }]);
    expect(existsSync(shots[0].file)).toBe(true);
  }, 120_000);

  it("chỉnh tay, dùng cho dự án, không xoá được khi đang dùng, thư viện", async () => {
    let r = await req(`/projects/${pid}/themes/${ccId}`, { method: "PATCH", json: { colors: { accent: "#FFE0C0" }, fontPair: "lexend" } });
    let j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.record.by).toBe("user");
    expect(j.record.theme.fonts.display.family).toBe("Lexend");
    expect(j.record.adjustments.map((a: any) => a.field)).toContain("colors.accent");
    expect((await req(`/projects/${pid}/themes/${ccId}`, { method: "PATCH", json: { colors: { accent: "url(javascript:1)" } } })).status).toBe(400);
    expect((await req(`/projects/${pid}/themes/${ccId}`, { method: "PATCH", json: { fontPair: "comic-sans" } })).status).toBe(400);

    expect((await req(`/projects/${pid}`, { method: "PATCH", json: { settings: { style: "tuy-chinh-khong-co-1" } } })).status).toBe(400);
    expect((await req(`/projects/${pid}`, { method: "PATCH", json: { settings: { style: "<script>" } } })).status).toBe(400);
    r = await req(`/projects/${pid}`, { method: "PATCH", json: { settings: { style: ccId, styleConfirmed: true }, applyToVideos: true } });
    expect(r.status).toBe(200);
    expect(getProject(pid)!.settings.style).toBe(ccId);
    expect((await (await req(`/projects/${pid}/videos/${KEY}`)).json()).data.style).toBe(ccId);
    j = await (await req(`/projects/${pid}/themes/${ccId}`, { method: "DELETE" })).json();
    expect(j.error).toMatch(/đang được dùng/);

    // thư viện: lưu → dự án khác chọn được (chép vào dự án đó) → xoá khỏi thư viện không làm hỏng
    expect((await req(`/projects/${pid}/themes/${ccId}/library`, { method: "POST" })).status).toBe(200);
    const other = createProject("Dự án khác", "OT", ["L1"]).id;
    const lib = await (await req(`/projects/${other}/themes`)).json();
    expect(lib.library.map((x: any) => x.id)).toEqual([ccId]);
    expect((await req(`/projects/${other}`, { method: "PATCH", json: { settings: { style: ccId } } })).status).toBe(200);
    expect((await req(`/projects/${pid}/themes/${ccId}?from=library`, { method: "DELETE" })).status).toBe(200);
    expect((await (await req(`/projects/${other}/themes`)).json()).project.map((x: any) => x.id)).toEqual([ccId]);

    // phong cách không dùng → xoá được, ảnh xem trước của nó cũng bị xoá
    const prevFile = listStylePreviews(pid)!.styles.find((s) => s.style === apiId)!.file;
    expect((await req(`/projects/${pid}/themes/${apiId}`, { method: "DELETE" })).status).toBe(200);
    expect(existsSync(prevFile)).toBe(false);
    forgetCustomTheme(apiId);
    expect(getTheme(apiId).id).toBe("giay-ky-thuat");
  });
});
