// Nơi lưu: các ổ đĩa (ổ trong, ổ ngoài, ổ mạng đã map) và thư mục cloud đã đồng bộ về máy (OneDrive, Google Drive, Dropbox, iCloud)
// để chọn nhanh nơi xuất video; thư mục xuất mặc định cho mọi dự án; chuyển dữ liệu làm việc (storage) sang ổ khác – bộ cài
// Windows chép khi mở lại ứng dụng (launcher.mjs), không chuyển vào cloud/ổ mạng vì cơ sở dữ liệu SQLite hỏng khi bị đồng bộ.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { STORAGE } from "@cvs/db";

export type LocationKind = "local" | "removable" | "network" | "cloud";
export type StorageLocation = { path: string; label: string; kind: LocationKind; free: number | null; total: number | null };
type Env = Record<string, string | undefined>;

// ---------- cài đặt chung (storage/settings.json) ----------

const SETTINGS_FILE = join(STORAGE, "settings.json");
export function readAppSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}
export function writeAppSettings(patch: Record<string, unknown>) {
  const j = { ...readAppSettings(), ...patch };
  for (const k of Object.keys(j)) if (j[k] === undefined) delete j[k];
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(j, null, 2));
}

/** Thư mục xuất mặc định cho mọi dự án (dự án đã chọn thư mục riêng thì dùng thư mục riêng). */
export function defaultVideoDir(): string | null {
  const v = readAppSettings().videoDir;
  return typeof v === "string" && v ? v : null;
}

// ---------- dò ổ đĩa + thư mục cloud ----------

const space = (p: string) => {
  try {
    const s = statfsSync(p);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return { free: null, total: null };
  }
};
const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

type Disk = { DeviceID: string; DriveType: number; VolumeName?: string | null; ProviderName?: string | null; FreeSpace?: number | null; Size?: number | null };
/** Ổ đĩa Windows qua CIM (loại ổ, tên, đường mạng); lỗi → dò chữ cái ổ. */
export function windowsDisks(run: typeof spawnSync = spawnSync, exists: (p: string) => boolean = existsSync): Disk[] {
  const r = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName,ProviderName,FreeSpace,Size | ConvertTo-Json -Compress"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  try {
    const j = JSON.parse(String(r.stdout ?? "").trim());
    return (Array.isArray(j) ? j : [j]).filter((d) => d && typeof d.DeviceID === "string");
  } catch {
    return [..."CDEFGHIJKLMNOPQRSTUVWXYZ"].filter((l) => exists(`${l}:\\`)).map((l) => ({ DeviceID: `${l}:`, DriveType: 3 }));
  }
}

const CLOUD_NAMES = [/^OneDrive( - .+)?$/i, /^Google Drive$/i, /^My Drive$/i, /^Dropbox( \(.+\))?$/i, /^iCloud ?Drive$/i, /^Box$/i, /^pCloud Drive$/i];

/** Các thư mục cloud đã đồng bộ về máy. */
export function cloudFolders(env: Env = process.env, platform: NodeJS.Platform = process.platform, dir: (p: string) => boolean = isDir, list: (p: string) => string[] = safeList): { path: string; label: string }[] {
  const home = env.USERPROFILE || env.HOME || homedir();
  const out: { path: string; label: string }[] = [];
  const add = (p: string | undefined, label: string) => {
    if (p && dir(p) && !out.some((x) => resolve(x.path) === resolve(p))) out.push({ path: p, label });
  };
  if (platform === "win32") {
    add(env.OneDriveCommercial, `OneDrive (công ty)`);
    add(env.OneDriveConsumer, "OneDrive (cá nhân)");
    add(env.OneDrive, "OneDrive");
  }
  for (const n of list(home)) if (CLOUD_NAMES.some((r) => r.test(n))) add(join(home, n), n);
  if (platform === "darwin") for (const n of list(join(home, "Library", "CloudStorage"))) add(join(home, "Library", "CloudStorage", n), n.replace(/-/g, " "));
  return out;
}
function safeList(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

const KIND: Record<number, LocationKind> = { 2: "removable", 3: "local", 4: "network" };
export function listLocations(env: Env = process.env, platform: NodeJS.Platform = process.platform, disks: () => Disk[] = windowsDisks): StorageLocation[] {
  const out: StorageLocation[] = [];
  if (platform === "win32") {
    for (const d of disks()) {
      const kind = /google drive/i.test(d.VolumeName ?? "") ? "cloud" : KIND[d.DriveType];
      if (!kind) continue; // ổ CD, RAM…
      const name = d.VolumeName || (kind === "network" ? d.ProviderName : "") || (kind === "removable" ? "Ổ ngoài" : kind === "network" ? "Ổ mạng" : "Ổ đĩa");
      out.push({ path: `${d.DeviceID}\\`, label: `${name} (${d.DeviceID})`, kind, free: d.FreeSpace ?? null, total: d.Size ?? null });
    }
  } else {
    const home = env.HOME || homedir();
    out.push({ path: home, label: "Thư mục cá nhân", kind: "local", ...space(home) });
    for (const root of platform === "darwin" ? ["/Volumes"] : [join("/media", env.USER ?? ""), "/mnt"]) {
      for (const n of safeList(root)) {
        const p = join(root, n);
        if (isDir(p)) out.push({ path: p, label: n, kind: "removable", ...space(p) });
      }
    }
  }
  for (const c of cloudFolders(env, platform)) out.push({ ...c, kind: "cloud", ...space(c.path) });
  return out;
}

/** Loại nơi lưu của một đường dẫn: thư mục cloud, ổ mạng (UNC hoặc ổ đã map), còn lại là ổ trong máy. */
export function locationKind(p: string, locs: StorageLocation[]): LocationKind {
  if (/^\\\\/.test(p)) return "network";
  const full = resolve(p).toLowerCase();
  const hit = locs
    .filter((l) => full === resolve(l.path).toLowerCase() || full.startsWith(resolve(l.path).toLowerCase().replace(/[\\/]+$/, "") + sep))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return hit?.kind ?? "local";
}

/** Ghi thử một tệp nhỏ – ổ mạng mất kết nối, không có quyền, cloud chỉ đọc → lỗi rõ ràng trước khi xuất. */
export function assertWritable(dir: string) {
  const f = join(dir, `.cvs-kiem-tra-${randomBytes(3).toString("hex")}`);
  try {
    writeFileSync(f, "ok");
    unlinkSync(f);
  } catch (e) {
    rmSync(f, { force: true });
    throw new Error(`Không ghi được vào thư mục này (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}) – kiểm tra ổ mạng còn kết nối, quyền ghi, hoặc ứng dụng cloud đang chạy`);
  }
}

/** Kiểm một thư mục người dùng chọn: tạo được, ghi được, còn bao nhiêu chỗ, thuộc loại nào. */
export function checkLocation(input: unknown): { path: string; kind: LocationKind; free: number | null; total: number | null } {
  if (typeof input !== "string" || !input.trim()) throw new Error("Chưa chọn thư mục");
  const raw = input.trim();
  if (!isAbsolute(raw)) throw new Error("Cần đường dẫn đầy đủ, ví dụ D:\\Video khoá học, \\\\may-chu\\chia-se\\Video hoặc thư mục OneDrive");
  const p = resolve(raw);
  const store = resolve(STORAGE);
  if (p === store || p.startsWith(store + sep) || store.startsWith(p + sep)) throw new Error("Chọn thư mục ngoài thư mục dữ liệu của ứng dụng");
  if (existsSync(p) && !isDir(p)) throw new Error("Đường dẫn này là một tệp, không phải thư mục");
  try {
    mkdirSync(p, { recursive: true });
  } catch (e) {
    throw new Error(`Không tạo được thư mục: ${(e as Error).message}`);
  }
  assertWritable(p);
  return { path: p, kind: locationKind(p, listLocations()), ...space(p) };
}

/** Đặt / bỏ thư mục xuất mặc định cho mọi dự án. */
export function setDefaultVideoDir(input: unknown): { path: string | null } {
  if (input === null || input === "") {
    writeAppSettings({ videoDir: undefined });
    return { path: null };
  }
  const c = checkLocation(input);
  writeAppSettings({ videoDir: c.path });
  return { path: c.path };
}

// ---------- chuyển dữ liệu làm việc (bộ cài Windows) ----------

/** Thư mục dữ liệu của bộ cài (launcher đặt CVS_APP_DATA); chạy từ mã nguồn → null (đặt CVS_STORAGE trong .env). */
export const appDataDir = (env: Env = process.env) => (env.CVS_DESKTOP === "1" && env.CVS_APP_DATA ? env.CVS_APP_DATA : null);
export const moveRequestFile = (data: string) => join(data, "storage-move.json");

/** Dung lượng thư mục (dừng ở 2 triệu tệp). */
export function dirSize(d: string): { bytes: number; files: number } {
  let bytes = 0, files = 0;
  const stack = [d];
  while (stack.length && files < 2_000_000) {
    const cur = stack.pop()!;
    let ents;
    try {
      ents = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const f = join(cur, e.name);
      if (e.isDirectory()) stack.push(f);
      else if (e.isFile()) {
        files++;
        try {
          bytes += statSync(f).size;
        } catch {
          /* vừa bị xoá */
        }
      }
    }
  }
  return { bytes, files };
}

export type DataInfo = { path: string; bytes: number; files: number; canMove: boolean; pending: string | null; free: number | null };
export function dataInfo(env: Env = process.env): DataInfo {
  const data = appDataDir(env);
  let pending: string | null = null;
  try {
    if (data) pending = JSON.parse(readFileSync(moveRequestFile(data), "utf8")).to ?? null;
  } catch {
    /* không có */
  }
  return { path: STORAGE, ...dirSize(STORAGE), canMove: !!data, pending, ...{ free: space(STORAGE).free } };
}

/** Hẹn chuyển dữ liệu: kiểm đích (ổ trong / ổ ngoài, không cloud, không ổ mạng), trống, đủ chỗ; launcher chép khi mở lại. */
export function requestDataMove(input: unknown, env: Env = process.env, locs: () => StorageLocation[] = listLocations): { to: string; bytes: number } {
  const data = appDataDir(env);
  if (!data) throw new Error("Chỉ bản cài đặt mới chuyển được dữ liệu. Chạy từ mã nguồn: đặt CVS_STORAGE=<thư mục mới> trong .env rồi chép thư mục storage sang đó");
  if (input === null) {
    rmSync(moveRequestFile(data), { force: true });
    return { to: "", bytes: 0 };
  }
  if (typeof input !== "string" || !isAbsolute(input.trim())) throw new Error("Cần đường dẫn đầy đủ, ví dụ D:\\Course Video Studio");
  const to = resolve(input.trim());
  const store = resolve(STORAGE);
  if (to === store || to.startsWith(store + sep) || store.startsWith(to + sep)) throw new Error("Thư mục mới phải nằm ngoài thư mục dữ liệu hiện tại");
  const kind = locationKind(to, locs());
  if (kind === "cloud") throw new Error("Không chuyển dữ liệu làm việc vào thư mục cloud (OneDrive, Google Drive…): cơ sở dữ liệu sẽ hỏng khi bị đồng bộ. Hãy xuất video vào cloud ở bước Xuất");
  if (kind === "network") throw new Error("Không chuyển dữ liệu làm việc vào ổ mạng: chậm và dễ hỏng cơ sở dữ liệu khi mất kết nối. Hãy xuất video vào ổ mạng ở bước Xuất");
  if (existsSync(to) && (!isDir(to) || safeList(to).length)) throw new Error("Thư mục mới phải trống (hoặc chưa có) – chọn hoặc tạo một thư mục trống");
  mkdirSync(to, { recursive: true });
  assertWritable(to);
  const { bytes } = dirSize(STORAGE);
  const free = space(to).free;
  if (free !== null && free < bytes + 1024 ** 3) throw new Error(`Ổ mới không đủ chỗ: cần khoảng ${(bytes / 1024 ** 3 + 1).toFixed(1)} GB, còn ${(free / 1024 ** 3).toFixed(1)} GB`);
  writeFileSync(moveRequestFile(data), JSON.stringify({ to, at: new Date().toISOString() }));
  return { to, bytes };
}
