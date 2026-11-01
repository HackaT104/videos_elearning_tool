// Định nghĩa thuật ngữ: thuật ngữ lớn được khoanh vòng elip vẽ tay, định nghĩa bên dưới có từ khoá được tô nền quét từ trái,
// tuỳ chọn dòng «≠ thuật ngữ dễ nhầm: khác biệt». Cảm hứng: HyperFrames vox-annotate, marker-highlight, hw-callout-circle.
import type { Tone } from "@cvs/themes";
import { draw, enter, fade, shift } from "../motion";
import { blockHeight, esc, fitSize, plain, rich } from "../text";
import { beatOf, box, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

export type TermDefineParams = {
  kicker?: string;
  term: string;
  /** Tên đầy đủ / viết tắt (dòng nhỏ dưới thuật ngữ). */
  full?: string;
  /** Định nghĩa; 1–2 từ khoá đánh dấu **…** sẽ được tô nền. */
  definition: string;
  confusable?: { term: string; diff: string };
  tone?: Tone;
  at?: { term?: Beat; definition?: Beat; confusable?: Beat };
};

/** Định nghĩa → HTML; mỗi từ khoá **…** là span inline-block chứa thanh tô nền tuyệt đối (trình duyệt tự đặt vị trí). */
function markedHtml(s: string, hlId: (k: number) => string): { html: string; count: number } {
  let k = 0;
  const parts = s.split(/\*\*(.+?)\*\*/g);
  const html = parts
    .map((seg, i) => {
      if (i % 2 === 0) return rich(seg);
      const id = hlId(k++);
      return `<span style="position:relative;display:inline-block;isolation:isolate;"><span id="${id}" class="abs" style="left:-.14em;right:-.14em;top:.2em;bottom:.06em;border-radius:.14em;background:var(--hl);z-index:-1;transform-origin:0% 50%;"></span><span class="bb">${rich(seg)}</span></span>`;
    })
    .join("");
  return { html, count: k };
}

export const termDefine: TemplateDef<TermDefineParams> = {
  id: "term-define",
  label: "Định nghĩa thuật ngữ",
  when: "Giới thiệu/định nghĩa một thuật ngữ hoặc từ viết tắt (CCP, NC, CO₂e…): thuật ngữ được khoanh, 1–2 từ khoá của định nghĩa được tô nền; tuỳ chọn phân biệt với một thuật ngữ dễ nhầm.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      term: { type: "string", description: "Thuật ngữ ngắn (1–4 từ)" },
      full: { type: "string", description: "Tên đầy đủ / nghĩa của từ viết tắt" },
      definition: { type: "string", description: "Định nghĩa ≤ 3 dòng; đánh dấu 1–2 từ khoá bằng **…**" },
      confusable: { type: "object", properties: { term: { type: "string" }, diff: { type: "string" } }, required: ["term", "diff"] },
      tone: toneSchema,
      at: { type: "object", properties: { term: beatSchema, definition: beatSchema, confusable: beatSchema } },
    },
    required: ["term", "definition"],
  },
  example: {
    kicker: "Thuật ngữ HACCP",
    term: "CCP",
    full: "Critical Control Point – Điểm kiểm soát tới hạn",
    definition: "Công đoạn mà tại đó việc kiểm soát là **thiết yếu** để ngăn ngừa, loại bỏ hoặc giảm mối nguy an toàn thực phẩm đến **mức chấp nhận được**.",
    confusable: { term: "OPRP", diff: "kiểm soát mối nguy đáng kể nhưng không có giới hạn tới hạn đo được" },
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const tone = toneClass(P.tone);
    // cỡ chữ thuật ngữ; vòng elip rộng hơn chữ 20% + 0,9em → lùi lề trái để vòng không ra khỏi vùng an toàn
    const tSize = fitSize(P.term, 1150, 136, { maxLines: 1, kind: "display", min: 64 });
    const estW = Math.min(1150, plain(P.term).length * 0.6 * tSize);
    // thuật ngữ dài → elip dẹt: nới thêm chiều ngang và dọc để hai đầu không cắt qua chữ/dấu
    const wide = estW > 4 * tSize;
    const ox = wide ? 0.12 : 0.1;
    const x = Math.max(SAFE.x0 + 72, Math.round(SAFE.x0 + 0.45 * tSize + ox * estW + 16));
    const W = SAFE.x1 - 40 - x;
    const fSize = P.full ? fitSize(P.full, W, 38, { maxLines: 2, min: 30 }) : 0;
    const fH = P.full ? blockHeight(P.full, fSize, W) : 0;
    let dSize = fitSize(P.definition, W, 50, { maxLines: 3, min: 32 });
    const cText = P.confusable ? `${P.confusable.term}: ${P.confusable.diff}` : "";
    let cSize = P.confusable ? fitSize(cText, W - 110, 36, { maxLines: 2, min: 28 }) : 0;
    const ringTop = Math.ceil(tSize * (wide ? 0.78 : 0.42));
    const ringBot = Math.ceil(tSize * (wide ? 0.62 : 0.24));
    const kickH = P.kicker ? 84 : 0;
    const height = () =>
      kickH + ringTop + tSize * 1.12 + ringBot + (P.full ? 18 + fH : 0) + 56 + blockHeight(P.definition, dSize, W * 0.92) + (P.confusable ? 60 + Math.max(72, blockHeight(cText, cSize, (W - 110) * 0.92)) : 0);
    const avail = SAFE.y1 - 30 - (SAFE.y0 + 30);
    while (height() > avail && dSize > 32) dSize -= 2;
    while (height() > avail && cSize > 28) cSize -= 2;
    let y = Math.max(SAFE.y0 + 30, 540 - height() / 2);

    const aTerm = beatOf(P.at?.term, 0, 1, n, 0.05);
    const cnt = P.confusable ? 3 : 2;
    const aDef = beatOf(P.at?.definition, 1, cnt, n, 0.05);
    const aConf = beatOf(P.at?.confusable, 2, cnt, n, 0.05);

    b.add(`<div class="abs ${tone}" style="${box(0, 0, 1920, 1080)}">`);
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(x, y, W)}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.2 }, { rise: 14 }));
      y += kickH;
    }
    // thuật ngữ + vòng elip (svg nằm trong span inline-block → tự khớp bề rộng chữ; chừa ≥ 0,4em phía trên cho dấu)
    y += ringTop;
    const sw = Math.max(4, tSize * 0.045);
    b.add(
      `<div id="${b.id("term")}" class="abs d t" style="${box(x, y, W)}font-size:${tSize}px;white-space:nowrap;color:var(--ink);"><span style="position:relative;display:inline-block;">${rich(b.text(P.term))}<svg class="abs sk" style="left:calc(-.45em - ${ox * 100}%);top:${px(-ringTop)};width:calc(${100 + ox * 200}% + .9em);height:calc(100% + ${px(ringTop + ringBot)});overflow:visible;"><ellipse id="${b.id("ring")}" class="draw" pathLength="1" cx="50%" cy="50%" rx="49%" ry="46%" style="fill:none;stroke:var(--tone);stroke-width:${px(sw)};stroke-linecap:round;"/><ellipse id="${b.id("ring2")}" class="draw" pathLength="1" cx="50.6%" cy="46%" rx="48.5%" ry="44%" style="fill:none;stroke:var(--tone);stroke-width:${px(sw * 0.7)};stroke-linecap:round;opacity:.85;"/></svg></span></div>`,
    );
    b.anim(enter(ctx, b.id("term"), aTerm, { rise: 26, blur: 8 }));
    // vòng chính khép kín, rồi một nét phụ vượt qua ~30% như bút tay (elip % theo span → trình duyệt tự khớp chữ, nét đều)
    b.anim(draw(ctx, b.id("ring"), shift(aTerm, 0.45), ctx.slow ? 1.2 : 0.9, "power2.inOut"));
    b.anim({ id: b.id("ring2"), from: { dash: 1 }, to: { dash: 0.7 }, at: shift(aTerm, ctx.slow ? 1.55 : 1.25), dur: 0.35, ease: "power2.out" });
    y += tSize * 1.12 + ringBot;
    if (P.full) {
      y += 18;
      b.add(`<div id="${b.id("full")}" class="abs b soft t" style="${box(x, y, W)}font-size:${fSize}px;">${rich(b.text(P.full))}</div>`);
      b.anim(enter(ctx, b.id("full"), shift(aTerm, 0.7), { rise: 12 }));
      y += fH;
    }
    // định nghĩa: chữ hiện trước, thanh tô nền quét từ trái sau đó
    y += 56;
    b.text(P.definition);
    const def = markedHtml(P.definition, (k) => b.id(`hl${k}`));
    b.add(`<div id="${b.id("def")}" class="abs b t" style="${box(x, y, W)}font-size:${dSize}px;">${def.html}</div>`);
    b.anim(enter(ctx, b.id("def"), aDef, { rise: 20 }));
    for (let k = 0; k < def.count; k++) b.anim({ id: b.id(`hl${k}`), from: { scaleX: 0 }, to: { scaleX: 1 }, at: shift(aDef, 0.75 + k * 0.45), dur: ctx.slow ? 0.7 : 0.55, ease: "power2.inOut" });
    y += blockHeight(P.definition, dSize, W * 0.92);
    if (P.confusable) {
      y += 30;
      b.add(`<svg class="abs" style="${box(x, y, W, 4)}overflow:visible" viewBox="0 0 ${Math.round(W)} 4"><path id="${b.id("rule")}" class="line draw" pathLength="1" d="M0 2 H${Math.round(W)}" style="stroke:var(--grid);stroke-width:3px"/></svg>`);
      b.anim(draw(ctx, b.id("rule"), shift(aConf, -0.3), 0.6));
      y += 30;
      const cH = Math.max(72, blockHeight(cText, cSize, (W - 110) * 0.92));
      // dấu ≠ vẽ nét trong vòng tròn màu cảnh báo
      b.add(
        `<div id="${b.id("neq")}" class="abs tone-warn" style="${box(x, y + cH / 2 - 36, 72, 72)}border-radius:50%;border:4px solid var(--tone);"></div><svg class="abs tone-warn" style="${box(x + 18, y + cH / 2 - 18, 36, 36)}overflow:visible" viewBox="0 0 24 24"><path id="${b.id("neq-p")}" class="draw" pathLength="1" d="M4 9 H20 M4 15 H20 M16 3 L8 21" style="fill:none;stroke:var(--tone);stroke-width:3px;stroke-linecap:round"/></svg>`,
      );
      b.anim(fade(ctx, b.id("neq"), aConf, 0.4));
      b.anim(draw(ctx, b.id("neq-p"), shift(aConf, 0.15), 0.5, "power2.out"));
      b.text(P.confusable.term);
      b.text(P.confusable.diff);
      b.add(
        `<div id="${b.id("conf")}" class="abs b t" style="${box(x + 110, y + Math.max(0, (cH - blockHeight(cText, cSize, (W - 110) * 0.92)) / 2), W - 110)}font-size:${cSize}px;"><span class="bb tone-warn" style="color:var(--tone);">${rich(P.confusable.term)}</span><span class="soft">: ${rich(P.confusable.diff)}</span></div>`,
      );
      b.anim(enter(ctx, b.id("conf"), shift(aConf, 0.2), { x: -24, rise: 0 }));
    }
    b.add(`</div>`);
    return b.done();
  },
};
