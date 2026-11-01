// Ảnh của dự án (ảnh chụp màn hình, ảnh hiện trường) và hình minh hoạ AI vẽ cho template "illustration".
// Ảnh: kiểm định dạng theo nội dung file (không tin đuôi/MIME), SVG lọc bằng allow-list, tên = hash nội dung + kích thước.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha1, writeFileAtomic, writeJsonAtomic, type Video } from "@cvs/core";
import { aiAvailable, drawIllustration } from "@cvs/ai";
import { paths } from "@cvs/db";
import { ASSET_ID_RE, illustrationStyleHints, makeAssetId, parseAssetId, rasterSize, sanitizeSvg, type AssetExt } from "@cvs/engine";
import { getTheme } from "@cvs/themes";

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 12_000;

export class AssetError extends Error {}

export type ProjectAsset = { id: string; url: string; w: number; h: number; ext: AssetExt; name: string; size: number; created: string };

export const assetUrl = (projectId: string, id: string) => `/api/projects/${encodeURIComponent(projectId)}/assets/${id}`;

/** Đường dẫn file ảnh nếu mã hợp lệ và có file. */
export function assetFile(projectId: string, id: string): string | null {
  if (!ASSET_ID_RE.test(id)) return null;
  const f = join(paths.assets(projectId), id);
  return existsSync(f) ? f : null;
}

function describe(projectId: string, id: string): ProjectAsset | null {
  const meta = parseAssetId(id);
  const f = assetFile(projectId, id);
  if (!meta || !f) return null;
  let side: { name?: string; created?: string } = {};
  try {
    side = JSON.parse(readFileSync(`${f}.json`, "utf8"));
  } catch {
    /* thiếu thông tin phụ */
  }
  const st = statSync(f);
  return { id, url: assetUrl(projectId, id), w: meta.w, h: meta.h, ext: meta.ext, name: side.name || id, size: st.size, created: side.created ?? st.mtime.toISOString() };
}

/** Lưu ảnh tải lên. PNG/JPEG/WebP nhận theo chữ ký file; còn lại thử như SVG (lọc an toàn). Trùng nội dung → cùng mã. */
export function saveAsset(projectId: string, name: string, data: Buffer): ProjectAsset {
  if (data.length === 0) throw new AssetError("File rỗng");
  if (data.length > MAX_ASSET_BYTES) throw new AssetError(`Ảnh quá lớn (${(data.length / 1048576).toFixed(1)} MB > 10 MB)`);
  let w: number, h: number, ext: AssetExt;
  let body = data;
  const r = rasterSize(data);
  if (r) ({ w, h, ext } = r);
  else {
    const text = data.toString("utf8").replace(/^\uFEFF/, "");
    if (!/^\s*</.test(text) || !/<svg[\s>/]/.test(text.slice(0, 16384))) throw new AssetError("Chỉ nhận ảnh PNG, JPG, WebP hoặc SVG");
    const s = sanitizeSvg(text, "asset");
    if (!s.svg) throw new AssetError(`SVG không dùng được: ${s.error}`);
    body = Buffer.from(s.svg, "utf8");
    [w, h] = [s.viewBox![2], s.viewBox![3]];
    // viewBox nhỏ (icon 24×24) → giữ tỉ lệ, phóng mã kích thước cho dễ đọc
    const k = Math.max(1, 1000 / Math.max(w, h));
    [w, h] = [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
    ext = "svg";
  }
  if (!(w > 0 && h > 0) || w > MAX_SIDE || h > MAX_SIDE) throw new AssetError(`Kích thước ảnh không hợp lệ (${w}×${h})`);
  const id = makeAssetId(createHash("sha256").update(body).digest("hex"), w, h, ext);
  const dir = paths.assets(projectId);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, id);
  if (!existsSync(f)) writeFileAtomic(f, body);
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || id;
  if (!existsSync(`${f}.json`)) writeJsonAtomic(`${f}.json`, { name: clean, created: new Date().toISOString() });
  return describe(projectId, id)!;
}

export function listAssets(projectId: string): ProjectAsset[] {
  const dir = paths.assets(projectId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => ASSET_ID_RE.test(f))
    .map((f) => describe(projectId, f))
    .filter((a): a is ProjectAsset => !!a)
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function deleteAsset(projectId: string, id: string): boolean {
  const f = assetFile(projectId, id);
  if (!f) return false;
  rmSync(f, { force: true });
  rmSync(`${f}.json`, { force: true });
  return true;
}

// ---------- Hình minh hoạ AI vẽ ----------

/** Khoá đệm: mô tả + theme (nét/độ tối ảnh hưởng cách vẽ). */
export const illustrationKey = (brief: string, style: string, strokeWidth: number, dark: boolean) => sha1(`${brief.trim()}|${style}|${strokeWidth}|${dark}`).slice(0, 16);

/**
 * Cảnh "illustration" có brief mà chưa có SVG (hoặc SVG vẽ cho brief cũ) → Claude vẽ, lọc, lưu đệm theo khoá rồi ghi vào params.
 * Không có Claude / lỗi → giữ nguyên (template hiện khung giữ chỗ). Trả về số cảnh đã điền.
 */
export async function fillIllustrations(projectId: string, video: Video, log: (s: string) => void = () => {}): Promise<number> {
  const theme = getTheme(video.style, video.font);
  const hints = illustrationStyleHints(theme);
  const dir = join(paths.project(projectId), "illustrations");
  let n = 0;
  for (const scene of video.scenes) {
    const d = scene.design;
    if (d?.template !== "illustration") continue;
    const brief = typeof d.params.brief === "string" ? d.params.brief.trim() : "";
    if (!brief) continue;
    const key = illustrationKey(brief, video.style, hints.strokeWidth, hints.dark);
    if (typeof d.params.svg === "string" && d.params.svg && (d.params.svgKey === undefined || d.params.svgKey === key)) continue;
    const file = join(dir, `${key}.svg`);
    let svg: string | null = null;
    if (existsSync(file)) svg = sanitizeSvg(readFileSync(file, "utf8"), "illustration").svg;
    if (!svg) {
      if (!aiAvailable()) continue;
      try {
        svg = (await drawIllustration(brief, hints)).svg;
        mkdirSync(dir, { recursive: true });
        writeFileAtomic(file, svg);
      } catch (e) {
        log(`Vẽ minh hoạ ${scene.id} lỗi: ${(e as Error).message}\n`);
        continue;
      }
    }
    scene.design = { ...d, params: { ...d.params, svg, svgKey: key } };
    n++;
  }
  return n;
}
