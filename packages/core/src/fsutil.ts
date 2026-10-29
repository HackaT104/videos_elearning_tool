// Ghi file kiểu nguyên tử (ghi tạm → đổi tên) và kiểm tra hash sau khi ghi (mục 9: tránh "ghi đè nhưng vẫn ra bản cũ").

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export function sha1(data: string | Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

export function writeFileAtomic(path: string, data: string | Buffer): string {
  ensureDir(dirname(path));
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, path);
  } catch (e) {
    // Windows: đích đang bị khóa đọc → thử xóa rồi đổi tên
    if (existsSync(path)) rmSync(path, { force: true });
    renameSync(tmp, path);
  }
  const want = sha1(typeof data === "string" ? Buffer.from(data) : data);
  const got = sha1(readFileSync(path));
  if (want !== got) throw new Error(`Ghi file không khớp hash: ${path}`);
  return got;
}

export function writeJsonAtomic(path: string, obj: unknown): string {
  return writeFileAtomic(path, JSON.stringify(obj, null, 2) + "\n");
}

export function readJson<T>(path: string, fallback?: T): T {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Không tìm thấy ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
