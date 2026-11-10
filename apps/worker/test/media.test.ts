// Nhạc nền (API), ảnh miễn phí (tìm/nhập với fetch giả), ghi nguồn khi xuất, nhật ký quyết định qua set-design – trên thư mục lưu trữ tạm.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-media-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, getProject, getVideo, paths, setVideoFlags, setVideoQa, upsertVideo } = await import("@cvs/db");
const { parseInputFile } = await import("@cvs/core");
const { FFMPEG } = await import("@cvs/tts");
const studio = await import("@cvs/studio");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwyBDAA4+wf5Ia2bXQAAAABJRU5ErkJggg==", "base64");
let pid = "";
let key = "";
const tone = join(storage, "tone.wav");

beforeAll(async () => {
  pid = createProject("Dự án media", "MED", ["L1"]).id;
  const r = await parseInputFile("Kich_ban_L1.docx", readFileSync(new URL("../../../fixtures/Kich_ban_L1.docx", import.meta.url)), { course: "MED", level: "L1" } as never);
  const v = r.videos[0];
  key = v.key;
  upsertVideo(pid, v);
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=330:d=2", tone]);
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

const json = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("nhạc nền", () => {
  it("tải lên (kiểm chữ ký), chọn, kẹp mức, chặn đường dẫn thư viện ra ngoài, video đã render cần trộn lại", async () => {
    const fd = new FormData();
    fd.append("file", new File([readFileSync(tone)], "nhac nen.wav"));
    const up = await app.request(`/api/projects/${pid}/music`, { method: "POST", body: fd });
    expect(up.status).toBe(200);
    const item = await up.json();
    expect(item).toMatchObject({ source: "project", name: "nhac nen.wav" });
    expect(item.id).toMatch(/^[a-f0-9]{24}\.wav$/);
    const bad = new FormData();
    bad.append("file", new File([PNG], "x.mp3"));
    expect((await app.request(`/api/projects/${pid}/music`, { method: "POST", body: bad })).status).toBe(400);

    expect((await json("PATCH", `/projects/${pid}/music`, { music: { source: "library", file: "../studio.db" } })).status).toBe(400);
    const r = await (await json("PATCH", `/projects/${pid}/music`, { music: { source: "project", file: item.id, volumeDb: -99, license: "  CC0  " } })).json();
    expect(r.music).toEqual({ file: item.id, source: "project", volumeDb: -40, duck: true, fadeIn: 1, fadeOut: 1, license: "CC0" });
    expect(r.libraryDir).toBe(join(storage, "am-nhac"));

    // bản render có khoá trộn tiếng cũ → cần trộn lại; khoá đúng → không
    mkdirSync(dirname(paths.render(pid, key)), { recursive: true });
    writeFileSync(paths.render(pid, key), "x");
    setVideoQa(pid, key, { ok: true, items: [], audioKey: "cu" });
    expect((await (await json("GET", `/projects/${pid}/music`)).json()).stale).toEqual([key]);
    setVideoQa(pid, key, { ok: true, items: [], audioKey: studio.audioKey(pid, getProject(pid)!.settings.music) });
    expect((await (await json("GET", `/projects/${pid}/music`)).json()).stale).toEqual([]);
    expect((await (await json("PATCH", `/projects/${pid}/music`, { music: null })).json()).music).toBeNull();
  });
});

// ---------- ảnh miễn phí: fetch giả trả mẫu đúng dạng API thật ----------
const OV_ID = "4bc43a04-ef46-4544-a0c1-63c63f56e276";
const ovResult = (license: string, extra: object = {}) => ({
  id: OV_ID, title: "Rừng thông", url: "https://live.staticflickr.com/1/rung.jpg", thumbnail: `https://api.openverse.org/v1/images/${OV_ID}/thumb/`,
  creator: "Nguyễn A", license, license_version: "4.0", license_url: `https://creativecommons.org/licenses/${license}/4.0/`, foreign_landing_url: "https://www.flickr.com/photos/a/1",
  filetype: "jpg", width: 1600, height: 900, ...extra,
});
const wmPage = (pageid: number, short: string, mime = "image/jpeg") => ({
  pageid, title: `File:Cay ${pageid}.jpg`, index: pageid,
  imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/Cay_${pageid}.jpg`, thumburl: `https://upload.wikimedia.org/thumb/Cay_${pageid}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:Cay_${pageid}.jpg`, width: 4000, height: 3000, mime,
    extmetadata: { LicenseShortName: { value: short }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" }, Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:B">Trần B</a>' }, ObjectName: { value: "Cây xanh" } } }],
});
const calls: { url: string; headers: Record<string, string> }[] = [];
const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://api.openverse.org/v1/images/?")) return ok({ results: [ovResult("by"), ovResult("by-nc"), ovResult("cc0", { id: "11111111-2222-3333-4444-555555555555", filetype: "gif" })] });
  if (url === `https://api.openverse.org/v1/images/${OV_ID}/`) return ok(ovResult("by-sa"));
  if (url.startsWith("https://commons.wikimedia.org/w/api.php") && url.includes("generator=search")) return ok({ query: { pages: [wmPage(2, "CC BY-SA 4.0"), wmPage(1, "Public domain"), wmPage(3, "GFDL"), wmPage(4, "CC BY-NC 2.0")] } });
  if (url.startsWith("https://commons.wikimedia.org/w/api.php")) return ok({ query: { pages: [wmPage(2, "CC BY-SA 4.0")] } });
  if (url.startsWith("https://live.staticflickr.com/") || url.startsWith("https://upload.wikimedia.org/")) return new Response(PNG, { status: 200 });
  return new Response("không có", { status: 404 });
}) as typeof fetch;

describe("ảnh miễn phí có ghi nguồn", () => {
  it("tìm Openverse + Wikimedia: chỉ giấy phép dùng thương mại, User-Agent không có email, chưa có khoá Pexels thì bỏ Pexels", async () => {
    const r = await studio.searchStock("rừng", { fetch: fakeFetch });
    expect(r.sources).toEqual(["openverse", "wikimedia"]);
    expect(r.errors).toEqual([]);
    expect(r.results.map((x) => `${x.source}:${x.license}`)).toEqual(["openverse:CC BY", "wikimedia:PDM", "wikimedia:CC BY-SA"]);
    const wm = r.results.find((x) => x.license === "CC BY-SA")!;
    expect(wm).toMatchObject({ creator: "Trần B", licenseName: "CC BY-SA 4.0", title: "Cây xanh", url: "https://commons.wikimedia.org/wiki/File:Cay_2.jpg" });
    for (const c of calls) expect(c.headers["User-Agent"]).toMatch(/^CourseVideoStudio\/\d+\.\d+\.\d+$/);
    expect(calls.find((c) => c.url.includes("openverse"))!.url).toContain("license=cc0%2Cpdm%2Cby%2Cby-sa");
    await expect(studio.searchStock("  ", { fetch: fakeFetch })).rejects.toThrow("Nhập từ khoá");
  });

  it("lỗi một nguồn không làm hỏng nguồn kia; 429 → thông báo đợi", async () => {
    const f = (async (u: string | URL) => (String(u).includes("openverse") ? new Response("", { status: 429 }) : fakeFetch(u))) as typeof fetch;
    const r = await studio.searchStock("cây xanh", { fetch: f });
    expect(r.errors[0]).toMatch(/^Openverse: .*giới hạn/);
    expect(r.results.length).toBe(2);
  });

  it("nhập ảnh: hỏi lại nguồn theo mã, lưu ghi công; mã lạ bị chặn; khoá Pexels không trả về trình duyệt", async () => {
    const a = await studio.importStock(pid, "openverse", OV_ID, fakeFetch);
    expect(a.credit).toEqual({ source: "openverse", title: "Rừng thông", creator: "Nguyễn A", license: "CC BY-SA", licenseName: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", url: "https://www.flickr.com/photos/a/1" });
    const list = await (await json("GET", `/projects/${pid}/assets`)).json();
    expect(list[0].credit.creator).toBe("Nguyễn A");
    await expect(studio.importStock(pid, "openverse", "../../x", fakeFetch)).rejects.toThrow("không hợp lệ");
    expect((await json("POST", `/projects/${pid}/stock/import`, { source: "pexels", id: "123" })).status).toBe(400); // chưa có khoá
    expect((await json("PUT", "/stock/settings", { pexelsKey: "abc def" })).status).toBe(400);
    expect(await (await json("PUT", "/stock/settings", { pexelsKey: "A".repeat(56) })).json()).toEqual({ pexels: true });
    const st = await (await json("GET", "/stock/settings")).json();
    expect(JSON.stringify(st)).not.toContain("AAAA");
    expect((await json("PUT", "/stock/settings", { pexelsKey: null })).status).toBe(200);
  });

  it("dựng cảnh: dòng ghi nguồn tự thêm cho ảnh CC BY-SA; xuất: credits.txt + mục Nguồn ảnh trong danh mục", async () => {
    const asset = studio.listAssets(pid)[0];
    const row = getVideo(pid, key)!;
    const v = row.data;
    v.scenes[0].design = { template: "image-focus", params: { image: asset.id, credit: "giả mạo" }, by: "user" };
    upsertVideo(pid, v);
    const built = studio.withImageCredits(pid, v);
    expect(built.scenes[0].design!.params.credit).toBe("Ảnh: Nguyễn A · CC BY-SA 4.0 · Openverse");
    expect(v.scenes[0].design!.params.credit).toBe("giả mạo"); // không sửa video gốc
    const { buildSceneSpec } = await import("@cvs/engine");
    const spec = buildSceneSpec(built, built.scenes[0]);
    expect(spec.html).toContain('class="abs credit-line t"');
    expect(spec.texts.join(" ")).not.toContain("Ảnh: Nguyễn A"); // không tính là chữ kịch bản

    execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x180:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", paths.render(pid, key)]);
    setVideoFlags(pid, key, { approved: true });
    const r = await studio.exportProject(pid, {});
    const dir = dirname(r.files[0]);
    const credits = readFileSync(join(dir, `${key}.credits.txt`), "utf8");
    expect(credits).toContain("s1: «Rừng thông» – Nguyễn A – CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) – chia sẻ tương tự");
    expect(credits).toContain("Openverse: https://www.flickr.com/photos/a/1");
    const cat = readFileSync(r.catalog, "utf8");
    expect(cat).toContain("\r\nNguồn ảnh và nhạc\r\n");
    expect(cat).toContain(`${key} s1: «Rừng thông» – Nguyễn A`);
  });
});

describe("nhật ký quyết định qua Claude Code (set-design)", () => {
  it("nhận alternatives/reason/confidence, lọc template lạ; thiếu thì không có decision", async () => {
    const tc = { title: getVideo(pid, key)!.data.title }; // tên video: chữ có trong kịch bản
    const ok = await json("PATCH", `/projects/${pid}/videos/${encodeURIComponent(key)}/scenes/s1`, { design: { template: "title-card", params: tc, decision: { alternatives: ["kinetic-statement", "khong-co"], reason: "Cảnh mở đầu cần tiêu đề", confidence: 0.7 } }, by: "ai" });
    expect(ok.status).toBe(200);
    expect(getVideo(pid, key)!.data.scenes[0].design!.decision).toEqual({ template: "title-card", alternatives: ["kinetic-statement"], reason: "Cảnh mở đầu cần tiêu đề", confidence: 0.7, by: "claude-code" });
    await json("PATCH", `/projects/${pid}/videos/${encodeURIComponent(key)}/scenes/s1`, { design: { template: "title-card", params: tc }, by: "ai" });
    expect(getVideo(pid, key)!.data.scenes[0].design).not.toHaveProperty("decision");
  });
});
