// Kết nối Claude Desktop (gói Claude Pro/Max) với máy chủ MCP course-video-studio: ghi/gộp mục mcpServers trong
// claude_desktop_config.json (sao lưu trước, giữ nguyên các máy chủ khác), gỡ, xem trạng thái. Chỉ gọi từ chính máy này.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Hono } from "hono";
import { isLocalRequest } from "./desktop";

export const MCP_NAME = "course-video-studio";
export const DESKTOP_PROMPT = "Xử lý các yêu cầu đang chờ của Course Video Studio";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

type Env = Record<string, string | undefined>;
export type McpEntry = { command: string; args: string[]; env: Record<string, string> };

/**
 * Các tệp cấu hình Claude Desktop cần ghi. Windows: %APPDATA%\Claude, và bản cài từ Microsoft Store (MSIX) đọc bản ảo hoá trong
 * %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude nếu có. macOS: ~/Library/Application Support/Claude. Linux: ~/.config/Claude.
 */
export function configPaths(env: Env = process.env, platform = process.platform, home = homedir()): string[] {
  if (env.CVS_CLAUDE_DESKTOP_CONFIG) return [env.CVS_CLAUDE_DESKTOP_CONFIG];
  const file = "claude_desktop_config.json";
  if (platform === "win32") {
    const out = [join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", file)];
    const pk = join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Packages");
    try {
      for (const d of readdirSync(pk)) if (/^Claude_/i.test(d) && existsSync(join(pk, d, "LocalCache", "Roaming", "Claude"))) out.push(join(pk, d, "LocalCache", "Roaming", "Claude", file));
    } catch {
      /* không có thư mục Packages */
    }
    return out;
  }
  if (platform === "darwin") return [join(home, "Library", "Application Support", "Claude", file)];
  return [join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude", file)];
}

/** Lệnh chạy máy chủ MCP: node đang chạy worker (bản cài: node.exe đi kèm) + bản dựng một tệp; chưa dựng → tsx + mã nguồn. */
export function mcpEntry(root = ROOT, env: Env = process.env, node = process.execPath): McpEntry {
  const dist = join(root, "apps", "mcp", "dist", "cvs-mcp.mjs");
  const api = { CVS_API: `http://127.0.0.1:${Number(env.CVS_API_PORT ?? 3001)}/api` };
  if (existsSync(dist)) return { command: node, args: [dist], env: api };
  const tsx = createRequire(join(root, "apps", "worker", "package.json")).resolve("tsx");
  return { command: node, args: ["--import", pathToFileURL(tsx).href, join(root, "apps", "mcp", "src", "index.ts")], env: api };
}

class ConfigError extends Error {}

function readConfig(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8").replace(/^﻿/, "");
  if (!raw.trim()) return {};
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(`Tệp cấu hình Claude Desktop không phải JSON hợp lệ (${(e as Error).message}) – sửa hoặc xoá tệp ${path} rồi thử lại`);
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new ConfigError(`Tệp cấu hình ${path} không đúng dạng – sửa hoặc xoá rồi thử lại`);
  const c = cfg as Record<string, any>;
  if (c.mcpServers !== undefined && (!c.mcpServers || typeof c.mcpServers !== "object" || Array.isArray(c.mcpServers))) throw new ConfigError(`"mcpServers" trong ${path} không đúng dạng`);
  return c;
}

/** Sao lưu (nếu có tệp) rồi ghi qua tệp tạm + đổi tên. */
function writeConfig(path: string, cfg: Record<string, any>, now = new Date()): string | null {
  mkdirSync(dirname(path), { recursive: true });
  let backup: string | null = null;
  if (existsSync(path)) {
    backup = `${path}.bak-${now.toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(path, backup);
  }
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n");
  renameSync(tmp, path);
  return backup;
}

export function connectDesktop(entry = mcpEntry(), paths = configPaths()) {
  const cfgs = paths.map((p) => ({ p, cfg: readConfig(p) })); // đọc hết trước: một tệp hỏng → không ghi tệp nào
  return cfgs.map(({ p, cfg }) => ({ path: p, backup: writeConfig(p, { ...cfg, mcpServers: { ...(cfg.mcpServers ?? {}), [MCP_NAME]: entry } }) }));
}

export function disconnectDesktop(paths = configPaths()) {
  const cfgs = paths.map((p) => ({ p, cfg: readConfig(p) }));
  return cfgs
    .filter(({ cfg }) => cfg.mcpServers?.[MCP_NAME])
    .map(({ p, cfg }) => {
      const { [MCP_NAME]: _, ...rest } = cfg.mcpServers;
      return { path: p, backup: writeConfig(p, { ...cfg, mcpServers: rest }) };
    });
}

export function desktopStatus(entry = mcpEntry(), paths = configPaths()) {
  const files = paths.map((p) => {
    try {
      const cur = readConfig(p).mcpServers?.[MCP_NAME] as McpEntry | undefined;
      return {
        path: p,
        exists: existsSync(p),
        connected: !!cur,
        // mục khớp lệnh hiện tại (đổi thư mục cài / cổng → bấm Kết nối lại)
        upToDate: !!cur && JSON.stringify(cur) === JSON.stringify(entry),
        entryFileOk: !!cur && Array.isArray(cur.args) && existsSync(cur.args[cur.args.length - 1] ?? ""),
        apiOk: !!cur && cur.env?.CVS_API === entry.env.CVS_API,
        error: null as string | null,
      };
    } catch (e) {
      return { path: p, exists: true, connected: false, upToDate: false, entryFileOk: false, apiOk: false, error: (e as Error).message };
    }
  });
  return {
    name: MCP_NAME,
    connected: files.some((f) => f.connected),
    upToDate: files.length > 0 && files.every((f) => f.upToDate),
    // Claude Desktop đã cài (đã có thư mục cấu hình)?
    desktopFound: paths.some((p) => existsSync(dirname(p))),
    workerOk: true, // trả lời được = worker đang chạy
    files,
    entry,
    prompt: DESKTOP_PROMPT,
  };
}

const remoteAddr = (c: { env: unknown }) => (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;

export function claudeDesktopRoutes(app: Hono) {
  // POST cả trạng thái: lộ đường dẫn trên máy → chỉ trả cho chính máy này (isLocalRequest cần JSON)
  const guard = (c: any, fn: () => unknown) => {
    if (!isLocalRequest(remoteAddr(c), c.req.raw.headers)) return c.json({ error: "Chỉ kết nối Claude Desktop được ngay trên máy tính đang chạy ứng dụng" }, 403);
    try {
      return c.json(fn());
    } catch (e) {
      return c.json({ error: (e as Error).message }, e instanceof ConfigError ? 400 : 500);
    }
  };
  app.post("/claude-desktop/status", (c) => guard(c, () => desktopStatus()));
  app.post("/claude-desktop/connect", (c) => guard(c, () => ({ files: connectDesktop(), status: desktopStatus() })));
  app.post("/claude-desktop/disconnect", (c) => guard(c, () => ({ files: disconnectDesktop(), status: desktopStatus() })));
}
