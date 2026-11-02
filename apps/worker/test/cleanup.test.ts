// Dọn dẹp: chuyển vào _luu_tru, liệt kê bản lưu trữ, xoá hẳn – chỉ trong thư mục dự án.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-cleanup-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, paths } = await import("@cvs/db");
afterAll(() => rmSync(storage, { recursive: true, force: true }));
const post = (url: string, json: unknown) => app.request(`/api${url}`, { method: "POST", body: JSON.stringify(json), headers: { "content-type": "application/json" } });

describe("dọn dẹp", () => {
  it("lưu trữ → liệt kê → xoá hẳn; không xoá ngoài dự án", async () => {
    const pid = createProject("Dọn", "DD", ["L1"]).id;
    const root = paths.project(pid);
    const styles = join(root, "styles");
    mkdirSync(styles, { recursive: true });
    writeFileSync(join(styles, "a.png"), "x".repeat(100));
    const outside = join(storage, "khac.txt");
    writeFileSync(outside, "giữ");

    expect((await post(`/projects/${pid}/cleanup`, { paths: [styles] })).status).toBe(200);
    expect(existsSync(styles)).toBe(false);
    const arc = (await (await app.request(`/api/projects/${pid}/cleanup/archive`)).json()) as { items: { path: string; bytes: number }[] };
    expect(arc.items).toHaveLength(1);
    expect(arc.items[0].bytes).toBe(100);

    const r = (await (await post(`/projects/${pid}/cleanup/delete`, { paths: [arc.items[0].path, outside, join(root, "..", "..", "khac.txt")] })).json()) as { deleted: number };
    expect(r.deleted).toBe(1);
    expect(existsSync(arc.items[0].path)).toBe(false);
    expect(existsSync(outside)).toBe(true);
    expect((await post(`/projects/${pid}/cleanup/delete`, { paths: "x" })).status).toBe(400);
  });
});
