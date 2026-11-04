// Kết nối Claude Desktop: gộp mục mcpServers (sao lưu, giữ máy chủ khác), gỡ, tệp hỏng không bị ghi đè, chỉ từ chính máy này.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-cd-"));
process.env.CVS_STORAGE = storage;
const cfgDir = join(storage, "Claude");
const cfgFile = join(cfgDir, "claude_desktop_config.json");
process.env.CVS_CLAUDE_DESKTOP_CONFIG = cfgFile;
const { app } = await import("../src/api");
const cd = await import("../src/claude-desktop");
afterAll(() => {
  delete process.env.CVS_CLAUDE_DESKTOP_CONFIG;
  rmSync(storage, { recursive: true, force: true });
});

const read = () => JSON.parse(readFileSync(cfgFile, "utf8"));
const local = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
const post = (path: string, headers: Record<string, string> = {}, env: object = local) =>
  app.request(`/api/claude-desktop/${path}`, { method: "POST", headers: { "content-type": "application/json", host: "127.0.0.1:3001", ...headers }, body: "{}" }, env);

describe("cấu hình Claude Desktop", () => {
  it("đường dẫn theo hệ điều hành; bản Store (MSIX) được ghi thêm", () => {
    const env = { APPDATA: "C:\\U\\AppData\\Roaming", LOCALAPPDATA: join(storage, "Local") };
    mkdirSync(join(storage, "Local", "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude"), { recursive: true });
    const w = cd.configPaths(env, "win32", "C:\\U");
    expect(w[0]).toBe(join("C:\\U\\AppData\\Roaming", "Claude", "claude_desktop_config.json"));
    expect(w[1]).toContain(join("Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
    expect(cd.configPaths({}, "darwin", "/Users/a")).toEqual(["/Users/a/Library/Application Support/Claude/claude_desktop_config.json"]);
  });

  it("lệnh MCP: node đang chạy + bản dựng nếu có, không thì tsx + mã nguồn; CVS_API theo cổng worker", () => {
    const root = join(storage, "root");
    mkdirSync(join(root, "apps", "worker"), { recursive: true });
    writeFileSync(join(root, "apps", "worker", "package.json"), "{}");
    const e = cd.mcpEntry(join(import.meta.dirname, "..", "..", ".."), { CVS_API_PORT: "4001" }, "/opt/node");
    expect(e.command).toBe("/opt/node");
    expect(e.env).toEqual({ CVS_API: "http://127.0.0.1:4001/api" });
    expect(e.args.at(-1)).toMatch(/apps[\\/]mcp[\\/](dist[\\/]cvs-mcp\.mjs|src[\\/]index\.ts)$/);
    mkdirSync(join(root, "apps", "mcp", "dist"), { recursive: true });
    writeFileSync(join(root, "apps", "mcp", "dist", "cvs-mcp.mjs"), "");
    expect(cd.mcpEntry(root, {}, "node").args).toEqual([join(root, "apps", "mcp", "dist", "cvs-mcp.mjs")]);
  });

  it("kết nối: sao lưu, gộp vào mcpServers, giữ máy chủ + khoá khác; gỡ chỉ bỏ mục của ứng dụng", () => {
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(cfgFile, "\uFEFF" + JSON.stringify({ globalShortcut: "Ctrl+Space", mcpServers: { files: { command: "npx", args: ["fs"] } } }));
    const entry = { command: "node", args: ["/x/cvs-mcp.mjs"], env: { CVS_API: "http://127.0.0.1:3001/api" } };
    const [r] = cd.connectDesktop(entry, [cfgFile]);
    expect(r.backup && JSON.parse(readFileSync(r.backup, "utf8").replace(/^\uFEFF/, "")).mcpServers.files).toBeTruthy();
    expect(read()).toEqual({ globalShortcut: "Ctrl+Space", mcpServers: { files: { command: "npx", args: ["fs"] }, "course-video-studio": entry } });
    cd.connectDesktop(entry, [cfgFile]); // lần hai: thay mục cũ, không nhân đôi
    expect(Object.keys(read().mcpServers)).toEqual(["files", "course-video-studio"]);
    expect(cd.desktopStatus(entry, [cfgFile])).toMatchObject({ connected: true, upToDate: true, files: [{ apiOk: true }] });
    expect(cd.desktopStatus({ ...entry, args: ["/khac.mjs"] }, [cfgFile]).upToDate).toBe(false);
    expect(cd.disconnectDesktop([cfgFile])).toHaveLength(1);
    expect(read()).toEqual({ globalShortcut: "Ctrl+Space", mcpServers: { files: { command: "npx", args: ["fs"] } } });
    expect(cd.disconnectDesktop([cfgFile])).toEqual([]); // không còn gì để gỡ → không ghi
    expect(readdirSync(cfgDir).filter((f) => f.includes(".bak-")).length).toBeGreaterThanOrEqual(3);
  });

  it("chưa có tệp → tạo mới; tệp hỏng → báo lỗi, không ghi đè", () => {
    const fresh = join(storage, "moi", "Claude", "claude_desktop_config.json");
    expect(cd.connectDesktop(undefined, [fresh])[0].backup).toBeNull();
    expect(Object.keys(JSON.parse(readFileSync(fresh, "utf8")).mcpServers)).toEqual(["course-video-studio"]);
    const broken = join(storage, "hong.json");
    writeFileSync(broken, "{ mcpServers: ");
    expect(() => cd.connectDesktop(undefined, [fresh, broken])).toThrow(/không phải JSON/);
    expect(readFileSync(broken, "utf8")).toBe("{ mcpServers: ");
    expect(existsSync(`${broken}.tmp-${process.pid}`)).toBe(false);
  });

  it("API: chỉ từ chính máy này; kết nối/trạng thái/gỡ; tệp hỏng → 400", async () => {
    expect((await post("connect", {}, { incoming: { socket: { remoteAddress: "192.168.1.20" } } })).status).toBe(403);
    expect((await post("status", { "x-forwarded-host": "192.168.1.5:3000" })).status).toBe(403);
    expect((await post("connect", { origin: "http://evil.example" })).status).toBe(403);
    expect((await app.request("/api/claude-desktop/status", { method: "POST", headers: { "content-type": "text/plain", host: "127.0.0.1:3001" }, body: "{}" }, local)).status).toBe(403);
    const c = await (await post("connect")).json();
    expect(c.status).toMatchObject({ connected: true, upToDate: true, workerOk: true, prompt: "Xử lý các yêu cầu đang chờ của Course Video Studio" });
    expect(read().mcpServers["course-video-studio"].command).toBe(process.execPath);
    expect((await (await post("disconnect")).json()).status.connected).toBe(false);
    writeFileSync(cfgFile, "không phải json");
    const bad = await post("connect");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/không phải JSON/);
  });
});
