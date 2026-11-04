// Khởi động giao diện. CVS_LAN=1 → mở cho điện thoại/máy khác cùng Wi-Fi (bắt buộc có CVS_ACCESS_PIN).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const mode = process.argv[2] === "dev" ? "dev" : "start";
const port = process.env.CVS_WEB_PORT ?? "3000";
const lan = process.env.CVS_LAN === "1";
const host = lan ? "0.0.0.0" : "127.0.0.1";
if (lan) {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log(`\nMở trên điện thoại (cùng Wi-Fi): ${ips.map((ip) => `http://${ip}:${port}`).join("  ")}`);
  console.log(process.env.CVS_ACCESS_PIN ? "Cần nhập mã PIN (CVS_ACCESS_PIN trong .env).\n" : "CHÚ Ý: chưa đặt CVS_ACCESS_PIN trong .env – điện thoại sẽ bị chặn cho tới khi đặt PIN.\n");
}
// tìm next qua Node (chạy được cả khi thư viện cài kiểu pnpm lồng nhau lẫn kiểu phẳng của bộ cài)
const next = join(dirname(createRequire(join(here, "package.json")).resolve("next/package.json")), "dist", "bin", "next");
// Chế độ LAN: Next chỉ nghe 127.0.0.1 ở cổng trong; một proxy nhỏ nghe 0.0.0.0 và ghi địa chỉ thật của máy gửi vào
// x-cvs-remote / x-forwarded-for (ghi đè, máy khác không giả được) → middleware biết đâu là máy này, đâu là điện thoại.
const inner = lan ? String(Number(port) + 100) : port;
const p = spawn(process.execPath, [next, mode, "-p", inner, "-H", "127.0.0.1"], { cwd: here, stdio: "inherit", env: { ...process.env, CVS_LAN: lan ? "1" : "" } });
if (lan) {
  const http = await import("node:http");
  const net = await import("node:net");
  const fwd = (req) => {
    const remote = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
    const h = { ...req.headers, "x-cvs-remote": remote, "x-forwarded-for": remote };
    return h;
  };
  const server = http.createServer((req, res) => {
    const up = http.request({ host: "127.0.0.1", port: inner, method: req.method, path: req.url, headers: fwd(req) }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("Giao diện đang khởi động – thử lại sau vài giây");
    });
    req.pipe(up);
  });
  // WebSocket (chế độ dev): chuyển nguyên kết nối
  server.on("upgrade", (req, sock, head) => {
    const up = net.connect(Number(inner), "127.0.0.1", () => {
      const h = fwd(req);
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
      up.write(head);
      sock.pipe(up).pipe(sock);
    });
    up.on("error", () => sock.destroy());
    sock.on("error", () => up.destroy());
  });
  server.listen(Number(port), host);
}
p.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => p.kill(s));
