// Thư viện skill dựng cảnh (dùng chung mọi dự án, storage/skills/<mã>.json): nhập SKILL.md / file .md từ link GitHub hoặc tải lên.
// Video chọn skill (video.skill) → @cvs/ai đưa nội dung vào prompt thiết kế cảnh / cảnh tùy biến như TÀI LIỆU THAM KHẢO.
// Nội dung tải về là dữ liệu không tin cậy: bỏ khối lệnh shell, giới hạn kích thước; prompt bọc lại và luật của ứng dụng luôn thắng.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomic } from "@cvs/core";
import { CARTOON_PRINCIPLES, setSkillResolver } from "@cvs/ai";
import { listProjects, listVideos, paths } from "@cvs/db";
import { STOCK_UA } from "./stock";

export type Skill = { id: string; name: string; description: string; source: string; license: string | null; text: string; added: string; builtin?: boolean };
export type SkillSum = Omit<Skill, "text"> & { chars: number };
type Fetch = typeof fetch;

export const MAX_SKILL_BYTES = 300 * 1024;
export const MAX_SKILL_CHARS = 60_000;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
export class SkillError extends Error {}

/** Gợi ý nhập nhanh (người dùng vẫn bấm "Thêm" – ứng dụng không đóng gói sẵn nội dung). */
export const SKILL_SUGGESTIONS = [
  { name: "Đạo diễn phim – lemo-opuscar (DIRECTOR.md)", url: "https://github.com/lemomo-ai/lemo-opuscar/blob/main/DIRECTOR.md", license: "MIT · © LemoLab" },
];

const file = (id: string) => join(paths.skills(), `${id}.json`);

/** Skill có sẵn (đóng gói cùng ứng dụng, không xoá được). */
export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "san-co-hoat-hinh-ve-tay",
    name: "Hoạt hình vẽ tay (nguyên tắc)",
    description: "Nhịp kể theo người xem, luôn sống động, có sự kiện mỗi cảnh, chuyển động có chuẩn bị và theo đà – áp vào template thường; cảnh hoạt hình có nhân vật dùng template cartoon.",
    source: "Có sẵn – rút từ Claude Animation Base (John Heibel)",
    license: "MIT",
    added: "2026-11-10T00:00:00.000Z",
    builtin: true,
    text: `${CARTOON_PRINCIPLES}

ÁP VÀO CẢNH TEMPLATE (không phải cảnh hoạt hình):
- "Read" = câu thoại: mỗi câu một tiêu điểm mới, đặt at {cue, f} cho phần tử chính ở f 0,05–0,2 và GIỮ nó tới khi câu sau bắt đầu; không dồn hai ý vào một câu.
- Chuẩn bị & theo đà: phần tử chính vào bằng ease có vượt nhẹ (back.out 1.4–1.7) cho biểu tượng/con số; phần phụ trễ 0,1–0,2 s (stagger), không cùng lúc.
- Sống động: chọn template có lớp chuyển động (nét vẽ ra – draw, cột mọc, bộ đếm, sơ đồ lớn dần) hơn khối chữ; nửa sau cảnh vẫn có thứ mới.
- Sự kiện mỗi cảnh: khung cuối khác khung đầu (một thay đổi trạng thái: sai → đúng, rủi ro → kiểm soát, con số tăng/giảm).
- Phong cách hợp: theme "Bảng trắng vẽ tay", "Ấm mộc", "Pastel học đường" (nét run tay, màu mềm). Khi dự án bật hoạt hình vẽ tay, 1–3 khoảnh khắc cần cảm xúc/tình huống mỗi video dùng template "cartoon".`,
  },
];

export function getSkill(id: string): Skill | null {
  const b = BUILTIN_SKILLS.find((s) => s.id === id);
  if (b) return b;
  if (!ID_RE.test(id)) return null;
  try {
    return JSON.parse(readFileSync(file(id), "utf8")) as Skill;
  } catch {
    return null;
  }
}

export function listSkills(): SkillSum[] {
  const sum = ({ text, ...s }: Skill): SkillSum => ({ ...s, chars: text.length });
  const builtin = BUILTIN_SKILLS.map(sum);
  if (!existsSync(paths.skills())) return builtin;
  return [...builtin, ...readdirSync(paths.skills())
    .filter((f) => f.endsWith(".json"))
    .map((f) => getSkill(f.slice(0, -5)))
    .filter((s): s is Skill => !!s && !s.builtin)
    .map(sum)
    .sort((a, b) => a.added.localeCompare(b.added))];
}

/** Dự án/video đang dùng skill (không cho xoá khi còn dùng). */
export function skillUsage(id: string): string[] {
  const out: string[] = [];
  for (const p of listProjects()) {
    if (p.settings.skill === id) out.push(`dự án «${p.name}»`);
    for (const v of listVideos(p.id)) if (v.data.skill === id) out.push(v.key);
  }
  return out;
}

export function deleteSkill(id: string) {
  if (BUILTIN_SKILLS.some((s) => s.id === id)) throw new SkillError("Skill có sẵn của ứng dụng – không xoá được");
  if (!getSkill(id)) throw new SkillError("Không có skill này");
  const used = skillUsage(id);
  if (used.length) throw new SkillError(`Skill đang được dùng (${used.slice(0, 5).join(", ")}${used.length > 5 ? "…" : ""}) – đổi sang skill khác trước khi xoá`);
  rmSync(file(id), { force: true });
}

/** Tách front-matter YAML đơn giản (name, description) và phần thân. */
export function parseSkillMd(md: string): { name: string; description: string; body: string } {
  const m = md.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const front = m?.[1] ?? "";
  const body = m ? m[2] : md;
  const field = (k: string) => front.match(new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, "m"))?.[1]?.trim() ?? "";
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  return { name: field("name") || h1, description: field("description"), body };
}

/** Bỏ khối lệnh shell (cài đặt/chạy script) – skill chỉ được dùng như hướng dẫn thiết kế. */
export function stripCommands(md: string): string {
  return md.replace(/```(?:sh|bash|zsh|shell|console|powershell|ps1|pwsh|cmd|bat)\b[\s\S]*?```/gi, "[đã bỏ khối lệnh]");
}

const clean = (s: string, n: number) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** Lưu skill từ nội dung markdown. Trùng nguồn → ghi đè bản cũ (cập nhật). */
export function saveSkill(md: string, source: string, license: string | null = null, nameHint = ""): Skill {
  if (md.includes("\u0000")) throw new SkillError("File không phải văn bản");
  const { name, description, body } = parseSkillMd(md);
  const text = stripCommands(body).trim().slice(0, MAX_SKILL_CHARS);
  if (text.length < 80) throw new SkillError("Nội dung skill quá ngắn (cần file .md mô tả cách dựng)");
  const title = clean(name || nameHint || "Skill", 80);
  const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "skill";
  const id = `${slug}-${createHash("sha256").update(source).digest("hex").slice(0, 6)}`;
  const s: Skill = { id, name: title, description: clean(description, 400), source: clean(source, 300), license: license ? clean(license, 80) : null, text, added: getSkill(id)?.added ?? new Date().toISOString() };
  mkdirSync(paths.skills(), { recursive: true });
  writeJsonAtomic(file(id), s);
  return s;
}

/** Link GitHub (blob/tree/repo) hoặc raw.githubusercontent.com → URL raw của file .md (thư mục → SKILL.md) + URL LICENSE của repo. */
export function rawSkillUrl(input: string): { raw: string; license: string } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new SkillError("Link không hợp lệ");
  }
  if (u.protocol !== "https:") throw new SkillError("Chỉ nhận link https");
  const seg = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let owner: string, repo: string, ref: string, path: string[];
  if (u.hostname === "github.com") {
    [owner, repo] = seg;
    if (!owner || !repo) throw new SkillError("Link GitHub cần dạng github.com/<chủ>/<repo>/…");
    if (seg[2] === "blob" || seg[2] === "tree") [ref, path] = [seg[3] ?? "HEAD", seg.slice(4)];
    else [ref, path] = ["HEAD", []];
  } else if (u.hostname === "raw.githubusercontent.com") {
    [owner, repo, ref] = seg;
    path = seg.slice(3);
    if (!owner || !repo || !ref) throw new SkillError("Link raw cần dạng raw.githubusercontent.com/<chủ>/<repo>/<nhánh>/…");
  } else throw new SkillError("Chỉ nhận link GitHub (github.com hoặc raw.githubusercontent.com)");
  if (!/\.(md|markdown)$/i.test(path.at(-1) ?? "")) path = [...path, "SKILL.md"];
  const enc = (xs: string[]) => xs.map(encodeURIComponent).join("/");
  const base = `https://raw.githubusercontent.com/${enc([owner, repo, ref])}`;
  return { raw: `${base}/${enc(path)}`, license: `${base}/LICENSE` };
}

async function getText(url: string, f: Fetch, max: number): Promise<string | null> {
  let r: Response;
  try {
    r = await f(url, { headers: { "User-Agent": STOCK_UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new SkillError(`Không tải được ${new URL(url).host} (${(e as Error).message})`);
  }
  if (r.status === 404) return null;
  if (!r.ok) throw new SkillError(`${new URL(url).host} trả lỗi ${r.status}`);
  if (Number(r.headers.get("content-length") ?? 0) > max) throw new SkillError(`File quá lớn (> ${Math.round(max / 1024)} KB)`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > max) throw new SkillError(`File quá lớn (> ${Math.round(max / 1024)} KB)`);
  return buf.toString("utf8");
}

/** Nhập skill từ link GitHub: tải file .md (hoặc SKILL.md của thư mục), dòng đầu LICENSE của repo để hiện giấy phép. */
export async function importSkillUrl(input: string, f: Fetch = fetch): Promise<Skill> {
  const { raw, license } = rawSkillUrl(input);
  const md = await getText(raw, f, MAX_SKILL_BYTES);
  if (md === null) throw new SkillError("Không thấy file (thư mục cần có SKILL.md, hoặc dán link thẳng tới file .md)");
  const lic = await getText(license, f, 64 * 1024).catch(() => null);
  const licLine = lic?.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
  return saveSkill(md, input.trim(), licLine, decodeURIComponent(raw.split("/").at(-2) ?? ""));
}

setSkillResolver((id) => {
  const s = getSkill(id);
  return s ? { name: s.name, text: s.text, source: s.source } : null;
});
