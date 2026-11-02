// Agent Claude: tự làm trọn một video – sửa cách đọc → tạo giọng → thiết kế cảnh bằng AI → soát hình & tự sửa → render.
// Mọi chỗ AI tự quyết được ghi vào assumptions (hiện màu vàng ở bước Duyệt).

import { checkTts, type Sentence } from "@cvs/core";
import { aiAvailable, fixReadings, reviewReadings } from "@cvs/ai";
import { addGlossary, getVideo, glossaryFor, listVideos, upsertVideo } from "@cvs/db";
import { readingIssues, runSteps, stepNormalize, Stopped, type Ctx } from "./pipeline";

/** Thêm vào bảng thuật ngữ của dự án các cụm chưa có (không phân biệt hoa thường). */
function addNewGlossary(projectId: string, entries: { term: string; reading: string }[] = [], note: string) {
  const known = new Set(glossaryFor(projectId).map((g) => g.term.toLowerCase()));
  for (const g of entries) {
    if (g.term && g.reading && !known.has(g.term.toLowerCase())) {
      addGlossary(projectId, { term: g.term, reading: g.reading, caseSensitive: g.term !== g.term.toLowerCase(), note });
      known.add(g.term.toLowerCase());
    }
  }
}

export async function aiFixReading(ctx: Ctx): Promise<number> {
  const row = getVideo(ctx.projectId, ctx.key)!;
  const video = row.data;
  // câu có đề xuất chưa duyệt: không ghi đè – người dùng chấp nhận/bỏ qua ở bước Chuẩn hoá cách đọc
  const issues = readingIssues(video).filter((i) => !i.suggested);
  if (!issues.length) return 0;
  ctx.progress("normalize", 30, `Claude sửa cách đọc ${issues.length} câu`);
  const fixes = await fixReadings(
    issues.map((i) => ({ id: `${i.scene}#${i.idx}`, text: i.text, tts: i.tts, warnings: i.warnings })),
    `${video.title}. ${video.context ?? ""}`,
  );
  let n = 0;
  for (const f of fixes) {
    const [sid, idx] = f.id.split("#");
    const scene = video.scenes.find((s) => s.id === sid);
    const sent = scene?.sentences[Number(idx)];
    if (!scene || !sent) continue;
    sent.tts = f.tts.trim();
    sent.ttsLocked = true;
    scene.assumptions = [...new Set([...(scene.assumptions ?? []), `AI sửa cách đọc câu ${Number(idx) + 1}: «${sent.text}» → «${sent.tts}»`])];
    n++;
    addNewGlossary(ctx.projectId, f.glossary, "AI đề xuất");
  }
  upsertVideo(ctx.projectId, video);
  return n;
}

/** Chạy agent cho một video. */
export async function runAgent(ctx: Ctx, payload: { skipStyle?: boolean } = {}) {
  if (!aiAvailable()) throw new Error("Chưa đăng nhập Claude – vào mục Claude AI để đăng nhập trước khi dùng agent.");
  // 1. chuẩn hoá + Claude sửa câu còn đọc sai
  await stepNormalize(ctx, true);
  const fixed = await aiFixReading(ctx);
  ctx.log(`agent: Claude sửa ${fixed} câu\n`);
  const left = getVideo(ctx.projectId, ctx.key)!.data.scenes.flatMap((s) => s.sentences).filter((x) => checkTts(x.tts).length).length;
  if (left) ctx.log(`agent: còn ${left} câu có cảnh báo – vẫn tiếp tục (đã ghi vào assumptions)\n`);
  const pending = readingIssues(getVideo(ctx.projectId, ctx.key)!.data).filter((i) => i.suggested).length;
  if (pending) ctx.log(`agent: ${pending} đề xuất cách đọc chưa duyệt – giữ cách đọc hiện tại\n`);
  // 2–4. giọng → thiết kế lại bằng AI → QA bằng hình (tự sửa) ; render chạy riêng theo lượt
  await runSteps(ctx, ["voice", "design", "qa"], { redesign: true, ignoreReading: true, ...payload });
}

// ---------- Claude rà soát cách đọc: đề xuất, người dùng chấp nhận / bỏ qua ----------

export type ReadingSuggest = NonNullable<Sentence["suggest"]>;

/** Claude đọc MỌI câu của một video (hoặc mọi video của dự án) và lưu đề xuất; không đổi tts. Đề xuất AI cũ của video được thay. */
export async function aiReviewReadings(ctx: Ctx, key: string | null): Promise<{ videos: number; suggestions: number }> {
  if (!aiAvailable()) throw new Error("Chưa đăng nhập Claude – vào mục Claude AI để đăng nhập, hoặc dùng \"Gửi cho Claude Code\".");
  const rows = key ? [getVideo(ctx.projectId, key)].filter((r) => !!r) : listVideos(ctx.projectId).filter((v) => v.include && !v.existing);
  if (key && !rows.length) throw new Error(`Không có video ${key}`);
  let n = 0;
  for (const [i, row] of rows.entries()) {
    if (ctx.shouldStop()) throw new Stopped();
    const v = row.data;
    const items = v.scenes.flatMap((s) => s.sentences.map((x, idx) => ({ id: `${s.id}#${idx}`, text: x.text, tts: x.tts, warnings: checkTts(x.tts) })));
    ctx.progress("normalize", (i / rows.length) * 100, `Claude rà soát ${row.key} (${i + 1}/${rows.length})`);
    const sug = await reviewReadings(items, `${v.title}. ${v.context ?? ""}`, (d, t) => ctx.progress("normalize", ((i + d / t) / rows.length) * 100, `Claude rà soát ${row.key}: ${d}/${t} câu`));
    // đọc lại: người dùng có thể đã sửa trong lúc Claude làm
    const fresh = getVideo(ctx.projectId, row.key)!.data;
    for (const s of fresh.scenes) for (const x of s.sentences) if (x.suggest?.by === "ai") delete x.suggest;
    for (const g of sug) {
      const [sid, idx] = g.id.split("#");
      const x = fresh.scenes.find((s) => s.id === sid)?.sentences[Number(idx)];
      const it = items.find((t) => t.id === g.id);
      if (!x || !it || x.text !== it.text || x.tts.trim() === g.tts) continue;
      x.suggest = { tts: g.tts, reason: g.reason, glossary: g.glossary, by: "ai" };
      n++;
    }
    upsertVideo(ctx.projectId, fresh);
  }
  ctx.progress("normalize", 100, `${n} đề xuất`);
  return { videos: rows.length, suggestions: n };
}

/** Kiểm + lưu một đề xuất (Claude Code ghi qua API). Trả lỗi (tiếng Việt) hoặc null. */
export function setReadingSuggestion(projectId: string, key: string, sceneId: string, idx: number, b: unknown): string | null {
  const g = b as Partial<ReadingSuggest> | null;
  if (!g || typeof g !== "object" || typeof g.tts !== "string" || !g.tts.trim() || g.tts.length > 2000) return '"suggest.tts" phải là chuỗi khác rỗng (≤ 2000 ký tự)';
  if (g.reason !== undefined && (typeof g.reason !== "string" || g.reason.length > 500)) return '"suggest.reason" phải là chuỗi ≤ 500 ký tự';
  if (g.glossary !== undefined && !(Array.isArray(g.glossary) && g.glossary.length <= 20 && g.glossary.every((x) => typeof x?.term === "string" && typeof x?.reading === "string" && x.term.trim() && x.reading.trim())))
    return '"suggest.glossary" phải là mảng [{term, reading}] (≤ 20 mục)';
  if (!["ai", "claude-code"].includes(g.by as string)) return '"suggest.by" phải là ai | claude-code';
  const v = getVideo(projectId, key)?.data;
  const x = v?.scenes.find((s) => s.id === sceneId)?.sentences[idx];
  if (!v || !x) return "Không tìm thấy câu";
  const tts = g.tts.trim();
  if (tts === x.tts.trim()) return "Đề xuất trùng cách đọc hiện tại";
  x.suggest = { tts, reason: g.reason?.trim() || undefined, glossary: g.glossary?.length ? g.glossary.map((e) => ({ term: e.term.trim(), reading: e.reading.trim() })) : undefined, by: g.by as ReadingSuggest["by"] };
  upsertVideo(projectId, v);
  return null;
}

function resolveOne(projectId: string, x: Sentence, accept: boolean) {
  if (!x.suggest) return false;
  if (accept) {
    x.tts = x.suggest.tts;
    x.ttsLocked = true;
    addNewGlossary(projectId, x.suggest.glossary, x.suggest.by === "ai" ? "Claude đề xuất" : "Claude Code đề xuất");
  }
  delete x.suggest;
  return true;
}

/** Chấp nhận (tts = đề xuất, khoá, thêm thuật ngữ mới) hoặc bỏ qua một đề xuất. */
export function resolveReadingSuggestion(projectId: string, key: string, sceneId: string, idx: number, accept: boolean): string | null {
  const v = getVideo(projectId, key)?.data;
  const x = v?.scenes.find((s) => s.id === sceneId)?.sentences[idx];
  if (!v || !x) return "Không tìm thấy câu";
  if (!resolveOne(projectId, x, accept)) return "Câu này không có đề xuất";
  upsertVideo(projectId, v);
  return null;
}

/** Chấp nhận mọi đề xuất của một video hoặc cả dự án; trả số câu đã áp dụng. */
export function acceptAllReadings(projectId: string, key?: string): number {
  let n = 0;
  for (const row of listVideos(projectId)) {
    if (key ? row.key !== key : !row.include || row.existing) continue;
    let k = 0;
    for (const s of row.data.scenes) for (const x of s.sentences) if (resolveOne(projectId, x, true)) k++;
    if (k) upsertVideo(projectId, row.data);
    n += k;
  }
  return n;
}
