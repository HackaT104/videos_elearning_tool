// Tư liệu phong cách dạng tài liệu: ZIP (bộ nhận diện, mẫu web…), PDF (brand guideline), HTML (trang mẫu).
// Mỗi tài liệu → thư mục style-refs/docs/<id>: ảnh thu nhỏ (ảnh trong ZIP, ảnh chụp trang HTML), PDF giữ nguyên để Claude đọc
// (API: khối document; Claude Code: Read), ghi chú màu/phông bóc từ CSS. HTML dựng KHÔNG chạy JavaScript, chặn mạng ngoài.

import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, posix, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { writeJsonAtomic } from "@cvs/core";
import { paths } from "@cvs/db";
import { rasterSize } from "@cvs/engine";
import { launchBrowser } from "@cvs/engine-hf";
import { ffmpeg } from "@cvs/tts";

export const MAX_STYLE_DOC_BYTES = 100 * 1024 * 1024;
export const MAX_STYLE_DOCS = 4;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;
const MAX_UNZIPPED = 300 * 1024 * 1024;
const MAX_DOC_IMAGES = 8;
const MAX_HTML_PAGES = 2;
const SHOTS_PER_PAGE = 2;
const DOC_EXT = [".zip", ".pdf", ".html", ".htm"];
const KEEP_IN_ZIP = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".html", ".htm", ".css", ".svg", ".woff", ".woff2", ".ttf", ".otf"]);
const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const ID_RE = /^[a-f0-9]{16}$/;

export type StyleDoc = {
  id: string;
  name: string;
  kind: "zip" | "pdf" | "html";
  size: number;
  /** Ảnh gửi cho Claude (JPEG ≤ 1280 px): ảnh trong ZIP, ảnh chụp trang HTML. */
  images: { file: string; label: string }[];
  /** PDF gửi nguyên cho Claude. */
  pdfs: { file: string; name: string; size: number }[];
  /** Màu / phông dùng nhiều trong CSS, cảnh báo khi bỏ qua tệp. */
  notes: string[];
  created: string;
};
export class StyleDocError extends Error {}

const docsDir = (pid: string) => join(paths.styleRefs(pid), "docs");
const metaFile = (pid: string, id: string) => join(docsDir(pid), `${id}.json`);
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);

export function styleDoc(pid: string, id: string): StyleDoc | null {
  if (!ID_RE.test(id)) return null;
  try {
    return JSON.parse(readFileSync(metaFile(pid, id), "utf8")) as StyleDoc;
  } catch {
    return null;
  }
}
export function listStyleDocs(pid: string): StyleDoc[] {
  const d = docsDir(pid);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => styleDoc(pid, f.slice(0, -5))).filter((v): v is StyleDoc => !!v).sort((a, b) => b.created.localeCompare(a.created));
}
export function deleteStyleDoc(pid: string, id: string): boolean {
  if (!styleDoc(pid, id)) return false;
  rmSync(join(docsDir(pid), id), { recursive: true, force: true });
  rmSync(metaFile(pid, id), { force: true });
  return true;
}
export const isStyleDocName = (name: string) => DOC_EXT.includes(extname(name).toLowerCase());

/** Lưu tài liệu (luồng, ≤ 100 MB), trùng nội dung → cùng mã; rồi bóc ảnh / chụp trang / giữ PDF. */
export async function saveStyleDoc(pid: string, name: string, body: AsyncIterable<Uint8Array>): Promise<StyleDoc> {
  const ext = extname(name).toLowerCase();
  if (!DOC_EXT.includes(ext)) throw new StyleDocError("Tài liệu phong cách chỉ nhận ZIP, PDF hoặc HTML");
  const d = docsDir(pid);
  mkdirSync(d, { recursive: true });
  const tmp = join(d, `.tai-${randomBytes(4).toString("hex")}${ext}`);
  const hash = createHash("sha256");
  let size = 0;
  try {
    const out = createWriteStream(tmp);
    let werr: Error | null = null;
    out.on("error", (e) => (werr = e));
    try {
      for await (const chunk of body) {
        size += chunk.length;
        if (size > MAX_STYLE_DOC_BYTES) throw new StyleDocError("Tài liệu quá lớn (tối đa 100 MB)");
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise<void>((r) => (out.once("drain", () => r()), out.once("error", () => r())));
        if (werr) break;
      }
    } finally {
      await new Promise<void>((r) => (werr ? r() : out.end(r)));
    }
    if (werr) throw new StyleDocError(`Không ghi được tài liệu: ${(werr as Error).message}`);
    if (!size) throw new StyleDocError("File rỗng");
    const id = hash.digest("hex").slice(0, 16);
    const have = styleDoc(pid, id);
    if (have) return have;
    const dir = join(d, id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    const doc: StyleDoc = { id, name: clean(name), kind: ext === ".zip" ? "zip" : ext === ".pdf" ? "pdf" : "html", size, images: [], pdfs: [], notes: [], created: new Date().toISOString() };
    try {
      if (doc.kind === "pdf") {
        const head = readFileSync(tmp).subarray(0, 5).toString("latin1");
        if (head !== "%PDF-") throw new StyleDocError("File không phải PDF");
        if (size > MAX_PDF_BYTES) throw new StyleDocError("PDF quá lớn để gửi cho Claude (tối đa 20 MB) – tách bớt trang hoặc xuất ảnh");
        const f = join(dir, "src", "tai-lieu.pdf");
        renameSync(tmp, f);
        doc.pdfs.push({ file: f, name: doc.name, size });
      } else if (doc.kind === "html") {
        const f = join(dir, "src", "index.html");
        renameSync(tmp, f);
        await digest(dir, doc, [f], [], []);
      } else {
        const { html, rasters, pdfs } = await unzip(tmp, join(dir, "src"), doc.notes);
        await digest(dir, doc, html, rasters, pdfs);
      }
      if (!doc.images.length && !doc.pdfs.length) throw new StyleDocError("Không tìm thấy ảnh, trang HTML hay PDF nào dùng được trong tài liệu");
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    writeJsonAtomic(metaFile(pid, id), doc);
    return doc;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Giải nén có giới hạn (số mục, tổng dung lượng), chặn đường dẫn thoát thư mục; chỉ giữ ảnh/PDF/HTML/CSS/phông. */
async function unzip(file: string, out: string, notes: string[]): Promise<{ html: string[]; rasters: string[]; pdfs: string[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(file));
  } catch {
    throw new StyleDocError("Không đọc được file ZIP (hỏng hoặc có mật khẩu)");
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ZIP_ENTRIES) throw new StyleDocError(`ZIP có quá nhiều tệp (${entries.length} > ${MAX_ZIP_ENTRIES})`);
  const root = resolve(out);
  let total = 0;
  let skipped = 0;
  const html: string[] = [], rasters: string[] = [], pdfs: string[] = [];
  for (const e of entries) {
    const rel = posix.normalize(e.name.replace(/\\/g, "/"));
    if (rel.startsWith("../") || rel.startsWith("/") || /^[a-z]:/i.test(rel) || rel.split("/").some((p) => p.startsWith("__MACOSX") || p === ".DS_Store")) continue;
    const ext = extname(rel).toLowerCase();
    if (!KEEP_IN_ZIP.has(ext)) {
      skipped++;
      continue;
    }
    const dst = resolve(root, ...rel.split("/"));
    if (!dst.startsWith(root + sep)) continue;
    const declared = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (total + declared > MAX_UNZIPPED) throw new StyleDocError("ZIP giải nén ra quá lớn (tối đa 300 MB)");
    const data = await e.async("uint8array");
    total += data.length;
    if (total > MAX_UNZIPPED) throw new StyleDocError("ZIP giải nén ra quá lớn (tối đa 300 MB)");
    mkdirSync(resolve(dst, ".."), { recursive: true });
    writeFileSync(dst, data);
    if (ext === ".html" || ext === ".htm") html.push(dst);
    else if (ext === ".pdf") pdfs.push(dst);
    else if (RASTER.has(ext)) rasters.push(dst);
  }
  if (skipped) notes.push(`Bỏ qua ${skipped} tệp không phải ảnh/PDF/HTML/CSS/phông trong ZIP`);
  return { html, rasters, pdfs };
}

/** Ảnh thu nhỏ (cạnh dài ≤ 1280, JPEG) – ảnh gốc lớn vượt giới hạn ảnh của API. */
async function shrink(src: string, dst: string): Promise<boolean> {
  try {
    await ffmpeg(["-i", src, "-frames:v", "1", "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease", "-q:v", "3", dst]);
    return existsSync(dst) && statSync(dst).size > 0;
  } catch {
    return false;
  }
}

async function digest(dir: string, doc: StyleDoc, html: string[], rasters: string[], pdfs: string[]) {
  const src = join(dir, "src");
  const relName = (f: string) => relative(src, f).split(sep).join("/");
  // PDF: tối đa 2, mỗi cái ≤ 20 MB
  for (const f of pdfs.slice(0, 2)) {
    const s = statSync(f).size;
    if (s <= MAX_PDF_BYTES && readFileSync(f).subarray(0, 5).toString("latin1") === "%PDF-") doc.pdfs.push({ file: f, name: relName(f), size: s });
    else doc.notes.push(`Bỏ qua ${relName(f)} (không phải PDF hoặc lớn hơn 20 MB)`);
  }
  if (pdfs.length > 2) doc.notes.push(`Chỉ gửi 2/${pdfs.length} PDF đầu tiên`);
  // ảnh: bỏ biểu tượng nhỏ (< 160 px), ưu tiên ảnh lớn
  const sized = rasters
    .map((f) => {
      try {
        const buf = readFileSync(f);
        const sz = rasterSize(buf);
        return sz && Math.min(sz.w, sz.h) >= 160 ? { f, area: sz.w * sz.h } : null;
      } catch {
        return null;
      }
    })
    .filter((x): x is { f: string; area: number } => !!x)
    .sort((a, b) => b.area - a.area);
  mkdirSync(join(dir, "img"), { recursive: true });
  let k = 0;
  for (const { f } of sized.slice(0, MAX_DOC_IMAGES)) {
    const out = join(dir, "img", `anh-${String(++k).padStart(2, "0")}.jpg`);
    if (await shrink(f, out)) doc.images.push({ file: out, label: `Ảnh «${relName(f)}» trong ${doc.name}` });
  }
  if (sized.length > MAX_DOC_IMAGES) doc.notes.push(`Chỉ gửi ${MAX_DOC_IMAGES}/${sized.length} ảnh lớn nhất`);
  // HTML: ưu tiên index.html, nông nhất
  const pages = html.sort((a, b) => score(relName(a)) - score(relName(b))).slice(0, MAX_HTML_PAGES);
  if (pages.length) await shoot(pages, src, dir, doc, relName);
  // màu / phông từ CSS + HTML
  const css = listFiles(src).filter((f) => /\.(css|html?)$/i.test(f)).slice(0, 50).map((f) => readFileSync(f, "utf8").slice(0, 2_000_000)).join("\n");
  doc.notes.push(...cssNotes(css));
}
const score = (rel: string) => rel.split("/").length * 10 + (/(^|\/)index\.html?$/i.test(rel) ? 0 : 5);
const listFiles = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(d, e.name)) : [join(d, e.name)]));

/** Chụp trang HTML 1920×1080 (tối đa 2 khung theo chiều dọc): không JavaScript, chỉ tải tệp nằm trong thư mục tài liệu. */
async function shoot(pages: string[], src: string, dir: string, doc: StyleDoc, relName: (f: string) => string) {
  const root = pathToFileURL(src).href;
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    doc.notes.push(`Không mở được trình duyệt để chụp trang HTML: ${(e as Error).message.split("\n")[0]}`);
    return;
  }
  try {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      return u.startsWith(root) || u.startsWith("data:") ? r.continue() : r.abort();
    });
    let k = 0;
    for (const f of pages) {
      const page = await ctx.newPage();
      try {
        await page.goto(pathToFileURL(f).href, { waitUntil: "load", timeout: 20_000 });
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let i = 0; i < SHOTS_PER_PAGE && i * 1080 < h; i++) {
          const png = join(dir, "img", `trang-${++k}.png`);
          await page.screenshot({ path: png, fullPage: true, clip: { x: 0, y: i * 1080, width: 1920, height: Math.min(1080, h - i * 1080) } });
          const jpg = png.replace(/\.png$/, ".jpg");
          if (await shrink(png, jpg)) doc.images.push({ file: jpg, label: `Ảnh chụp trang «${relName(f)}»${i ? ` (cuộn xuống ${i * 1080} px)` : ""}` });
          rmSync(png, { force: true });
        }
      } catch (e) {
        doc.notes.push(`Không dựng được trang ${relName(f)}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

/** Màu hex và phông dùng nhiều nhất trong CSS/HTML (gợi ý cho Claude, không phải chỉ dẫn). */
export function cssNotes(text: string): string[] {
  const colors = new Map<string, number>();
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toUpperCase();
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    colors.set(`#${h}`, (colors.get(`#${h}`) ?? 0) + 1);
  }
  const fonts = new Map<string, number>();
  for (const m of text.matchAll(/font-family\s*:\s*([^;}{"]+|"[^"]+"[^;}{]*)/gi)) {
    const first = m[1].split(",")[0].trim().replace(/^['"]|['"]$/g, "").replace(/!important/i, "").trim();
    if (first && first.length < 60 && !/^(inherit|initial|var\()/i.test(first)) fonts.set(first, (fonts.get(first) ?? 0) + 1);
  }
  const top = <T,>(m: Map<T, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  const out: string[] = [];
  if (colors.size) out.push(`Màu dùng nhiều trong CSS: ${top(colors, 10).map(([c, n]) => `${c} (${n})`).join(", ")}`);
  if (fonts.size) out.push(`Phông khai báo trong CSS: ${top(fonts, 6).map(([f]) => f).join(", ")}`);
  return out;
}
