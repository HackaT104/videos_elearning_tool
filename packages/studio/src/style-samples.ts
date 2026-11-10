// Mẫu video từ catalog awesome-opus5-5-videos (yihui-dev, MIT cho repo; mỗi prompt/video thuộc về tác giả của nó):
// ứng dụng KHÔNG đóng gói nội dung – tải danh sách từ GitHub khi người dùng mở (đệm 24 giờ trong storage/cache),
// người dùng chọn một mẫu → poster tải về làm ảnh tham chiếu + prompt gốc vào đề bài "Tạo phong cách bằng AI" (kèm tên tác giả, link bài gốc).

import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomic } from "@cvs/core";
import { paths } from "@cvs/db";
import { AssetError, saveAsset, type ProjectAsset } from "./assets";
import { download, STOCK_UA } from "./stock";

export const AWESOME = {
  id: "awesome",
  name: "awesome-opus5-5-videos",
  repo: "https://github.com/yihui-dev/awesome-opus5-5-videos",
  data: "https://raw.githubusercontent.com/yihui-dev/awesome-opus5-5-videos/main/data/videos.json",
  license: "MIT (repo) · prompt và video thuộc về từng tác giả",
};
/** Engine của ứng dụng là SceneSpec DOM + tween: bỏ mẫu 3D / tương tác (game). */
const KEEP = new Set(["explainer", "motion"]);
const TTL_MS = 24 * 3600_000;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
export const PRESET_PREFIX = "awesome:";
type Fetch = typeof fetch;

export type StyleSample = { slug: string; author: string; authorUrl: string; postUrl: string; category: string; tags: string[]; prompt: string; poster: string | null; remake: string | null };
export class SampleError extends Error {}

const cacheFile = () => join(paths.cache(), "awesome-opus5-5-videos.json");
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n) : "");
const httpsUrl = (v: unknown, hosts?: RegExp) => {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" && (!hosts || hosts.test(u.hostname)) ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Dữ liệu catalog là dữ liệu ngoài: chỉ nhận đúng kiểu, URL https, cắt độ dài. */
export function parseCatalog(raw: unknown): StyleSample[] {
  if (!Array.isArray(raw)) throw new SampleError("Danh sách mẫu không đúng định dạng");
  const out: StyleSample[] = [];
  for (const x of raw.slice(0, 5000)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const slug = str(o.slug, 90);
    const category = str(o.category, 30);
    const prompt = str(o.prompt, 6000);
    if (!SLUG_RE.test(slug) || !KEEP.has(category) || prompt.length < 20) continue;
    out.push({
      slug, category, prompt,
      author: str(o.author, 60),
      authorUrl: httpsUrl(o.author_url) ?? "",
      postUrl: httpsUrl(o.post_url) ?? "",
      tags: Array.isArray(o.tech_tags) ? o.tech_tags.map((t) => str(t, 20)).filter(Boolean).slice(0, 6) : [],
      poster: httpsUrl(o.poster_url, /(^|\.)skillry\.dev$/),
      remake: httpsUrl(o.skillry_url, /(^|\.)skillry\.dev$/),
    });
  }
  // giải thích (explainer) – hợp bài giảng – xếp trước
  return out.sort((a, b) => Number(b.category === "explainer") - Number(a.category === "explainer"));
}

function readCache(): { at: number; items: StyleSample[] } | null {
  try {
    const f = cacheFile();
    return { at: statSync(f).mtimeMs, items: JSON.parse(readFileSync(f, "utf8")) as StyleSample[] };
  } catch {
    return null;
  }
}

/** Danh sách mẫu (đệm 24 giờ; mạng lỗi → dùng bản đệm cũ nếu có). */
export async function listStyleSamples(o: { refresh?: boolean; fetch?: Fetch } = {}): Promise<{ items: StyleSample[]; at: string; stale: boolean }> {
  const c = readCache();
  if (c && !o.refresh && Date.now() - c.at < TTL_MS) return { items: c.items, at: new Date(c.at).toISOString(), stale: false };
  try {
    const r = await (o.fetch ?? fetch)(AWESOME.data, { headers: { "User-Agent": STOCK_UA }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new SampleError(`GitHub trả lỗi ${r.status}`);
    const text = await r.text();
    if (text.length > 20 * 1024 * 1024) throw new SampleError("Danh sách mẫu quá lớn");
    const items = parseCatalog(JSON.parse(text));
    mkdirSync(paths.cache(), { recursive: true });
    writeJsonAtomic(cacheFile(), items);
    return { items, at: new Date().toISOString(), stale: false };
  } catch (e) {
    if (c) return { items: c.items, at: new Date(c.at).toISOString(), stale: true };
    throw e instanceof SampleError ? e : new SampleError(`Không tải được danh sách mẫu (${(e as Error).message})`);
  }
}

/** Mẫu theo mã preset "awesome:<slug>" – chỉ từ bản đệm (đồng bộ, dùng khi kiểm đề bài). */
export function getStyleSample(preset: string): StyleSample | null {
  if (!preset.startsWith(PRESET_PREFIX)) return null;
  const slug = preset.slice(PRESET_PREFIX.length);
  return SLUG_RE.test(slug) ? readCache()?.items.find((x) => x.slug === slug) ?? null : null;
}

/** Nội dung cho prompt style-gen: prompt gốc + tác giả + link bài gốc. */
export function sampleBrief(s: StyleSample): { name: string; text: string; library: string } {
  return {
    name: `@${s.author} · ${s.category}`,
    library: `${AWESOME.name} – ${AWESOME.repo}`,
    text: `Tác giả: @${s.author} · bài gốc: ${s.postUrl} · công nghệ: ${s.tags.join(", ") || "?"}\n\n${s.prompt}`,
  };
}

/** Tải poster của mẫu vào ảnh dự án (làm ảnh tham chiếu). */
export async function importSamplePoster(pid: string, preset: string, f: Fetch = fetch): Promise<ProjectAsset | null> {
  const s = getStyleSample(preset);
  if (!s) throw new SampleError("Không có mẫu này – tải lại danh sách mẫu");
  if (!s.poster) return null;
  try {
    return saveAsset(pid, `Poster mẫu @${s.author} (${s.slug})`, await download(s.poster, f));
  } catch (e) {
    if (e instanceof AssetError) throw new SampleError(e.message);
    throw e;
  }
}
