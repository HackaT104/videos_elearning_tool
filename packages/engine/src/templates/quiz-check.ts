// Câu hỏi kiểm tra nhanh: câu hỏi + 2–4 phương án A–D, thanh đếm ngược co lại trong lúc chờ.
// Tới mốc đáp án: lớp phủ "đúng" (dựng sẵn, màu nhấn) hiện dần trên phương án đúng, dấu ✓ bật lên, phương án khác mờ,
// dòng giải thích trồi lên. Đổi màu chỉ bằng lớp phủ chồng (opacity), không tween màu.

import { iconSvg } from "../icons";
import { dim, draw, enter, fade, pop, shift } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, rich } from "../text";
import { beatOf, box, SAFE, SpecBuilder, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };

export type QuizCheckParams = {
  kicker?: string;
  question: string;
  options: { text: string; at?: Beat }[];
  /** Chỉ số phương án đúng (0 = A). */
  correct: number;
  explain?: string;
  at?: { question?: Beat; options?: Beat; answer?: Beat; explain?: Beat };
};

const LETTERS = ["A", "B", "C", "D"];

export const quizCheck: TemplateDef<QuizCheckParams> = {
  id: "quiz-check",
  label: "Câu hỏi kiểm tra nhanh",
  when: "Câu hỏi trắc nghiệm ôn tập giữa/cuối bài: 2–4 phương án, có đáp án đúng và (tuỳ chọn) một dòng giải thích. Lời thoại nên có câu nêu đáp án.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      question: { type: "string" },
      options: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] } },
      correct: { type: "integer", minimum: 0, maximum: 3 },
      explain: { type: "string" },
      at: { type: "object", properties: { question: beatSchema, options: beatSchema, answer: beatSchema, explain: beatSchema } },
    },
    required: ["question", "options", "correct"],
  },
  example: {
    kicker: "Kiểm tra nhanh",
    question: "Theo ISO 45001, biện pháp kiểm soát nào được ưu tiên cao nhất?",
    options: [{ text: "Trang bị bảo hộ cá nhân (PPE)" }, { text: "Loại bỏ mối nguy" }, { text: "Biện pháp hành chính" }, { text: "Đào tạo người lao động" }],
    correct: 1,
    explain: "Theo thứ bậc kiểm soát, **loại bỏ mối nguy** luôn được ưu tiên trước; bảo hộ cá nhân là lựa chọn cuối cùng.",
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const opts = P.options.slice(0, 4);
    const N = opts.length;
    const correct = Math.max(0, Math.min(N - 1, Math.round(P.correct)));
    b.assume(`Ký hiệu phương án ${LETTERS.slice(0, N).join(", ")} do template thêm`);

    // ---- mốc: câu hỏi → phương án → (chờ, đếm ngược) → đáp án → giải thích
    const ansCue = P.explain && n >= 3 ? n - 2 : Math.max(0, n - 1);
    const qAt: TimeRef = P.at?.question ? beatOf(P.at.question, 0, 1, n) : { cue: 0, f: 0.03 };
    const optAt: TimeRef = P.at?.options ? beatOf(P.at.options, 0, 1, n) : ansCue >= 2 ? { cue: 1, f: 0.05 } : { cue: 0, f: ansCue === 0 ? 0.3 : 0.55 };
    const ansAt: TimeRef = P.at?.answer ? beatOf(P.at.answer, 0, 1, n) : { cue: ansCue, f: ansCue === 0 ? 0.72 : 0.08 };
    const expAt: TimeRef = P.at?.explain ? beatOf(P.at.explain, 0, 1, n) : P.explain && n >= 3 ? { cue: n - 1, f: 0.03 } : shift(ansAt, 1.1);
    const oAts = opts.map((o, i) => (o.at ? beatOf(o.at, 0, 1, n) : shift(optAt, 0.1 * i)));

    // ---- bố cục dọc
    const yK = 92;
    const yQ0 = yK + (P.kicker ? 56 : 0);
    const qSize = fitSize(P.question, SAFE.w, 56, { maxLines: 3, kind: "display", min: 36 });
    const qH = blockHeight(P.question, qSize, SAFE.w, "display");
    const eSize = P.explain ? fitSize(P.explain, SAFE.w - 90, 36, { maxLines: 2, min: 28 }) : 0;
    const eH = P.explain ? blockHeight(P.explain, eSize, SAFE.w - 90) : 0;
    const barY0 = yQ0 + qH + 34;
    const oTop = barY0 + 12 + 44;
    const oBottom = 1000 - (P.explain ? eH + 36 : 0);

    // lưới phương án: 2 cột khi 2 phương án, hoặc 4 phương án ngắn; còn lại 1 cột
    const pad = 26;
    const badge = 64;
    const mark = 60;
    const gap = 28;
    const textW = (w: number) => w - pad * 2 - badge - 22 - mark - 18;
    const colW2 = (SAFE.w - gap) / 2;
    const cols = N === 2 || (N === 4 && opts.every((o) => fitSize(o.text, textW(colW2), 38, { maxLines: 2, min: 30 }) > 30)) ? 2 : 1;
    const cw = cols === 2 ? colW2 : SAFE.w;
    const rows = Math.ceil(N / cols);
    let oSize = 44;
    let rowH = 0;
    for (; oSize >= 28; oSize -= 2) {
      rowH = Math.max(124, ...opts.map((o) => blockHeight(o.text, oSize, textW(cw)) + pad * 2));
      if (rows * rowH + (rows - 1) * gap <= oBottom - oTop) break;
    }
    oSize = Math.max(28, oSize);
    const gridH = rows * rowH + (rows - 1) * gap;
    // cân khối nội dung theo chiều dọc (hơi lệch lên)
    const contentEnd = oTop + gridH + (P.explain ? 36 + eH : 0);
    const dy = Math.max(0, (1000 - contentEnd) / 2) * 0.85;
    const y0 = yQ0 + dy;
    const barY = barY0 + dy;
    const gTop = oTop + dy;
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(SAFE.x0, yK + dy, SAFE.w)}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.25 }, { rise: 14, blur: 4 }));
    }

    // câu hỏi
    b.add(`<div id="${b.id("q")}" class="abs d t" style="${box(SAFE.x0, y0, SAFE.w)}font-size:${qSize}px;">${rich(b.text(P.question))}</div>`);
    b.anim(enter(ctx, b.id("q"), qAt, { rise: 22 }));

    // thanh đếm ngược: co lại (scaleX) từ khi hiện phương án tới mốc đáp án
    const barX = SAFE.x0 + 56;
    const barW = SAFE.w - 56;
    b.add(
      `<div id="${b.id("timer")}" class="abs tone-accent" style="${box(SAFE.x0, barY - 18, SAFE.w, 48)}"><div class="icon" style="${box(0, 0, 40, 40)}position:absolute;">${iconSvg("clock")}</div>` +
        `<div class="abs" style="${box(barX - SAFE.x0, 14, barW, 12)}border-radius:6px;background:var(--bg2);"></div>` +
        `<div id="${b.id("fill")}" class="abs" style="${box(barX - SAFE.x0, 14, barW, 12)}border-radius:6px;background:var(--tone);transform-origin:0% 50%;"></div></div>`,
    );
    const lastOpt = oAts[N - 1];
    b.anim(fade(ctx, b.id("timer"), shift(optAt, 0.1), 0.4));
    b.anim({ id: b.id("fill"), from: { scaleX: 1 }, to: { scaleX: 0 }, at: shift(lastOpt, 0.5), until: shift(ansAt, -0.05), dur: 3, ease: "none" });
    b.anim({ id: b.id("timer"), from: { opacity: 1 }, to: { opacity: 0 }, at: ansAt, dur: 0.4, ease: "power2.in" });

    // phương án
    opts.forEach((o, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = SAFE.x0 + c * (cw + gap);
      const y = gTop + r * (rowH + gap);
      const id = b.id(`o${i}`);
      const ok = i === correct;
      const letter = b.text(LETTERS[i]);
      b.add(
        `<div id="${id}" class="abs tone-accent" style="${box(x, y, cw, rowH)}">` +
          `<div class="card" style="${box(0, 0, cw, rowH)}"></div>` +
          (ok ? `<div id="${b.id("tint")}" class="abs" style="${box(0, 0, cw, rowH)}border-radius:var(--radius);background:var(--tone);"></div>` : "") +
          (ok ? `<div id="${b.id("ring")}" class="abs" style="${box(-8, -8, cw + 16, rowH + 16)}border-radius:calc(var(--radius) + 8px);border:6px solid var(--tone);"></div>` : "") +
          `<div class="abs" style="${box(pad, (rowH - badge) / 2, badge, badge)}border-radius:50%;border:4px solid var(--tone);display:flex;align-items:center;justify-content:center;background:var(--card);"><span class="d t" style="font-size:34px;line-height:1;color:var(--tone);">${esc(letter)}</span></div>` +
          `<div class="abs b t" style="${box(pad + badge + 22, 0, textW(cw), rowH)}font-size:${oSize}px;display:flex;align-items:center;">${rich(b.text(o.text))}</div>` +
          (ok
            ? `<div id="${b.id("ok")}" class="abs" style="${box(cw - pad - mark, (rowH - mark) / 2, mark, mark)}border-radius:50%;background:var(--tone);transform-origin:50% 50%;"><svg class="abs" style="${box(mark * 0.2, mark * 0.2, mark * 0.6, mark * 0.6)}overflow:visible" viewBox="0 0 24 24"><path id="${b.id("okp")}" class="line draw" pathLength="1" d="M4.5 12.5 L10 18 L19.5 6.5" style="stroke:var(--bg3);stroke-width:3.4px"/></svg></div>`
            : "") +
          `</div>`,
      );
      b.anim(enter(ctx, id, oAts[i], { x: cols === 2 && c === 1 ? 24 : -24, rise: 0, dur: 0.5 }));
      if (!ok) b.anim(dim(ctx, id, ansAt, 0.32));
    });

    // lớp phủ "đúng": nền nhuộm nhạt + viền nhấn hiện dần, ✓ bật lên
    b.anim({ id: b.id("tint"), from: { opacity: 0 }, to: { opacity: 0.16 }, at: ansAt, dur: 0.5, ease: "power2.out" });
    b.anim({ id: b.id("ring"), from: { opacity: 0, scale: 1.04 }, to: { opacity: 1, scale: 1 }, at: ansAt, dur: 0.5, ease: "power2.out" });
    b.anim(pop(ctx, b.id("ok"), shift(ansAt, 0.2), 0.4));
    b.anim(draw(ctx, b.id("okp"), shift(ansAt, 0.45), 0.4, "power2.out"));
    const cid = b.id(`o${correct}`);
    b.anim({ id: cid, from: { scale: 1 }, to: { scale: 1.03 }, at: shift(ansAt, 0.2), dur: 0.3, ease: "power2.out" });
    b.anim({ id: cid, from: { scale: 1.03 }, to: { scale: 1 }, at: shift(ansAt, 0.5), dur: 0.45, ease: "power2.inOut" });

    if (P.explain) {
      const ey = gTop + gridH + 36;
      b.add(
        `<div id="${b.id("exp")}" class="abs tone-accent" style="${box(SAFE.x0, ey, SAFE.w, eH)}"><div class="icon" style="${box(0, Math.max(0, eSize * 0.66 - 22), 44, 44)}position:absolute;">${iconSvg("idea")}</div><div class="abs b t" style="${box(66, 0, SAFE.w - 90)}font-size:${eSize}px;">${rich(b.text(P.explain))}</div></div>`,
      );
      b.anim(enter(ctx, b.id("exp"), expAt, { rise: 26 }));
    }
    return b.done();
  },
};
