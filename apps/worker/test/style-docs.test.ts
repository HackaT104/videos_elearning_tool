// Tài liệu phong cách ZIP/PDF/HTML: giải nén an toàn (chặn ../), bỏ biểu tượng nhỏ, chụp trang HTML không JS + chặn mạng ngoài,
// giữ PDF, ghi chú màu/phông từ CSS; đề bài nhận docs; style-refs / prompt style-gen của Claude Code; job style-gen gửi PDF.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ calls: [] as { images: { file: string; label: string }[]; pdfs: { file: string; label: string }[] }[] }));
vi.mock("@cvs/ai", async (orig) => {
  const m = await orig<typeof import("@cvs/ai")>();
  return {
    ...m,
    aiAvailable: () => false,
    generateStyle: async (_i: never, images: never, pdfs: never) => {
      ai.calls.push({ images, pdfs });
      throw new Error("dừng sau khi kiểm đầu vào");
    },
  };
});

const storage = mkdtempSync(join(tmpdir(), "cvs-sd-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject } = await import("@cvs/db");
const { cssNotes, runStyleGen } = await import("@cvs/studio");
const { main } = await import("../../../scripts/cvs");

let pid = "";
const req = (path: string, init?: RequestInit & { json?: unknown }) =>
  app.request(`/api${path}`, init?.json !== undefined ? { ...init, body: JSON.stringify(init.json), headers: { "content-type": "application/json" } } : init);
const upload = (name: string, body: BodyInit) => req(`/projects/${pid}/style-refs/doc`, { method: "POST", body, headers: { "x-file-name": encodeURIComponent(name) } });
const run = async (...argv: string[]) => {
  const out: string[] = [];
  const code = await main(argv, { base: "http://cvs.test/api", fetch: (async (u: string, init?: RequestInit) => app.request(String(u), init)) as typeof fetch, out: (s) => out.push(s), err: () => {}, readFile: (p) => readFileSync(p, "utf8"), sleep: async () => {} });
  return { code, out: out.join("\n") };
};
const png = (w: number, h: number) => {
  const f = join(storage, `t-${w}x${h}.png`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${w}x${h}`, "-frames:v", "1", f]);
  return readFileSync(f);
};
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const HTML = `<!doctype html><html><head><link rel="stylesheet" href="css/brand.css"><script>document.body.innerHTML='JS'</script></head>
<body><h1>Thương hiệu</h1><img src="img/hero.png"><img src="https://example.com/track.png"></body></html>`;
const CSS = "body{background:#F4F7FA;color:#0B2545;font-family:'Be Vietnam Pro',sans-serif} h1{color:#0055A5;font-family:\"Lexend\"} .btn{background:#0055A5} a{color:#0055a5}";

beforeAll(() => {
  pid = createProject("Tài liệu phong cách", "SD", ["L1"]).id;
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("ghi chú CSS", () => {
  it("đếm màu (gộp #abc / chữ thường) và phông đầu tiên của font-family", () => {
    const n = cssNotes(CSS + " p{color:#fff} i{color:#FFFFFF}");
    expect(n[0]).toMatch(/^Màu dùng nhiều trong CSS: #0055A5 \(3\), #FFFFFF \(2\)/);
    expect(n[1]).toBe("Phông khai báo trong CSS: Be Vietnam Pro, Lexend");
  });
});

describe("tải tài liệu phong cách", () => {
  let zipId = "", pdfId = "";
  it("ZIP: giải nén an toàn, ảnh lớn + ảnh chụp trang HTML (không JS), PDF, ghi chú CSS", async () => {
    const z = new JSZip();
    z.file("site/index.html", HTML);
    z.file("site/css/brand.css", CSS);
    z.file("site/img/hero.png", png(800, 450));
    z.file("site/img/icon.png", png(32, 32));
    z.file("guideline.pdf", PDF);
    z.file("../../thoat.png", png(400, 400));
    z.file("script.exe", "MZ");
    const r = await upload("Bộ nhận diện.zip", await z.generateAsync({ type: "uint8array" }));
    expect(r.status).toBe(200);
    const d = await r.json();
    zipId = d.id;
    expect(d.kind).toBe("zip");
    expect(d.name).toBe("Bộ nhận diện.zip");
    const labels = d.images.map((x: any) => x.label);
    expect(labels.some((l: string) => l.includes("site/img/hero.png"))).toBe(true);
    expect(labels.some((l: string) => l.includes("icon.png"))).toBe(false); // biểu tượng 32 px bị bỏ
    expect(labels.some((l: string) => l.startsWith("Ảnh chụp trang «site/index.html»"))).toBe(true);
    for (const x of d.images) expect(existsSync(x.file) && x.file.endsWith(".jpg")).toBe(true);
    expect(d.pdfs.map((f: any) => f.name)).toEqual(["guideline.pdf"]);
    expect(d.notes.join("\n")).toContain("#0055A5");
    expect(d.notes.join("\n")).toContain("Lexend");
    expect(d.notes.join("\n")).toContain("Bỏ qua 1 tệp");
    expect(existsSync(join(storage, "projects", pid, "style-refs", "thoat.png"))).toBe(false);
    expect(existsSync(join(storage, "projects", pid, "thoat.png"))).toBe(false);
    // trùng nội dung → cùng mã
    expect((await (await upload("lai.zip", await z.generateAsync({ type: "uint8array" }))).json()).id).toBe(zipId);
  }, 60_000);

  it("PDF giữ nguyên; HTML lẻ; từ chối đuôi lạ, PDF giả, ZIP hỏng, ZIP không có gì dùng được", async () => {
    const p = await (await upload("Brand guideline.pdf", PDF)).json();
    pdfId = p.id;
    expect(p.kind).toBe("pdf");
    expect(readFileSync(p.pdfs[0].file).subarray(0, 5).toString()).toBe("%PDF-");
    const h = await (await upload("trang.html", `<html><body style="background:#123456;color:#fff"><h1 style="font-family:Inter">Mẫu</h1></body></html>`)).json();
    expect(h.kind).toBe("html");
    expect(h.images).toHaveLength(1);
    expect(h.notes.join(" ")).toContain("#123456");
    expect((await (await upload("a.exe", "MZ")).json()).error).toMatch(/chỉ nhận ZIP, PDF hoặc HTML/);
    expect((await (await upload("gia.pdf", "khong phai pdf")).json()).error).toMatch(/không phải PDF/);
    expect((await (await upload("hong.zip", "PK hong")).json()).error).toMatch(/Không đọc được file ZIP/);
    const empty = new JSZip();
    empty.file("readme.txt", "x");
    expect((await (await upload("rong.zip", await empty.generateAsync({ type: "uint8array" }))).json()).error).toMatch(/Không tìm thấy ảnh/);
    const list = (await (await req(`/projects/${pid}/themes`)).json()).docs;
    expect(list.map((x: any) => x.id).sort()).toEqual([zipId, pdfId, h.id].sort());
    expect((await req(`/projects/${pid}/style-refs/doc/${h.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await req(`/projects/${pid}/style-refs/doc/${h.id}`, { method: "DELETE" })).status).toBe(404);
  }, 60_000);

  it("đề bài chỉ có tài liệu → Claude Code thấy ảnh + PDF; prompt có khối tài liệu; job API gửi PDF", async () => {
    expect((await req(`/projects/${pid}/style-gen`, { method: "POST", json: { docs: ["0000000000000000"] } })).status).toBe(400);
    expect((await req(`/projects/${pid}/style-gen`, { method: "POST", json: { docs: [zipId, pdfId] } })).status).toBe(200);
    const r = await run("style-refs", pid);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.docs).toHaveLength(2);
    for (const d of j.docs) for (const x of [...d.images, ...d.pdfs]) expect(existsSync(x.path)).toBe(true);
    const p = await run("prompt", "style-gen", pid);
    expect(p.out).toContain("TÀI LIỆU PHONG CÁCH CỦA NGƯỜI DÙNG");
    expect(p.out).toContain("«Brand guideline.pdf» (PDF)");
    expect(p.out).toContain("#0055A5");
    await expect(runStyleGen(pid, () => {})).rejects.toThrow("dừng sau khi kiểm đầu vào");
    const call = ai.calls.at(-1)!;
    expect(call.pdfs.map((f) => f.label)).toEqual(["PDF «guideline.pdf» (tài liệu Bộ nhận diện.zip)", "PDF «Brand guideline.pdf» (tài liệu Brand guideline.pdf)"]);
    expect(call.images.length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe("phong cách phim mẫu (lemo-opuscar)", () => {
  it("danh sách 66 + poster; đề bài chỉ có phong cách mẫu → prompt có STYLE.md đã trích (bỏ âm thanh/engine)", async () => {
    const list = await (await req("/film-styles")).json();
    expect(list).toHaveLength(66);
    const wb = list.find((x: any) => x.slug === "whiteboard");
    expect(wb.uses).toContain("Online courses");
    const img = await req(`/film-styles/whiteboard/poster`);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect((await req(`/film-styles/..%2F..%2Fpackage/poster`)).status).toBe(404);
    expect((await req(`/projects/${pid}/style-gen`, { method: "POST", json: { preset: "khong-co" } })).status).toBe(400);
    expect((await req(`/projects/${pid}/style-gen`, { method: "POST", json: { preset: "whiteboard" } })).status).toBe(200);
    expect(JSON.parse((await run("style-refs", pid)).out).preset).toEqual({ slug: "whiteboard", name: "Whiteboard Explainer" });
    const p = (await run("prompt", "style-gen", pid)).out;
    expect(p).toContain("PHONG CÁCH PHIM MẪU NGƯỜI DÙNG CHỌN: «Whiteboard Explainer»");
    expect(p).toContain("## 3. Colour logic");
    expect(p).not.toContain("## 7. Sound palette");
    expect(p).not.toContain("## 10. Engine");
  });
});
