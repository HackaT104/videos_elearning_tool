// Tự chạy Claude Code: tìm CLI, dựng tham số/quyền, chạy bằng CLI giả (gọi API thật qua HTTP), trạng thái yêu cầu,
// tự chạy sau khi xếp hàng, chạy nối tiếp, hết giờ. Chọn thư mục theo hệ điều hành (spawn giả) và xuất ra thư mục chọn.
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-ccr-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { serve } = await import("@hono/node-server");
const db = await import("@cvs/db");
const studio = await import("@cvs/studio");
const { createNormalizer, makeSentences } = await import("@cvs/core");
const { FFMPEG } = await import("@cvs/tts");

const bin = mkdtempSync(join(tmpdir(), "cvs-fakebin-"));
const record = join(bin, "record.json");
// CLI giả: --version, auth status, còn lại đọc prompt từ stdin, gọi API như `pnpm cvs pending` / `done`
const FAKE = `#!/usr/bin/env node
const fs = require("fs");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (a[0] === "auth") { console.log(JSON.stringify({ loggedIn: process.env.FAKE_LOGGED !== "0", authMethod: "claude.ai" })); process.exit(0); }
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", async () => {
  fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: a, stdin: input, apiKey: process.env.ANTHROPIC_API_KEY ?? null, cvsApi: process.env.CVS_API, cwd: process.cwd() }));
  const mode = process.env.FAKE_MODE || "ok";
  if (mode === "hang") return setInterval(() => {}, 1000);
  const out = (o) => console.log(JSON.stringify(o));
  out({ type: "system", subtype: "init", model: "fake", claude_code_version: "9.9.9" });
  const reqs = await (await fetch(process.env.CVS_API + "/claude-code/requests?status=pending,running")).json();
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pnpm -s cvs pending" } }] } });
  if (mode === "slow") await new Promise((r) => setTimeout(r, 400));
  const doAll = mode !== "partial";
  for (const [i, r] of reqs.entries()) {
    if (!doAll && i > 0) break;
    await fetch(process.env.CVS_API + "/claude-code/requests/" + r.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "done", message: "giả: đã làm " + r.kind }) });
  }
  out({ type: "assistant", message: { content: [{ type: "text", text: "Đã xử lý " + reqs.length + " yêu cầu" }] } });
  out({ type: "result", subtype: "success", is_error: false, result: "Xong hết" });
});
`;

let pid = "";
let server: ReturnType<typeof serve>;
const req = (path: string, body?: unknown) => app.request(`/api${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const status = (id: number) => db.getClaudeRequest(id)!.status;

beforeAll(async () => {
  writeFileSync(join(bin, "claude"), FAKE);
  chmodSync(join(bin, "claude"), 0o755);
  process.env.CVS_CLAUDE_BIN = join(bin, "claude");
  process.env.ANTHROPIC_API_KEY = "sk-ant-khong-duoc-lot";
  pid = db.createProject("Dự án: Chạy/Thử", "CR", ["L1"]).id;
  const norm = createNormalizer();
  db.upsertVideo(pid, {
    key: "CR-L1_V1", course: "CR", level: "L1", module: "", unit: "", seq: "", title: "Video thử", style: "giay-ky-thuat", engine: "hyperframes",
    voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 }, pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
    scenes: [{ id: "s1", scriptStart: 0, scriptEnd: 5, title: "Mở đầu", visual: "", onscreen: [], sentences: makeSentences("Xin chào các bạn. Hôm nay học an toàn.", norm) }],
  } as any);
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise((r) => server.once("listening", r));
  process.env.CVS_API = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
afterAll(() => {
  server?.close();
  delete process.env.ANTHROPIC_API_KEY;
  rmSync(storage, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

describe("tìm Claude Code", () => {
  it("CVS_CLAUDE_BIN, PATH giả, nơi cài mặc định trên Windows", () => {
    expect(studio.findClaudeBin({ CVS_CLAUDE_BIN: join(bin, "claude") })).toBe(join(bin, "claude"));
    expect(studio.findClaudeBin({ CVS_CLAUDE_BIN: join(bin, "khong-co") })).toBeNull();
    expect(studio.findClaudeBin({ PATH: `/khong/co:${bin}`, HOME: "/khong" }, "linux")).toBe(join(bin, "claude"));
    expect(studio.findClaudeBin({ PATH: "/khong/co", HOME: "/khong" }, "linux")).toBeNull();
    const winExists = (p: string) => /npm[\\/]claude\.cmd$/.test(p);
    expect(studio.findClaudeBin({ PATH: "C:\\Windows", USERPROFILE: "C:\\Users\\An", APPDATA: "C:\\Users\\An\\AppData\\Roaming" }, "win32", winExists)).toMatch(/npm[\\/]claude\.cmd$/);
    expect(studio.findClaudeBin({ PATH: "C:\\Tools;C:\\Windows", USERPROFILE: "C:\\U" }, "win32", (p) => p.startsWith("C:\\Tools") && p.endsWith("claude.exe"))).toMatch(/^C:\\Tools.claude\.exe$/);
  });
});

describe("tham số chạy", () => {
  it("quyền hẹp, không hỏi, không MCP, prompt không nằm trên dòng lệnh", () => {
    const a = studio.claudeRunArgs("linux");
    expect(a).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--strict-mcp-config"]));
    expect(a[a.indexOf("--tools") + 1]).toBe("Bash,Read,Glob,Grep,Write,Edit,Skill");
    expect(a[a.indexOf("--allowedTools") + 1]).toBe("Bash(pnpm cvs *),Bash(pnpm -s cvs *),Read,Glob,Grep,Skill,Edit(storage/claude-code-tmp/**)");
    expect(a.join(" ")).not.toContain("Xử lý");
    expect(a.join(" ")).not.toMatch(/WebFetch|WebSearch|bypassPermissions/);
    expect(studio.claudeRunArgs("win32").join(" ")).toContain("PowerShell(pnpm -s cvs *)");
  });
  it("Windows: npm .cmd → chạy cli.js bằng Node; không có cli.js → cmd.exe với tham số bọc ngoặc", () => {
    const args = studio.claudeRunArgs("win32");
    const viaNode = studio.claudeCommand("C:\\Users\\An\\AppData\\Roaming\\npm\\claude.cmd", args, "win32", () => true);
    expect(viaNode.shell).toBe(false);
    expect(viaNode.cmd).toBe(process.execPath);
    expect(viaNode.args[0]).toMatch(/@anthropic-ai.claude-code.cli\.js$/);
    const viaCmd = studio.claudeCommand("C:\\Program Files\\x\\claude.cmd", args, "win32", () => false);
    expect(viaCmd.shell).toBe(true);
    expect(viaCmd.cmd).toBe('"C:\\Program Files\\x\\claude.cmd"');
    expect(viaCmd.args).toContain('"Bash(pnpm cvs *),Bash(pnpm -s cvs *),PowerShell(pnpm cvs *),PowerShell(pnpm -s cvs *),Read,Glob,Grep,Skill,Edit(storage/claude-code-tmp/**)"');
    expect(() => studio.cmdQuote('a"b')).toThrow();
    expect(() => studio.cmdQuote("%PATH%")).toThrow();
    expect(studio.claudeCommand("C:\\x\\claude.exe", ["-p"], "win32")).toEqual({ cmd: "C:\\x\\claude.exe", args: ["-p"], shell: false });
  });
  it("môi trường con không có khoá API", () => {
    const e = studio.claudeEnv({ ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t", PATH: "/bin", CVS_API_PORT: "4000" });
    expect(e.ANTHROPIC_API_KEY).toBeUndefined();
    expect(e.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(e.CVS_API).toBe("http://127.0.0.1:4000/api");
  });
  it("đọc stream-json thành nhật ký", () => {
    expect(studio.describeStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pnpm -s cvs pending" } }] } }))).toBe("→ Bash: pnpm -s cvs pending");
    expect(studio.describeStreamLine(JSON.stringify({ type: "result", is_error: true, result: "hết lượt" }))).toBe("Lỗi: hết lượt");
    expect(studio.describeStreamLine(JSON.stringify({ type: "user" }))).toBeNull();
  });
});

describe("chạy bằng CLI giả", () => {
  it("trạng thái: cài rồi, đã đăng nhập, phiên bản", async () => {
    const s = await (await req("/claude-code/runner?refresh=1")).json();
    expect(s).toMatchObject({ installed: true, version: "9.9.9", loggedIn: true, running: false, auto: false });
  });

  it("chạy tay: pending → running → done; tham số đúng nguyên văn; prompt qua stdin; không lộ khoá API", async () => {
    const r1 = await (await req("/claude-code/requests", { projectId: pid, kind: "agent", videoKey: "CR-L1_V1" })).json();
    expect(r1.run).toBeNull();
    expect(status(r1.id)).toBe("pending");
    const run = await (await req("/claude-code/run", {})).json();
    expect(run).toEqual({ started: true });
    expect(status(r1.id)).toBe("running");
    const s = await (await req("/claude-code/runner")).json();
    expect(s.running).toBe(true);
    expect(s.currentRequestIds).toEqual([r1.id]);
    await studio.waitClaudeRun();
    expect(db.getClaudeRequest(r1.id)).toMatchObject({ status: "done", message: "giả: đã làm agent" });
    const rec = JSON.parse(readFileSync(record, "utf8"));
    expect(rec.argv).toEqual(studio.claudeRunArgs());
    expect(rec.stdin.trim()).toBe(studio.CC_RUN_PROMPT);
    expect(rec.apiKey).toBeNull();
    expect(rec.cvsApi).toBe(process.env.CVS_API);
    const after = await studio.claudeRunnerStatus();
    expect(after).toMatchObject({ running: false, lastResult: "done", lastError: null });
    expect(after.lastLog.join("\n")).toContain("→ Bash: pnpm -s cvs pending");
    expect(existsSync(after.logFile!)).toBe(true);
    expect(readFileSync(after.logFile!, "utf8")).toContain('"type":"result"');
  });

  it("Claude Code không đánh dấu xong → failed kèm lý do", async () => {
    process.env.FAKE_MODE = "partial";
    const a = await (await req("/claude-code/requests", { projectId: pid, kind: "fix-readings" })).json();
    const b = await (await req("/claude-code/requests", { projectId: pid, kind: "review-readings", run: true })).json();
    expect(b.run).toEqual({ started: true });
    await studio.waitClaudeRun();
    expect(status(a.id)).toBe("done");
    expect(db.getClaudeRequest(b.id)).toMatchObject({ status: "failed" });
    expect(db.getClaudeRequest(b.id)!.message).toMatch(/chưa đánh dấu xong/);
    delete process.env.FAKE_MODE;
  });

  it("tự chạy sau khi xếp hàng; yêu cầu gửi trong lúc chạy → chạy lượt nữa khi xong", async () => {
    await req("/claude-code/settings", { auto: true });
    process.env.FAKE_MODE = "slow";
    const a = await (await req("/claude-code/requests", { projectId: pid, kind: "design-video", videoKey: "CR-L1_V1" })).json();
    expect(a.run).toEqual({ started: true });
    await new Promise((r) => setTimeout(r, 150));
    const b = await (await req("/claude-code/requests", { projectId: pid, kind: "illustration", videoKey: "CR-L1_V1", sceneId: "s1" })).json();
    expect(b.run).toMatchObject({ started: false, queued: true });
    expect(status(b.id)).toBe("pending");
    await studio.waitClaudeRun();
    expect(status(a.id)).toBe("done");
    expect(status(b.id)).toBe("done");
    await req("/claude-code/settings", { auto: false });
    expect(studio.claudeCodeSettings().auto).toBe(false);
    delete process.env.FAKE_MODE;
  });

  it("hết giờ → dừng, yêu cầu failed", async () => {
    process.env.FAKE_MODE = "hang";
    const a = await (await req("/claude-code/requests", { projectId: pid, kind: "agent" })).json();
    expect(studio.startClaudeRun({ timeoutMs: 400 })).toEqual({ started: true });
    await studio.waitClaudeRun();
    expect(db.getClaudeRequest(a.id)).toMatchObject({ status: "failed" });
    expect(db.getClaudeRequest(a.id)!.message).toMatch(/Quá thời gian/);
    expect((await studio.claudeRunnerStatus()).lastResult).toBe("failed");
    delete process.env.FAKE_MODE;
  });

  it("không có yêu cầu / chưa cài", async () => {
    expect(studio.startClaudeRun()).toMatchObject({ started: false, reason: "Không có yêu cầu nào đang chờ" });
    const keep = process.env.CVS_CLAUDE_BIN;
    process.env.CVS_CLAUDE_BIN = join(bin, "khong-co");
    expect(studio.startClaudeRun()).toMatchObject({ started: false, reason: "Chưa cài Claude Code trên máy này" });
    expect((await (await req("/claude-code/runner")).json()).installed).toBe(false);
    process.env.CVS_CLAUDE_BIN = keep;
  });

  it("lệnh mở cửa sổ đăng nhập theo hệ điều hành", () => {
    const w = studio.loginTerminalCommand("C:\\Users\\An\\.local\\bin\\claude.exe", "win32")!;
    expect(w.cmd).toBe("cmd.exe");
    expect(w.args.join(" ")).toMatch(/^\/d \/c start "Claude Code" \/D ".+" cmd \/k "C:\\Users\\An\\.local\\bin\\claude\.exe"$/);
    expect(studio.loginTerminalCommand("/usr/local/bin/claude", "darwin")!.args[1]).toMatch(/^tell application "Terminal" to do script "cd '.+' && '\/usr\/local\/bin\/claude'"$/);
    expect(studio.loginTerminalCommand("/x/claude", "linux", {})).toBeNull();
    expect(studio.loginTerminalCommand("/x/claude", "linux", { DISPLAY: ":0" }, (t) => t === "xterm")).toMatchObject({ cmd: "xterm" });
  });
});

describe("chọn thư mục", () => {
  it("chọn lệnh theo hệ điều hành", () => {
    const w = studio.pickFolderCommand("win32", {}, () => false, "D:\\Video 'cũ'")!;
    expect(w.cmd).toBe("powershell.exe");
    expect(w.args).toContain("-STA");
    const ps = Buffer.from(w.args[w.args.length - 1], "base64").toString("utf16le");
    expect(ps).toContain("FolderBrowserDialog");
    expect(ps).toContain("TopMost = $true");
    expect(ps).toContain("$d.SelectedPath = 'D:\\Video ''cũ'''");
    expect(studio.pickFolderCommand("darwin", {}, () => false)!.args[1]).toMatch(/^POSIX path of \(choose folder with prompt "Chọn nơi lưu dự án"\)$/);
    expect(studio.pickFolderCommand("linux", {}, () => true)).toBeNull();
    expect(studio.pickFolderCommand("linux", { DISPLAY: ":0" }, (x) => x === "zenity")!.cmd).toBe("zenity");
    expect(studio.pickFolderCommand("linux", { WAYLAND_DISPLAY: "w" }, (x) => x === "kdialog")!.cmd).toBe("kdialog");
    expect(studio.pickFolderCommand("linux", { DISPLAY: ":0" }, () => false)).toBeNull();
  });

  it("spawn giả: chọn → {path}; huỷ → {cancelled}; không có giao diện → API báo noGui", async () => {
    const fake = (code: number, out: string, err = "") =>
      ((() => {
        const p = new EventEmitter() as any;
        p.stdout = new EventEmitter();
        p.stderr = new EventEmitter();
        p.kill = () => undefined;
        setTimeout(() => (out && p.stdout.emit("data", out), err && p.stderr.emit("data", err), p.emit("close", code)), 5);
        return p;
      }) as any);
    const keep = { PATH: process.env.PATH, DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY };
    writeFileSync(join(bin, "zenity"), "#!/bin/sh\n");
    chmodSync(join(bin, "zenity"), 0o755);
    process.env.PATH = `${bin}:${keep.PATH}`;
    process.env.DISPLAY = ":0";
    expect(await studio.pickFolder(undefined, fake(0, "/home/an/Video khoá học/\n"))).toEqual({ path: "/home/an/Video khoá học" });
    expect(await studio.pickFolder(undefined, fake(1, ""))).toEqual({ cancelled: true });
    await expect(studio.pickFolder(undefined, fake(255, "", "Gtk-WARNING: cannot open display"))).rejects.toThrow(/gõ đường dẫn/);
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    const r = await app.request("/api/pick-folder", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ noGui: true });
    Object.assign(process.env, { PATH: keep.PATH });
    if (keep.DISPLAY) process.env.DISPLAY = keep.DISPLAY;
    if (keep.WAYLAND_DISPLAY) process.env.WAYLAND_DISPLAY = keep.WAYLAND_DISPLAY;
  });
});

describe("xuất ra thư mục chọn", () => {
  it("kiểm đường dẫn; chép MP4 vào <đích>/<tên dự án>/Cap_do_N + danh mục + phụ đề; nhớ thư mục; chặn mở thư mục lạ", async () => {
    const mp4 = db.paths.render(pid, "CR-L1_V1");
    mkdirSync(join(mp4, ".."), { recursive: true });
    execFileSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x36:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", mp4]);
    db.setVideoFlags(pid, "CR-L1_V1", { approved: true });
    const exp = (body: unknown) => app.request(`/api/projects/${pid}/export`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    expect((await (await exp({ dest: "tuong-doi/abc" })).json()).error).toMatch(/đường dẫn đầy đủ/);
    expect((await (await exp({ dest: join(storage, "projects") })).json()).error).toMatch(/ngoài thư mục lưu trữ/);
    const dest = mkdtempSync(join(tmpdir(), "cvs-dest-"));
    writeFileSync(join(dest, "tep.txt"), "x");
    expect((await (await exp({ dest: join(dest, "tep.txt") })).json()).error).toMatch(/là một tệp/);
    const r = await exp({ dest: join(dest, "Mới tạo"), extras: true });
    expect(r.status).toBe(200);
    const res = await r.json();
    const dir = join(dest, "Mới tạo", "Dự án_ Chạy_Thử");
    expect(res.dir).toBe(dir);
    expect(res.files).toEqual([join(dir, "Cap_do_1", "CR-L1_V1.mp4")]);
    expect(existsSync(join(dir, "Cap_do_1", "CR-L1_V1.vi.vtt"))).toBe(true);
    expect(readFileSync(join(dir, "Cap_do_1", "CR-L1_V1.txt"), "utf8")).toContain("Xin chào các bạn.");
    const cat = readFileSync(join(dir, "DANH_MUC_VIDEO.txt"), "utf8");
    expect(cat.startsWith("\ufeffMã video\t")).toBe(true);
    expect(cat).toContain("CR-L1_V1\t0:01\tVideo thử");
    expect(db.getProject(pid)!.settings).toMatchObject({ exportDir: join(dest, "Mới tạo"), lastExport: { dir, files: 1 } });
    const open = (path: string) => app.request("/api/open-folder", { method: "POST", body: JSON.stringify({ path, projectId: pid }), headers: { "content-type": "application/json" } });
    expect((await open(dest)).status).toBe(400);
    rmSync(dest, { recursive: true, force: true });
    expect((await open(dir)).status).toBe(404); // đã xoá → không mở
  });
});

describe("lệnh pnpm riêng cho Claude Code (bản cài không có pnpm)", () => {
  it.skipIf(process.platform === "win32")("`pnpm -s cvs …` chạy scripts/cvs.ts bằng Node của ứng dụng, bỏ -s/cvs", () => {
    const dir = studio.writeCvsShim(join(storage, "shim-bin"));
    expect(readFileSync(join(dir, "pnpm.cmd"), "utf8")).toMatch(/^@echo off\r\n".+" --import "file:.+" ".+cvs\.ts" %\*\r\n$/);
    const env = studio.withShimPath({ ...process.env, CVS_API: "http://127.0.0.1:1/api" }, dir);
    let err = "";
    try {
      execFileSync("sh", ["-c", "pnpm -s cvs projects"], { env: env as NodeJS.ProcessEnv, stdio: "pipe" });
    } catch (e) {
      err = String((e as { stderr: Buffer }).stderr);
    }
    expect(err).toContain("Không kết nối được worker");
  });
});
