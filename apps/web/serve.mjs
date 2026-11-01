// Khởi động giao diện. CVS_LAN=1 → mở cho điện thoại/máy khác cùng Wi-Fi (bắt buộc có CVS_ACCESS_PIN).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
const next = join(here, "node_modules", "next", "dist", "bin", "next");
const p = spawn(process.execPath, [next, mode, "-p", port, "-H", host], { cwd: here, stdio: "inherit", env: process.env });
p.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => p.kill(s));
