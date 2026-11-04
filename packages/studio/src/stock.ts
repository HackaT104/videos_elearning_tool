// Ảnh miễn phí có ghi nguồn cho "Ảnh của cảnh": Openverse và Wikimedia Commons (không cần khoá), Pexels (khoá miễn phí người dùng nhập).
// Chỉ nhận giấy phép cho phép dùng thương mại: CC0, PDM, CC BY, CC BY-SA (BY-SA = chia sẻ tương tự) và giấy phép Pexels.
// Nhập ảnh: máy chủ hỏi lại chính nguồn theo mã (không tin URL/ghi công từ trình duyệt), tải ≤ 10 MB rồi lưu như ảnh tải lên + ghi công.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomic, type Video } from "@cvs/core";
import { REPO_ROOT, STORAGE } from "@cvs/db";
import { MAX_ASSET_BYTES, saveAsset, AssetError, type ProjectAsset } from "./assets";

export type StockSource = "openverse" | "wikimedia" | "pexels";
export type StockLicense = "CC0" | "PDM" | "CC BY" | "CC BY-SA" | "Pexels";

/** Ghi công lưu kèm ảnh (sidecar <mã>.json). */
export type ImageCredit = { source: StockSource; creator: string; license: StockLicense; licenseName: string; licenseUrl: string; url: string; title: string };
export type StockResult = ImageCredit & { id: string; thumb: string; width: number; height: number };

const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "0";
  }
})();
/** Không kèm email/thông tin cá nhân. */
export const STOCK_UA = `CourseVideoStudio/${VERSION}`;
export const SOURCE_LABEL: Record<StockSource, string> = { openverse: "Openverse", wikimedia: "Wikimedia Commons", pexels: "Pexels" };

/** Giấy phép bắt buộc ghi tác giả khi dùng (CC BY, CC BY-SA). */
export const needsAttribution = (l: StockLicense) => l === "CC BY" || l === "CC BY-SA";

/** Dòng ghi nguồn ngắn (hiện trên cảnh, credits.txt). */
export function creditLine(c: Pick<ImageCredit, "creator" | "licenseName" | "source">): string {
  return `Ảnh: ${c.creator || "không rõ tác giả"} · ${c.licenseName} · ${SOURCE_LABEL[c.source]}`;
}

type Fetch = typeof fetch;
export class StockError extends Error {}

// ---------- giới hạn tần suất + đệm (Openverse ẩn danh bị giới hạn thấp; Wikimedia yêu cầu gọi tuần tự) ----------
const last = new Map<string, number>();
const MIN_GAP_MS = 1100;
const cache = new Map<string, { at: number; v: unknown }>();
const CACHE_MS = 10 * 60_000;

async function getJson(url: string, f: Fetch, headers: Record<string, string> = {}): Promise<any> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  const host = new URL(url).host;
  const wait = (last.get(host) ?? 0) + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last.set(host, Date.now());
  let r: Response;
  try {
    r = await f(url, { headers: { "User-Agent": STOCK_UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new StockError(`Không kết nối được ${host} (${(e as Error).message})`);
  }
  if (r.status === 429) throw new StockError(`${host} đang giới hạn số lần tìm – đợi vài phút rồi thử lại`);
  if (r.status === 401 || r.status === 403) throw new StockError(`${host} từ chối truy cập (${r.status}) – kiểm tra khoá API`);
  if (!r.ok) throw new StockError(`${host} trả lỗi ${r.status}`);
  const v = await r.json();
  cache.set(url, { at: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return v;
}

const str = (x: unknown) => (typeof x === "string" ? x : "");
/** Bỏ thẻ HTML (Wikimedia trả Artist dạng HTML). */
export const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 200);

// ---------- Openverse ----------
const OV = "https://api.openverse.org/v1/images/";
const OV_LIC: Record<string, StockLicense> = { cc0: "CC0", pdm: "PDM", by: "CC BY", "by-sa": "CC BY-SA" };

export function openverseItem(x: any): StockResult | null {
  const license = OV_LIC[str(x?.license).toLowerCase()];
  if (!license || !str(x?.id) || !/^https:\/\//.test(str(x?.url))) return null;
  if (x.filetype && !/^(jpe?g|png|webp)$/i.test(x.filetype)) return null;
  const v = str(x.license_version);
  const licenseName = license === "CC0" ? "CC0 1.0" : license === "PDM" ? "Public Domain Mark 1.0" : `${license}${v ? ` ${v}` : ""}`;
  return {
    id: x.id, source: "openverse", title: str(x.title).slice(0, 200), creator: str(x.creator).slice(0, 200), license, licenseName, licenseUrl: str(x.license_url),
    url: str(x.foreign_landing_url) || str(x.url), thumb: str(x.thumbnail) || str(x.url), width: Number(x.width) || 0, height: Number(x.height) || 0,
  };
}

async function searchOpenverse(q: string, f: Fetch): Promise<StockResult[]> {
  const j = await getJson(`${OV}?${new URLSearchParams({ q, license: "cc0,pdm,by,by-sa", page_size: "20", mature: "false" })}`, f);
  return (Array.isArray(j?.results) ? j.results : []).map(openverseItem).filter(Boolean) as StockResult[];
}

// ---------- Wikimedia Commons ----------
const WM = "https://commons.wikimedia.org/w/api.php";

/** LicenseShortName của Commons → loại giấy phép nhận được (null = không dùng thương mại được / không rõ). */
export function wikimediaLicense(short: string): StockLicense | null {
  const s = short.trim();
  if (/\b(NC|ND)\b/i.test(s)) return null;
  if (/^CC0\b/i.test(s)) return "CC0";
  if (/^(Public domain|PD\b|PDM\b)/i.test(s)) return "PDM";
  if (/^CC BY-SA\b/i.test(s)) return "CC BY-SA";
  if (/^CC BY\b/i.test(s)) return "CC BY";
  return null;
}

export function wikimediaItem(p: any): StockResult | null {
  const ii = p?.imageinfo?.[0];
  const m = ii?.extmetadata ?? {};
  const short = stripHtml(str(m.LicenseShortName?.value));
  const license = wikimediaLicense(short);
  if (!ii || !license || !/^image\/(jpeg|png|webp|svg\+xml)$/.test(str(ii.mime))) return null;
  return {
    id: String(p.pageid), source: "wikimedia", title: stripHtml(str(m.ObjectName?.value)) || str(p.title).replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
    creator: stripHtml(str(m.Artist?.value)), license, licenseName: short, licenseUrl: str(m.LicenseUrl?.value), url: str(ii.descriptionurl),
    thumb: str(ii.thumburl) || str(ii.url), width: Number(ii.width) || 0, height: Number(ii.height) || 0,
  };
}

const wmParams = (extra: Record<string, string>, width: number) =>
  new URLSearchParams({
    action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(width),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ObjectName", ...extra,
  });

async function searchWikimedia(q: string, f: Fetch): Promise<StockResult[]> {
  const j = await getJson(`${WM}?${wmParams({ generator: "search", gsrsearch: `${q} filetype:bitmap|drawing`, gsrnamespace: "6", gsrlimit: "20" }, 480)}`, f);
  const pages = Array.isArray(j?.query?.pages) ? [...j.query.pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) : [];
  return pages.map(wikimediaItem).filter(Boolean) as StockResult[];
}

// ---------- Pexels (khoá miễn phí; giấy phép Pexels cho phép dùng thương mại, không bắt buộc ghi công nhưng nên ghi) ----------
const PX = "https://api.pexels.com/v1/";
export function pexelsItem(x: any): StockResult | null {
  if (!x?.id || !x?.src) return null;
  return {
    id: String(x.id), source: "pexels", title: str(x.alt).slice(0, 200), creator: str(x.photographer).slice(0, 200), license: "Pexels", licenseName: "Giấy phép Pexels",
    licenseUrl: "https://www.pexels.com/license/", url: str(x.url), thumb: str(x.src.medium) || str(x.src.small), width: Number(x.width) || 0, height: Number(x.height) || 0,
  };
}
async function searchPexels(q: string, key: string, f: Fetch): Promise<StockResult[]> {
  const j = await getJson(`${PX}search?${new URLSearchParams({ query: q, per_page: "20" })}`, f, { Authorization: key });
  return (Array.isArray(j?.photos) ? j.photos : []).map(pexelsItem).filter(Boolean) as StockResult[];
}

// ---------- cài đặt (khoá Pexels) – lưu ở storage/stock.json, không trả khoá về trình duyệt ----------
const settingsFile = () => join(STORAGE, "stock.json");
export function stockSettings(): { pexelsKey?: string } {
  try {
    return existsSync(settingsFile()) ? JSON.parse(readFileSync(settingsFile(), "utf8")) : {};
  } catch {
    return {};
  }
}
export function setPexelsKey(key: string | null) {
  const k = (key ?? "").trim();
  if (k && !/^[A-Za-z0-9]{20,100}$/.test(k)) throw new StockError("Khoá Pexels không đúng dạng");
  writeJsonAtomic(settingsFile(), { ...stockSettings(), pexelsKey: k || undefined });
}

export async function searchStock(q: string, o: { sources?: StockSource[]; fetch?: Fetch } = {}): Promise<{ results: StockResult[]; errors: string[]; sources: StockSource[] }> {
  const query = q.trim().slice(0, 100);
  if (!query) throw new StockError("Nhập từ khoá tìm ảnh");
  const f = o.fetch ?? fetch;
  const key = stockSettings().pexelsKey;
  const sources = (o.sources ?? ["openverse", "wikimedia", "pexels"]).filter((s) => s !== "pexels" || key);
  const run: Record<StockSource, () => Promise<StockResult[]>> = { openverse: () => searchOpenverse(query, f), wikimedia: () => searchWikimedia(query, f), pexels: () => searchPexels(query, key!, f) };
  const all = await Promise.allSettled(sources.map((s) => run[s]()));
  const results: StockResult[] = [];
  const errors: string[] = [];
  all.forEach((r, i) => (r.status === "fulfilled" ? results.push(...r.value) : errors.push(`${SOURCE_LABEL[sources[i]]}: ${(r.reason as Error).message}`)));
  return { results, errors, sources };
}

/** URL tải: chỉ https, không trỏ vào máy nội bộ. */
function safeUrl(u: string): string {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new StockError("Địa chỉ ảnh không hợp lệ");
  }
  if (url.protocol !== "https:" || /^(localhost|\[|\d+\.\d+\.\d+\.\d+$)/i.test(url.hostname) || url.hostname.endsWith(".local")) throw new StockError("Địa chỉ ảnh không được phép");
  return url.toString();
}

async function download(u: string, f: Fetch): Promise<Buffer> {
  const r = await f(safeUrl(u), { headers: { "User-Agent": STOCK_UA }, signal: AbortSignal.timeout(60_000) }).catch((e) => {
    throw new StockError(`Không tải được ảnh (${(e as Error).message})`);
  });
  if (!r.ok || !r.body) throw new StockError(`Không tải được ảnh (mã ${r.status})`);
  if (Number(r.headers.get("content-length") ?? 0) > MAX_ASSET_BYTES) throw new StockError("Ảnh gốc quá lớn (> 10 MB)");
  const parts: Buffer[] = [];
  let n = 0;
  for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
    n += c.length;
    if (n > MAX_ASSET_BYTES) throw new StockError("Ảnh gốc quá lớn (> 10 MB)");
    parts.push(Buffer.from(c));
  }
  return Buffer.concat(parts);
}

/** Nhập ảnh vào dự án: hỏi lại nguồn theo mã → tải (Wikimedia: bản 1920 px, Pexels: large2x) → lưu kèm ghi công. */
export async function importStock(projectId: string, source: StockSource, id: string, f: Fetch = fetch): Promise<ProjectAsset> {
  let item: StockResult | null = null;
  let src = "";
  if (source === "openverse") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new StockError("Mã ảnh Openverse không hợp lệ");
    const j = await getJson(`${OV}${id}/`, f);
    item = openverseItem(j);
    src = str(j?.url);
  } else if (source === "wikimedia") {
    if (!/^\d{1,12}$/.test(id)) throw new StockError("Mã ảnh Wikimedia không hợp lệ");
    const j = await getJson(`${WM}?${wmParams({ pageids: id }, 1920)}`, f);
    const p = j?.query?.pages?.[0];
    item = wikimediaItem(p);
    src = str(p?.imageinfo?.[0]?.thumburl) || str(p?.imageinfo?.[0]?.url);
  } else if (source === "pexels") {
    const key = stockSettings().pexelsKey;
    if (!key) throw new StockError("Chưa có khoá Pexels");
    if (!/^\d{1,12}$/.test(id)) throw new StockError("Mã ảnh Pexels không hợp lệ");
    const j = await getJson(`${PX}photos/${id}`, f, { Authorization: key });
    item = pexelsItem(j);
    src = str(j?.src?.large2x) || str(j?.src?.large) || str(j?.src?.original);
  } else throw new StockError("Nguồn ảnh không hỗ trợ");
  if (!item || !src) throw new StockError("Ảnh không còn hoặc giấy phép không cho phép dùng thương mại");
  const { id: _id, thumb: _t, width: _w, height: _h, ...credit } = item;
  try {
    return saveAsset(projectId, item.title || `${SOURCE_LABEL[source]} ${id}`, await download(src, f), credit);
  } catch (e) {
    if (e instanceof AssetError) throw new StockError(e.message);
    throw e;
  }
}

// ---------- ghi nguồn khi xuất ----------

/** Ảnh có ghi công mà video dùng (cảnh image-focus + logo), mỗi ảnh một lần. */
export function videoCredits(video: Video, credit: (assetId: string) => ImageCredit | null, logo?: string): { id: string; scenes: string[]; credit: ImageCredit }[] {
  const out = new Map<string, { id: string; scenes: string[]; credit: ImageCredit }>();
  const add = (id: unknown, where: string) => {
    if (typeof id !== "string") return;
    const c = credit(id);
    if (!c) return;
    const e = out.get(id) ?? { id, scenes: [], credit: c };
    e.scenes.push(where);
    out.set(id, e);
  };
  for (const s of video.scenes) if (s.design?.template === "image-focus") add(s.design.params.image, s.id);
  if (logo) add(logo, "logo");
  return [...out.values()];
}

/** Một dòng ghi nguồn đầy đủ (TASL: tiêu đề, tác giả, nguồn, giấy phép). */
export function attributionLine(c: ImageCredit): string {
  const sa = c.license === "CC BY-SA" ? " – chia sẻ tương tự (bản phái sinh của ảnh phải dùng cùng giấy phép)" : "";
  return `«${c.title || "không tiêu đề"}» – ${c.creator || "không rõ tác giả"} – ${c.licenseName}${c.licenseUrl ? ` (${c.licenseUrl})` : ""}${sa} – ${SOURCE_LABEL[c.source]}: ${c.url}`;
}
