// Bản cài Windows: đường dẫn dữ liệu ngoài thư mục cài, biến môi trường cho worker/giao diện, cửa sổ Edge,
// gom payload (bỏ symlink → .cvs-links.json) và tạo lại liên kết khi chạy.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyStorageMove, appPaths, buildEnv, treeStats, edgeArgs, edgeCandidates, ensureLinks, readUserEnv, startUrl } from "../packaging/windows/launcher.mjs";
import { skipped, stage } from "../packaging/windows/stage.mjs";

const tmp = mkdtempSync(join(tmpdir(), "cvs-launcher-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("đường dẫn + môi trường", () => {
  const local = join(tmp, "AppData", "Local");
  const app = join(tmp, "Programs", "Course Video Studio", "app");
  const p = appPaths({ LOCALAPPDATA: local }, app, join(tmp, "Programs", "Course Video Studio", "node", "node.exe"));

  it("dữ liệu ở %LOCALAPPDATA%\\Course Video Studio, không nằm trong thư mục cài", () => {
    expect(p.data).toBe(join(local, "Course Video Studio"));
    expect(p.storage).toBe(join(local, "Course Video Studio", "storage"));
    expect(p.logFile).toBe(join(p.storage, "logs", "app.log"));
    expect(p.envFile).toBe(join(p.storage, ".env"));
    expect(p.marker).toBe(join(p.storage, ".setup-done"));
    expect(p.edgeProfile).toBe(join(p.data, "edge-profile"));
    expect(p.nodeDir).toBe(join(tmp, "Programs", "Course Video Studio", "node"));
    for (const d of [p.storage, p.runtime, p.edgeProfile]) expect(d.startsWith(app)).toBe(false);
  });

  it("biến môi trường: dữ liệu cố định, .env người dùng ghi đè máy (trừ ô trống), Node đi kèm đứng đầu Path", () => {
    const env = buildEnv({ Path: "C:\\Windows", CVS_STORAGE: "D:\\khac", ANTHROPIC_API_KEY: "máy" }, p, { CVS_STORAGE: "E:\\x", ANTHROPIC_API_KEY: "", CVS_WEB_PORT: "3100", CVS_CIT_DIR: "D:\\cit" });
    expect(env.CVS_STORAGE).toBe(p.storage);
    expect(env.CVS_DESKTOP).toBe("1");
    expect(env.ANTHROPIC_API_KEY).toBe("máy");
    expect(env.CVS_WEB_PORT).toBe("3100");
    expect(env.CVS_API_PORT).toBe("3001");
    expect(env.CVS_CIT_DIR).toBe("D:\\cit");
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(join(p.runtime, "browsers"));
    expect(env.CVS_ZEROTTS_DIR).toBe(join(p.runtime, "zerotts"));
    expect(env.TSX_TSCONFIG_PATH).toBe(join(app, "tsconfig.json"));
    expect(env.Path).toBe(`${p.nodeDir}${delimiter}C:\\Windows`);
    expect(Object.keys(env).filter((k) => k.toUpperCase() === "PATH")).toEqual(["Path"]);
  });

  it(".env người dùng: đọc được, thiếu tệp → rỗng", () => {
    writeFileSync(join(tmp, "u.env"), "# ghi chú\nCVS_LAN=1\nCVS_ACCESS_PIN=\"1234\"\n");
    expect(readUserEnv(join(tmp, "u.env"))).toEqual({ CVS_LAN: "1", CVS_ACCESS_PIN: "1234" });
    expect(readUserEnv(join(tmp, "khong-co.env"))).toEqual({});
  });

  it("lần đầu mở trang chuẩn bị; Edge chế độ ứng dụng với hồ sơ riêng", () => {
    expect(startUrl(p, "3000")).toBe("http://localhost:3000/chuan-bi");
    mkdirSync(p.storage, { recursive: true });
    writeFileSync(p.marker, "{}");
    expect(startUrl(p, "3000")).toBe("http://localhost:3000/");
    expect(edgeArgs("http://localhost:3000/", p)).toEqual(["--app=http://localhost:3000/", `--user-data-dir=${p.edgeProfile}`, "--no-first-run", "--no-default-browser-check"]);
    expect(edgeCandidates({ "ProgramFiles(x86)": "C:\\PF86", LOCALAPPDATA: "C:\\L" })).toEqual([join("C:\\PF86", "Microsoft", "Edge", "Application", "msedge.exe"), join("C:\\L", "Microsoft", "Edge", "Application", "msedge.exe")]);
  });
});

describe("gom payload + tạo lại liên kết", () => {
  it("bỏ test/bộ nhớ đệm/ffprobe hệ khác; symlink → .cvs-links.json → ensureLinks tạo lại (một lần mỗi phiên bản)", () => {
    expect(skipped("apps/web/.next/cache")).toBe(true);
    expect(skipped("node_modules/.pnpm/ffprobe-static@3.1.0/node_modules/ffprobe-static/bin/linux")).toBe(true);
    expect(skipped("node_modules/.pnpm/ffprobe-static@3.1.0/node_modules/ffprobe-static/bin/win32/x64")).toBe(false);
    expect(skipped("node_modules/.pnpm/tsx@4.23.15/node_modules/tsx")).toBe(false);

    const root = join(tmp, "repo");
    const real = join(root, "node_modules", ".pnpm", "a@1.0.0", "node_modules", "a");
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, "index.js"), "module.exports = 1;");
    writeFileSync(join(root, "package.json"), "{}");
    symlinkSync(real, join(root, "node_modules", "a"), "junction");
    mkdirSync(join(root, "packages", "core", "test"), { recursive: true });
    writeFileSync(join(root, "packages", "core", "test", "x.test.ts"), "");
    writeFileSync(join(root, "packages", "core", "index.ts"), "");

    const out = join(tmp, "payload");
    const r = stage(root, out, () => undefined);
    expect(r.links).toEqual([["node_modules/a", "node_modules/.pnpm/a@1.0.0/node_modules/a"]]);
    expect(existsSync(join(out, "node_modules", "a"))).toBe(false);
    expect(existsSync(join(out, "packages", "core", "test"))).toBe(false);
    expect(existsSync(join(out, "packages", "core", "index.ts"))).toBe(true);

    expect(ensureLinks(out)).toEqual({ made: 1, failed: 0 });
    expect(realpathSync(join(out, "node_modules", "a"))).toBe(realpathSync(join(out, "node_modules", ".pnpm", "a@1.0.0", "node_modules", "a")));
    expect(readFileSync(join(out, "node_modules", "a", "index.js"), "utf8")).toContain("module.exports");
    expect(ensureLinks(out)).toEqual({ made: 0, failed: 0 });
  });
});

describe("chuyển dữ liệu sang ổ khác", () => {
  it("không có hẹn → null; có hẹn → chép đủ, ghi storage-path.txt, xoá bản cũ; appPaths đọc đường dẫn mới", async () => {
    const local = join(tmp, "mv", "Local");
    const p = appPaths({ LOCALAPPDATA: local }, join(tmp, "mv", "app"), join(tmp, "node.exe"));
    mkdirSync(join(p.storage, "projects", "a", "render"), { recursive: true });
    writeFileSync(join(p.storage, "cvs.sqlite"), "db");
    writeFileSync(join(p.storage, "projects", "a", "render", "v.mp4"), Buffer.alloc(5000, 1));
    expect(await applyStorageMove(p)).toBeNull();
    const to = join(tmp, "mv", "D", "Course Video Studio");
    writeFileSync(join(p.data, "storage-move.json"), JSON.stringify({ to }));
    const msgs: string[] = [];
    expect(await applyStorageMove(p, () => {}, (m) => msgs.push(m))).toBe(to);
    expect(msgs[0]).toMatch(/Đang chuyển dữ liệu \(2 tệp/);
    expect(treeStats(to)).toEqual({ files: 2, bytes: 5002 });
    expect(existsSync(p.storage)).toBe(false);
    expect(existsSync(join(p.data, "storage-move.json"))).toBe(false);
    const q = appPaths({ LOCALAPPDATA: local }, join(tmp, "mv", "app"), join(tmp, "node.exe"));
    expect(q.storage).toBe(to);
    expect(q.logFile).toBe(join(to, "logs", "app.log"));
    expect(buildEnv({}, q).CVS_APP_DATA).toBe(q.data);
  });
  it("đích không trống / nằm trong dữ liệu cũ → lỗi, giữ nguyên dữ liệu, không thử lại", async () => {
    const local = join(tmp, "mv2", "Local");
    const p = appPaths({ LOCALAPPDATA: local }, join(tmp, "mv2", "app"), join(tmp, "node.exe"));
    mkdirSync(p.storage, { recursive: true });
    writeFileSync(join(p.storage, "cvs.sqlite"), "db");
    const busy = join(tmp, "mv2", "E");
    mkdirSync(busy, { recursive: true });
    writeFileSync(join(busy, "x.txt"), "x");
    writeFileSync(join(p.data, "storage-move.json"), JSON.stringify({ to: busy }));
    await expect(applyStorageMove(p)).rejects.toThrow(/không còn trống/);
    expect(existsSync(join(p.data, "storage-move.json"))).toBe(false);
    writeFileSync(join(p.data, "storage-move.json"), JSON.stringify({ to: join(p.storage, "con") }));
    await expect(applyStorageMove(p)).rejects.toThrow(/nằm trong/);
    expect(readFileSync(join(p.storage, "cvs.sqlite"), "utf8")).toBe("db");
    expect(existsSync(join(p.data, "storage-path.txt"))).toBe(false);
  });
});
