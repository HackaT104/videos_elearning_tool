// API ảnh của dự án: tải lên (PNG/JPG/WebP/SVG ≤ 10 MB, SVG được lọc), liệt kê, lấy file, xoá – trên thư mục lưu trữ tạm.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const storage = mkdtempSync(join(tmpdir(), "cvs-assets-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, paths } = await import("@cvs/db");

// PNG 2×1 thật (đủ chữ ký + IHDR)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwyBDAA4+wf5Ia2bXQAAAABJRU5ErkJggg==", "base64");
let pid = "";

const upload = (name: string, data: Buffer | string, type = "application/octet-stream") => {
  const fd = new FormData();
  fd.append("file", new File([data], name, { type }));
  return app.request(`/api/projects/${pid}/assets`, { method: "POST", body: fd });
};

beforeAll(() => {
  pid = createProject("Dự án ảnh", "IMG", ["L1"]).id;
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("API ảnh của dự án", () => {
  it("tải PNG → mã theo hash nội dung + kích thước; trùng nội dung → cùng mã", async () => {
    const r = await upload("man hinh.png", PNG, "image/png");
    expect(r.status).toBe(200);
    const a = await r.json();
    expect(a).toMatchObject({ w: 2, h: 1, ext: "png", name: "man hinh.png" });
    expect(a.id).toMatch(/^[a-f0-9]{16}-2x1\.png$/);
    expect(a.url).toBe(`/api/projects/${pid}/assets/${a.id}`);
    expect(readFileSync(join(paths.assets(pid), a.id)).equals(PNG)).toBe(true);
    const again = await (await upload("khac.png", PNG)).json();
    expect(again.id).toBe(a.id);
    const list = await (await app.request(`/api/projects/${pid}/assets`)).json();
    expect(list.map((x: any) => x.id)).toEqual([a.id]);
    const f = await app.request(a.url);
    expect(f.headers.get("content-type")).toBe("image/png");
    expect(f.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await f.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("SVG được lọc trước khi lưu (script, on*, href ngoài bị bỏ) và phục vụ kèm CSP", async () => {
    const evil = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100" onload="alert(1)"><script>alert(document.cookie)</script><rect width="200" height="100" fill="#0b7a5c"/><image xlink:href="https://evil/x.png"/><a href="javascript:alert(1)"><text>x</text></a></svg>`;
    const r = await upload("logo.svg", evil, "image/svg+xml");
    expect(r.status).toBe(200);
    const a = await r.json();
    expect(a).toMatchObject({ ext: "svg", w: 1000, h: 500 });
    const saved = readFileSync(join(paths.assets(pid), a.id), "utf8");
    expect(saved).not.toMatch(/script|onload|javascript|<image|<a[\s>]|evil/);
    expect(saved).toContain("fill:#0b7a5c");
    const f = await app.request(a.url);
    expect(f.headers.get("content-type")).toBe("image/svg+xml");
    expect(f.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("từ chối: không phải ảnh, SVG có ENTITY, quá 10 MB, thiếu file, dự án không có", async () => {
    expect((await upload("a.png", "<html><script>x</script></html>", "image/png")).status).toBe(400);
    expect((await upload("a.gif", Buffer.from("GIF89a....."), "image/gif")).status).toBe(400);
    const xxe = await upload("x.svg", `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>`);
    expect(xxe.status).toBe(400);
    expect((await xxe.json()).error).toMatch(/ENTITY/);
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    expect((await upload("big.png", big)).status).toBe(413);
    expect((await app.request(`/api/projects/${pid}/assets`, { method: "POST", body: new FormData() })).status).toBe(400);
    expect((await app.request(`/api/projects/khong-co/assets`)).status).toBe(404);
    expect((await app.request(`/api/projects/${pid}/assets/..%2F..%2Fstudio.db`)).status).toBe(404);
  });

  it("xoá ảnh; xoá mã lạ → 404", async () => {
    const list = await (await app.request(`/api/projects/${pid}/assets`)).json();
    const id = list[0].id;
    const d = await app.request(`/api/projects/${pid}/assets/${id}`, { method: "DELETE" });
    expect(await d.json()).toEqual({ ok: true, usedBy: [] });
    expect((await app.request(`/api/projects/${pid}/assets/${id}`)).status).toBe(404);
    expect((await app.request(`/api/projects/${pid}/assets/../x`, { method: "DELETE" })).status).toBe(404);
  });
});
