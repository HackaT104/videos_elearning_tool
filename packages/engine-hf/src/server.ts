// Máy chủ tĩnh cục bộ cho xem trước/render (Chromium không cho fetch file:// giữa các file).

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

export type StaticServer = { url: string; close(): Promise<void>; server: Server };

export function serveDir(root: string): Promise<StaticServer> {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const p = normalize(join(base, urlPath === "/" ? "index.html" : urlPath));
    if (!(p === base || p.startsWith(base + sep)) || !existsSync(p) || statSync(p).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    const size = statSync(p).size;
    const type = MIME[extname(p).toLowerCase()] ?? "application/octet-stream";
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Access-Control-Allow-Origin": "*" });
      createReadStream(p, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Cache-Control": "no-store", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" });
    createReadStream(p).pipe(res);
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      ok({ url: `http://127.0.0.1:${port}`, server, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}
