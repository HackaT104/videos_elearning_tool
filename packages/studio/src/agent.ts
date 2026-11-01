// Agent Claude: tự làm trọn một video – sửa cách đọc → tạo giọng → thiết kế cảnh bằng AI → soát hình & tự sửa → render.
// Mọi chỗ AI tự quyết được ghi vào assumptions (hiện màu vàng ở bước Duyệt).

import { checkTts } from "@cvs/core";
import { aiAvailable, fixReadings } from "@cvs/ai";
import { addGlossary, getVideo, glossaryFor, upsertVideo } from "@cvs/db";
import { readingIssues, runSteps, stepNormalize, type Ctx } from "./pipeline";

export async function aiFixReading(ctx: Ctx): Promise<number> {
  const row = getVideo(ctx.projectId, ctx.key)!;
  const video = row.data;
  const issues = readingIssues(video);
  if (!issues.length) return 0;
  ctx.progress("normalize", 30, `Claude sửa cách đọc ${issues.length} câu`);
  const fixes = await fixReadings(
    issues.map((i) => ({ id: `${i.scene}#${i.idx}`, text: i.text, tts: i.tts, warnings: i.warnings })),
    `${video.title}. ${video.context ?? ""}`,
  );
  const known = new Set(glossaryFor(ctx.projectId).map((g) => g.term.toLowerCase()));
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
    for (const g of f.glossary ?? []) {
      if (g.term && g.reading && !known.has(g.term.toLowerCase())) {
        addGlossary(ctx.projectId, { term: g.term, reading: g.reading, caseSensitive: g.term !== g.term.toLowerCase(), note: "AI đề xuất" });
        known.add(g.term.toLowerCase());
      }
    }
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
  // 2–4. giọng → thiết kế lại bằng AI → QA bằng hình (tự sửa) ; render chạy riêng theo lượt
  await runSteps(ctx, ["voice", "design", "qa"], { redesign: true, ignoreReading: true, ...payload });
}
