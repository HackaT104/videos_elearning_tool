// 66 phong cách phim mẫu từ lemo-opuscar (LemoLab, MIT – xem film-styles/LICENSE-lemo-opuscar.txt, THIRD-PARTY.md):
// mỗi phong cách một STYLE.md (bản chất, logic màu, chữ, chuyển động, camera…) + ảnh poster thu nhỏ (CC BY 4.0, đã thu nhỏ).
// Dùng làm "phong cách mẫu" cho việc tạo phong cách bằng AI: Claude chuyển tinh thần phim sang theme (màu, phông Việt, nền, nhịp).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FILM_STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "film-styles");
export type FilmStyle = { slug: string; en: string; category_en: string; uses: string[]; film: string; line: string };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

let cache: FilmStyle[] | null = null;
export function listFilmStyles(): FilmStyle[] {
  cache ??= JSON.parse(readFileSync(join(FILM_STYLES_DIR, "index.json"), "utf8")) as FilmStyle[];
  return cache;
}
export const getFilmStyle = (slug: string) => (SLUG_RE.test(slug) ? listFilmStyles().find((s) => s.slug === slug) ?? null : null);
export function filmStylePoster(slug: string): string | null {
  if (!getFilmStyle(slug)) return null;
  const f = join(FILM_STYLES_DIR, "posters", `${slug}.jpg`);
  return existsSync(f) ? f : null;
}

// Mục hữu ích cho theme video bài giảng: bỏ chất liệu canvas (2), âm thanh (7), engine (10).
const KEEP = [/^1\./, /^3\./, /^4\./, /^5\./, /^6\./, /^8\./, /^9\./, /^11\./];

/** Trích STYLE.md: tiêu đề + tóm tắt + các mục màu/chữ/chuyển động/camera/lỗi hay gặp, cắt ở `max` ký tự. */
export function filmStyleBrief(slug: string, max = 9000): string | null {
  if (!getFilmStyle(slug)) return null;
  const md = readFileSync(join(FILM_STYLES_DIR, `${slug}.md`), "utf8");
  const parts = md.split(/^## /m);
  const head = parts[0].trim();
  const keep = parts.slice(1).filter((p) => KEEP.some((r) => r.test(p))).map((p) => `## ${p.trim()}`);
  const out = [head, ...keep].join("\n\n");
  return out.length > max ? `${out.slice(0, max)}\n…(đã cắt)` : out;
}
