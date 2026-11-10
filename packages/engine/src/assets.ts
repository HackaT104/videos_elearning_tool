// Ảnh của dự án (người dùng tải lên): mã ảnh = <hash nội dung>-<rộng>x<cao>.<đuôi> – template đọc tỉ lệ khung từ chính mã,
// cảnh tham chiếu bằng đường dẫn tương đối "assets/img/<mã>" (bộ dựng chép ảnh vào thư mục làm việc).

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export const IMG_DIR = "assets/img/";
/** Clip hoạt hình vẽ tay đã render (@cvs/engine-brush): <mã đệm>.mp4, cảnh tham chiếu "assets/cartoon/<file>". */
export const CLIP_DIR = "assets/cartoon/";
export const CLIP_FILE_RE = /^[a-f0-9]{16}\.mp4$/;
export const ASSET_ID_RE = /^[a-f0-9]{16}-(\d{1,5})x(\d{1,5})\.(png|jpg|webp|svg)$/;
export const ASSET_EXT = ["png", "jpg", "webp", "svg"] as const;
export type AssetExt = (typeof ASSET_EXT)[number];

export function makeAssetId(hash: string, w: number, h: number, ext: AssetExt): string {
  return `${hash.slice(0, 16)}-${Math.round(w)}x${Math.round(h)}.${ext}`;
}

/** Kích thước ghi trong mã ảnh, hoặc null nếu mã không hợp lệ. */
export function parseAssetId(id: unknown): { w: number; h: number; ext: AssetExt } | null {
  const m = typeof id === "string" ? ASSET_ID_RE.exec(id) : null;
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h, ext: m[3] as AssetExt } : null;
}

/** Mã ảnh được cảnh tham chiếu (src="assets/img/<mã>"). */
export function sceneImageRefs(html: string): string[] {
  return [...new Set([...html.matchAll(/\ssrc="assets\/img\/([^"]+)"/g)].map((m) => m[1]))];
}

/** Bỏ thẻ <img> trỏ tới ảnh không còn (khung giữ chỗ bên dưới hiện ra; Remotion không treo chờ ảnh lỗi). */
export function dropMissingImages(html: string, has: (id: string) => boolean): string {
  return html.replace(/<img\b[^>]*\ssrc="assets\/img\/([^"]+)"[^>]*>/g, (tag, id: string) => (ASSET_ID_RE.test(id) && has(id) ? tag : ""));
}

/**
 * Chép ảnh được dùng (mã trong refs, có trong assetsDir) vào <workDir>/assets/img; xoá ảnh cũ không còn dùng.
 * Trả về mã ảnh thiếu (cảnh tham chiếu nhưng không có file).
 */
export function syncSceneImages(refs: Iterable<string>, assetsDir: string | undefined, workDir: string): { missing: string[] } {
  return syncRefs(refs, assetsDir, workDir, IMG_DIR, ASSET_ID_RE);
}

/** Clip hoạt hình được cảnh tham chiếu (src="assets/cartoon/<file>"). */
export function sceneClipRefs(html: string): string[] {
  return [...new Set([...html.matchAll(/\ssrc="assets\/cartoon\/([^"]+)"/g)].map((m) => m[1]))];
}
/** Chép clip hoạt hình cảnh dùng (từ thư mục clip của dự án) vào <workDir>/assets/cartoon; xoá clip cũ. */
export function syncSceneClips(refs: Iterable<string>, clipsDir: string | undefined, workDir: string): { missing: string[] } {
  return syncRefs(refs, clipsDir, workDir, CLIP_DIR, CLIP_FILE_RE);
}

function syncRefs(refs: Iterable<string>, assetsDir: string | undefined, workDir: string, dirRel: string, re: RegExp): { missing: string[] } {
  const out = join(workDir, ...dirRel.split("/").filter(Boolean));
  const want = new Set([...refs].filter((id) => re.test(id)));
  const missing: string[] = [];
  if (want.size) mkdirSync(out, { recursive: true });
  for (const id of want) {
    const src = assetsDir ? join(assetsDir, id) : "";
    const dst = join(out, id);
    if (!src || !existsSync(src)) {
      missing.push(id);
      continue;
    }
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
  }
  if (existsSync(out)) for (const f of readdirSync(out)) if (!want.has(f) || missing.includes(f)) rmSync(join(out, f), { force: true });
  return { missing };
}

/** Có file ảnh trong thư mục ảnh dự án. */
export function assetExists(assetsDir: string | undefined, id: string): boolean {
  return !!assetsDir && ASSET_ID_RE.test(id) && existsSync(join(assetsDir, id));
}

/** Kích thước ảnh PNG/JPEG/WebP từ phần đầu file (không giải mã), null nếu không nhận ra. */
export function rasterSize(buf: Uint8Array): { w: number; h: number; ext: Exclude<AssetExt, "svg"> } | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("ascii", 12, 16) === "IHDR") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ext: "png" };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const mk = b[i + 1];
      if (mk === 0xff) {
        i++;
        continue;
      }
      if (mk === 0xd8 || (mk >= 0xd0 && mk <= 0xd7) || mk === 0x01) {
        i += 2;
        continue;
      }
      const len = b.readUInt16BE(i + 2);
      if (len < 2) return null;
      // SOF0–SOF15 trừ DHT(C4), JPG(C8), DAC(CC)
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), ext: "jpg" };
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, ext: "webp" };
    if (kind === "VP8L" && b[20] === 0x2f) {
      const v = b.readUInt32LE(21);
      return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1, ext: "webp" };
    }
    if (kind === "VP8X") return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1, ext: "webp" };
  }
  return null;
}
