// Nơi lưu: dò ổ đĩa / ổ mạng / cloud, kiểm thư mục (ghi thử), thư mục xuất mặc định chung, hẹn chuyển dữ liệu làm việc.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = mkdtempSync(join(tmpdir(), "cvs-loc-"));
const storage = join(root, "storage");
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { cloudFolders, listLocations, locationKind, requestDataMove, windowsDisks } = await import("@cvs/studio");
afterAll(() => rmSync(root, { recursive: true, force: true }));
const LOCAL = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
const req = (path: string, json?: unknown) => app.request(`/api${path}`, json === undefined ? undefined : { method: "POST", body: JSON.stringify(json), headers: { "content-type": "application/json" } }, LOCAL);

describe("dò nơi lưu", () => {
  it("Windows: ổ trong / ổ ngoài / ổ mạng / Google Drive, bỏ ổ CD; CIM lỗi → dò chữ cái", () => {
    const disks = () => [
      { DeviceID: "C:", DriveType: 3, VolumeName: "Windows", FreeSpace: 10, Size: 100 },
      { DeviceID: "E:", DriveType: 2, VolumeName: "" },
      { DeviceID: "F:", DriveType: 5 },
      { DeviceID: "G:", DriveType: 3, VolumeName: "Google Drive" },
      { DeviceID: "Z:", DriveType: 4, ProviderName: "\\\\nas\\video" },
    ];
    const l = listLocations({ USERPROFILE: join(root, "khong-co") }, "win32", disks);
    expect(l.map((x) => [x.path, x.kind, x.label])).toEqual([
      ["C:\\", "local", "Windows (C:)"], ["E:\\", "removable", "Ổ ngoài (E:)"], ["G:\\", "cloud", "Google Drive (G:)"], ["Z:\\", "network", "\\\\nas\\video (Z:)"],
    ]);
    const bad = windowsDisks((() => ({ stdout: "không phải json" })) as never, (p) => p === "C:\\" || p === "D:\\");
    expect(bad.map((d) => d.DeviceID)).toEqual(["C:", "D:"]);
  });
  it("thư mục cloud: biến OneDrive + tên thư mục quen thuộc trong thư mục người dùng", () => {
    const home = join(root, "home");
    for (const d of ["OneDrive - TUV NORD", "Dropbox", "Google Drive", "Tai lieu"]) mkdirSync(join(home, d), { recursive: true });
    const c = cloudFolders({ USERPROFILE: home, OneDriveCommercial: join(home, "OneDrive - TUV NORD") }, "win32");
    expect(c.map((x) => x.label)).toEqual(["OneDrive (công ty)", "Dropbox", "Google Drive"]);
  });
  it("loại của đường dẫn: UNC → mạng, nằm trong thư mục cloud → cloud", () => {
    const locs = [{ path: join(root, "home", "Dropbox"), label: "Dropbox", kind: "cloud" as const, free: null, total: null }];
    expect(locationKind("\\\\nas\\chia-se\\v", locs)).toBe("network");
    expect(locationKind(join(root, "home", "Dropbox", "Video"), locs)).toBe("cloud");
    expect(locationKind(join(root, "home", "Dropboxx"), locs)).toBe("local");
  });
});

describe("thư mục xuất mặc định + kiểm thư mục", () => {
  it("kiểm: tạo được, ghi thử được; từ chối đường dẫn tương đối và thư mục dữ liệu", async () => {
    const ok = await (await req("/storage/check", { path: join(root, "Video khoá học") })).json();
    expect(ok.path).toBe(join(root, "Video khoá học"));
    expect(ok.kind).toBe("local");
    expect(typeof ok.free).toBe("number");
    expect((await (await req("/storage/check", { path: "tuong-doi" })).json()).error).toMatch(/đường dẫn đầy đủ/);
    expect((await (await req("/storage/check", { path: join(storage, "x") })).json()).error).toMatch(/ngoài thư mục dữ liệu/);
  });
  it("đặt mặc định → xuất dùng thư mục đó khi dự án chưa chọn; dest null → thư mục của ứng dụng", async () => {
    const dir = join(root, "Mac dinh");
    expect((await (await req("/storage/default", { path: dir })).json()).path).toBe(dir);
    expect((await (await req("/storage/locations")).json()).videoDir).toBe(dir);
    expect(JSON.parse(readFileSync(join(storage, "settings.json"), "utf8")).videoDir).toBe(dir);
    const p = await (await req("/projects", { name: "Xuất mặc định", course: "XM", levels: ["L1"] })).json();
    const r = await (await req(`/projects/${p.id}/export`, {})).json();
    expect(r.dir).toBe(join(dir, "Xuất mặc định"));
    const r2 = await (await req(`/projects/${p.id}/export`, { dest: null })).json();
    expect(r2.dir.startsWith(storage)).toBe(true);
    expect((await (await req("/storage/default", { path: null })).json()).path).toBeNull();
    expect((await app.request("/api/storage/default", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).status).toBe(403);
  });
});

describe("hẹn chuyển dữ liệu làm việc", () => {
  const data = join(root, "AppData");
  const env = { CVS_DESKTOP: "1", CVS_APP_DATA: data };
  const locs = () => [{ path: join(root, "cloud"), label: "OneDrive", kind: "cloud" as const, free: null, total: null }];
  it("chạy từ mã nguồn → hướng dẫn .env; cloud / ổ mạng / thư mục không trống bị từ chối; hợp lệ → ghi hẹn; null → huỷ", () => {
    mkdirSync(data, { recursive: true });
    expect(() => requestDataMove(join(root, "D"), {}, locs)).toThrow(/CVS_STORAGE/);
    expect(() => requestDataMove(join(root, "cloud", "cvs"), env, locs)).toThrow(/cloud/);
    expect(() => requestDataMove("\\\\nas\\cvs", { ...env }, locs)).toThrow();
    mkdirSync(join(root, "co-file"), { recursive: true });
    writeFileSync(join(root, "co-file", "a.txt"), "a");
    expect(() => requestDataMove(join(root, "co-file"), env, locs)).toThrow(/trống/);
    expect(() => requestDataMove(join(storage, "con"), env, locs)).toThrow(/ngoài thư mục dữ liệu/);
    const r = requestDataMove(join(root, "D", "CVS"), env, locs);
    expect(r.to).toBe(join(root, "D", "CVS"));
    expect(JSON.parse(readFileSync(join(data, "storage-move.json"), "utf8")).to).toBe(r.to);
    requestDataMove(null, env, locs);
    expect(() => readFileSync(join(data, "storage-move.json"))).toThrow();
  });
});
