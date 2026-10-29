// Máy chủ tĩnh tối giản để Remotion tải giọng đọc (giống engine-hf/server, tránh phụ thuộc chéo).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize, resolve, sep } from "node:path";

export function serveStatic(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const p = normalize(join(base, decodeURIComponent((req.url ?? "/").split("?")[0])));
    if (!p.startsWith(base + sep) || !existsSync(p) || statSync(p).isDirectory()) return void res.writeHead(404).end();
    const size = statSync(p).size;
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    const type = p.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream";
    if (range) {
      const s = range[1] ? Number(range[1]) : 0;
      const e = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${s}-${e}/${size}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1, "Access-Control-Allow-Origin": "*" });
      return void createReadStream(p, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" });
    createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise((r) => server.close(() => r())) })));
}
