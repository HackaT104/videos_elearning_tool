// Cập nhật bản cài + thoát ứng dụng: so phiên bản, đọc latest.json, hỏi GitHub (fetch giả: repo riêng tư 404, header mã truy cập),
// tải Setup.exe kiểm SHA-256, API thoát chỉ nhận yêu cầu từ chính máy.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-upd-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const upd = await import("../src/update");
const desktop = await import("../src/desktop");
afterAll(() => rmSync(storage, { recursive: true, force: true }));

const SETUP = Buffer.from("MZ giả lập bộ cài");
const SHA = createHash("sha256").update(SETUP).digest("hex");
const latest = (over: object = {}) => ({ version: "9.1.0", url: "https://github.com/o/r/releases/download/v9.1.0/Course-Video-Studio-Setup-9.1.0.exe", sha256: SHA, notes: "Sửa lỗi", ...over });

/** GitHub giả: ghi lại header từng yêu cầu. */
function fakeGitHub(opts: { status?: number; latestJson?: object; setup?: Buffer } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) });
    if (u.endsWith("/releases/latest")) {
      if (opts.status) return new Response("{}", { status: opts.status });
      return Response.json({
        tag_name: "v9.1.0",
        assets: [
          { name: "latest.json", url: "https://api.github.com/repos/o/r/releases/assets/1", size: 200 },
          { name: "Course-Video-Studio-Setup-9.1.0.exe", url: "https://api.github.com/repos/o/r/releases/assets/2", size: SETUP.length },
        ],
      });
    }
    if (u.endsWith("/assets/1")) return Response.json(opts.latestJson ?? latest());
    if (u.endsWith("/assets/2")) return new Response(opts.setup ?? SETUP, { headers: { "content-length": String((opts.setup ?? SETUP).length) } });
    return new Response("không có", { status: 404 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("so phiên bản", () => {
  it("semver: số, tiền tố v, bản thử < bản chính", () => {
    expect(upd.compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(upd.compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(upd.compareVersions("1.0.0-beta.2", "1.0.0")).toBeLessThan(0);
    expect(upd.compareVersions("1.0.0-beta.10", "1.0.0-beta.2")).toBeGreaterThan(0);
    expect(upd.compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    expect(upd.compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(upd.parseVersion("1.2")).toBeNull();
  });
});

describe("latest.json", () => {
  it("đọc đúng, chuẩn hoá phiên bản và SHA", () => {
    const r = upd.parseLatestJson(JSON.stringify(latest({ version: "v9.1.0", sha256: SHA.toUpperCase() })));
    expect(r).toMatchObject({ version: "9.1.0", sha256: SHA, notes: "Sửa lỗi" });
  });
  it("từ chối thiếu SHA / sai phiên bản / không phải .exe https", () => {
    expect(() => upd.parseLatestJson(latest({ sha256: "abc" }))).toThrow(/SHA-256/);
    expect(() => upd.parseLatestJson(latest({ version: "mới" }))).toThrow(/phiên bản/);
    expect(() => upd.parseLatestJson(latest({ url: "http://x/a.exe" }))).toThrow(/Setup.exe/);
    expect(() => upd.parseLatestJson("null")).toThrow();
  });
});

describe("hỏi GitHub Releases", () => {
  it("repo riêng tư chưa có mã → 404 báo cần mã truy cập; không gửi Authorization", async () => {
    const gh = fakeGitHub({ status: 404 });
    await expect(upd.fetchLatestRelease({ repo: "o/r", fetch: gh.f })).rejects.toThrow("Repo riêng tư – cần mã truy cập");
    expect(gh.calls[0].headers.authorization).toBeUndefined();
  });
  it("có mã → gửi Bearer ở mọi yêu cầu; 401 báo mã sai", async () => {
    const gh = fakeGitHub();
    const rel = await upd.fetchLatestRelease({ repo: "o/r", token: "github_pat_ABCDEFGHIJKLMNOPQRSTUV", fetch: gh.f });
    expect(rel.info.version).toBe("9.1.0");
    expect(rel.setup.name).toBe("Course-Video-Studio-Setup-9.1.0.exe");
    expect(gh.calls.map((c) => c.headers.authorization)).toEqual(["Bearer github_pat_ABCDEFGHIJKLMNOPQRSTUV", "Bearer github_pat_ABCDEFGHIJKLMNOPQRSTUV"]);
    expect(gh.calls[1].headers.accept).toBe("application/octet-stream");
    await expect(upd.fetchLatestRelease({ repo: "o/r", token: "x".repeat(30), fetch: fakeGitHub({ status: 401 }).f })).rejects.toThrow(/không hợp lệ/);
  });
  it("tên repo lạ bị từ chối trước khi gọi mạng", async () => {
    const gh = fakeGitHub();
    await expect(upd.fetchLatestRelease({ repo: "../../x", fetch: gh.f })).rejects.toThrow(/repo/);
    expect(gh.calls).toHaveLength(0);
  });
});

describe("tải bản cài", () => {
  it("đúng SHA-256 → giữ tệp; sai → xoá và báo lỗi", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cvs-dl-"));
    const ok = fakeGitHub();
    const rel = await upd.fetchLatestRelease({ repo: "o/r", fetch: ok.f });
    const pcts: number[] = [];
    const file = await upd.downloadSetup(rel, { fetch: ok.f, dir, onProgress: (p) => pcts.push(p) });
    expect(readFileSync(file)).toEqual(SETUP);
    expect(pcts.at(-1)).toBe(100);

    const bad = fakeGitHub({ setup: Buffer.from("tệp bị sửa") });
    rmSync(file);
    await expect(upd.downloadSetup(rel, { fetch: bad.f, dir })).rejects.toThrow(/SHA-256/);
    expect(readdirSync(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("API cập nhật + cài đặt", () => {
  const local = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
  const post = (path: string, body: object, headers: Record<string, string> = {}, env: object = local) =>
    app.request(`/api${path}`, { method: "POST", headers: { "content-type": "application/json", host: "127.0.0.1:3001", ...headers }, body: JSON.stringify(body) }, env);

  it("trạng thái có phiên bản hiện tại; lưu mã không bao giờ trả lại mã", async () => {
    const st = await (await app.request("/api/update/status")).json();
    expect(st.current).toBe(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "package.json"), "utf8")).version);
    expect((await post("/update/settings", { token: "sai định dạng" })).status).toBe(400);
    const r = await post("/update/settings", { token: "github_pat_ABCDEFGHIJKLMNOPQRSTUV", autoCheck: false });
    const text = await r.text();
    expect(text).not.toContain("github_pat_");
    expect(JSON.parse(text)).toMatchObject({ hasToken: true, autoCheck: false });
    expect(existsSync(join(storage, "settings.json"))).toBe(true);
  });
  it("tự cài chỉ có ở bản cài Windows", async () => {
    const r = await post("/update/install", {});
    expect(r.status).toBe(process.platform === "win32" && process.env.CVS_DESKTOP === "1" ? 200 : 400);
  });

  it("thoát: chỉ yêu cầu từ chính máy, có JSON, không từ trang khác", async () => {
    const exit = vi.spyOn(desktop.appExit, "exit").mockImplementation((() => undefined) as never);
    expect((await post("/app/quit", {}, {}, { incoming: { socket: { remoteAddress: "192.168.1.20" } } })).status).toBe(403);
    expect((await post("/app/quit", {}, { "x-forwarded-host": "192.168.1.5:3000" })).status).toBe(403);
    expect((await post("/app/quit", {}, { origin: "http://evil.example" })).status).toBe(403);
    expect((await post("/app/quit", {}, { "x-forwarded-for": "127.0.0.1, 10.0.0.7" })).status).toBe(403);
    expect((await post("/app/quit", {}, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await app.request("/api/app/quit", { method: "POST", headers: { "content-type": "text/plain", host: "127.0.0.1:3001" }, body: "{}" }, local)).status).toBe(403);
    expect((await app.request("/api/app/quit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(403); // không rõ địa chỉ
    expect(exit).not.toHaveBeenCalled();
    const ok = await post("/app/quit", {}, { "x-forwarded-host": "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" });
    expect(ok.status).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(exit).toHaveBeenCalledWith(0);
  });
});
