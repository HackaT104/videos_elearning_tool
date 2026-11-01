// Hiểu lầm / Sự thật: thẻ phát biểu sai (✗) bị gạch từng dòng rồi mờ đi, phát biểu đúng (✓) trồi lên với màu nhấn.
// Cảm hứng: HyperFrames strikethrough-replace (Apache-2.0).
import type { Tone } from "@cvs/themes";
import { dim, draw, enter, shift } from "../motion";
import { blockHeight, esc, fitSize, plain, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

type Pair = { myth: string; fact: string; at?: { myth?: Beat; fact?: Beat } };
export type MythFactParams = { kicker?: string; title?: string; mythLabel?: string; factLabel?: string; tone?: Tone; pairs: Pair[] };

/** Ngắt dòng theo khoảng trắng giống estimateLines (thân chữ); mỗi dòng nowrap nên đo với độ rộng hẹp hơn khung một chút. */
export function wrapWords(text: string, size: number, maxWidth: number, cw = 0.53): string[] {
  const words = plain(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && next.length * cw * size > maxWidth) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const BADGE = 56;
const PAD = 40;
const TOP = PAD + BADGE + 28;

export const mythFact: TemplateDef<MythFactParams> = {
  id: "myth-fact",
  label: "Hiểu lầm / Sự thật",
  when: "Bác bỏ 1–2 hiểu lầm phổ biến: phát biểu sai bị gạch bỏ, phát biểu đúng hiện ra. Hiểu lầm nên ngắn (≤ 2 dòng, khoảng ≤ 12 từ).",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      mythLabel: { type: "string", description: "Nhãn thẻ sai, mặc định «Hiểu lầm»" },
      factLabel: { type: "string", description: "Nhãn thẻ đúng, mặc định «Sự thật»" },
      tone: toneSchema,
      pairs: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: {
          type: "object",
          properties: { myth: { type: "string" }, fact: { type: "string" }, at: { type: "object", properties: { myth: beatSchema, fact: beatSchema } } },
          required: ["myth", "fact"],
        },
      },
    },
    required: ["pairs"],
  },
  example: {
    title: "ISO 45001: hiểu đúng",
    pairs: [
      { myth: "An toàn lao động là việc riêng của bộ phận HSE", fact: "Mọi cấp quản lý và người lao động đều phải **tham gia và tham vấn**" },
      { myth: "Không có tai nạn nghĩa là hệ thống đã hiệu quả", fact: "Cần theo dõi cả **chỉ số dẫn trước**: báo cáo suýt sự cố, đánh giá rủi ro" },
    ],
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const pairs = P.pairs.slice(0, 2);
    const c = pairs.length;
    const mLabel = P.mythLabel ?? "Hiểu lầm";
    const fLabel = P.factLabel ?? "Sự thật";
    if (!P.mythLabel) b.assume(`Nhãn «${mLabel}» do template thêm`);
    if (!P.factLabel) b.assume(`Nhãn «${fLabel}» do template thêm`);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const gap = 120;
    const w = (SAFE.w - gap) / 2;
    const tw = w - PAD * 2;
    const rowGap = 48;
    const avail = 990 - y0 - rowGap * (c - 1);
    const maxRow = Math.min(c === 1 ? 520 : 999, avail / c);
    // đo trước: cỡ chữ hiểu lầm ≥ 40 (để thanh gạch rõ), sự thật ≥ 30
    // cùng một cỡ chữ cho mọi cặp (nhất quán khi có 2 hàng)
    let ms = Math.min(...pairs.map((p) => fitSize(p.myth, tw * 0.94, c === 1 ? 60 : 48, { maxLines: 2, min: 40 })));
    let fs = Math.min(...pairs.map((p) => fitSize(p.fact, tw, c === 1 ? 50 : 40, { maxLines: 4, min: 30 })));
    const measure = () =>
      pairs.map((p) => {
        const lines = wrapWords(p.myth, ms, tw * 0.94);
        return { lines, h: TOP + Math.max(Math.ceil(lines.length * ms * 1.35), blockHeight(p.fact, fs, tw * 0.88)) + 44 };
      });
    const tooTall = () => measure().some((l) => l.h > maxRow);
    while (tooTall() && fs > 30) fs -= 2;
    while (tooTall() && ms > 40) ms -= 2;
    const lay = measure().map((l) => ({ ...l, ms, fs, h: Math.min(maxRow, l.h) }));
    const total = lay.reduce((a, l) => a + l.h, 0) + rowGap * (c - 1);
    let y = y0 + Math.max(0, (990 - y0 - total) / 2);
    const factTone = toneClass(P.tone ?? "accent");
    const badge = (k: string, path: string, tone: string) =>
      `<div class="abs ${tone}" style="${box(PAD, PAD, BADGE, BADGE)}border-radius:50%;background:var(--tone);"></div><svg class="abs" style="${box(PAD + 12, PAD + 12, BADGE - 24, BADGE - 24)}overflow:visible" viewBox="0 0 24 24"><path id="${b.id(k)}" class="draw" pathLength="1" d="${path}" style="fill:none;stroke:var(--bg3);stroke-width:4.5px;stroke-linecap:round;stroke-linejoin:round"/></svg>`;
    const label = (s: string) => `<div class="abs kicker t" style="${box(PAD + BADGE + 20, PAD + BADGE / 2 - 22, w - PAD * 2 - BADGE - 20)}line-height:44px;">${esc(b.text(s))}</div>`;
    pairs.forEach((p, i) => {
      const L = lay[i];
      const aM = beatOf(p.at?.myth, 2 * i, 2 * c, n, 0.05);
      const aF = beatOf(p.at?.fact, 2 * i + 1, 2 * c, n, 0.05);
      const mid = b.id(`m${i}`);
      const fid = b.id(`f${i}`);
      // thẻ hiểu lầm: mỗi dòng là một span inline-block để thanh gạch (div tuyệt đối) tự khớp độ rộng dòng
      b.text(p.myth);
      const rows = L.lines
        .map((ln, k) => `<div style="white-space:nowrap;"><span style="position:relative;display:inline-block;">${esc(ln)}<div id="${b.id(`s${i}_${k}`)}" class="abs" style="left:-.1em;right:-.1em;top:.74em;height:${px(Math.max(5, L.ms * 0.09))};border-radius:4px;background:var(--tone);transform-origin:0% 50%;"></div></span></div>`)
        .join("");
      b.add(
        `<div id="${mid}" class="card tone-warn" style="${box(SAFE.x0, y, w, L.h)}">${badge(`mx${i}`, "M6 6 L18 18 M18 6 L6 18", "tone-warn")}${label(mLabel)}<div id="${b.id(`mt${i}`)}" class="abs b t" style="${box(PAD, TOP, tw)}font-size:${L.ms}px;">${rows}</div></div>`,
      );
      b.anim(enter(ctx, mid, aM, { x: -36, rise: 0 }));
      b.anim(draw(ctx, b.id(`mx${i}`), shift(aM, 0.35), 0.45, "power2.out"));
      L.lines.forEach((_, k) => b.anim({ id: b.id(`s${i}_${k}`), from: { scaleX: 0 }, to: { scaleX: 1 }, at: shift(aF, k * 0.28), dur: ctx.slow ? 0.6 : 0.45, ease: "power2.inOut" }));
      const struck = shift(aF, L.lines.length * 0.28 + 0.2);
      b.anim(dim(ctx, mid, struck, 0.42));
      // mũi tên → thẻ sự thật
      const ax = SAFE.x0 + w + 24;
      const aw = gap - 48;
      b.add(`<svg class="abs" style="${box(ax, y + L.h / 2 - 24, aw, 48)}overflow:visible" viewBox="0 0 ${aw} 48"><path id="${b.id(`ar${i}`)}" class="line draw" pathLength="1" d="M0 24 H${aw - 4} M${aw - 22} 8 L${aw - 3} 24 L${aw - 22} 40" style="stroke:var(--accent)"/></svg>`);
      b.anim(draw(ctx, b.id(`ar${i}`), shift(struck, -0.1), 0.5));
      const factAt = shift(struck, 0.15);
      b.add(
        `<div id="${fid}" class="card ${factTone}" style="${box(SAFE.x0 + w + gap, y, w, L.h)}border-color:var(--tone);overflow:hidden;"><div class="abs" style="left:0;top:0;right:0;bottom:0;background:var(--tone);opacity:.08;"></div>${badge(`fx${i}`, "M5 12.5 L10 17.5 L19 7", factTone)}${label(fLabel)}<div id="${b.id(`ft${i}`)}" class="abs b t" style="${box(PAD, TOP, tw)}font-size:${L.fs}px;">${rich(b.text(p.fact))}</div></div>`,
      );
      b.anim(enter(ctx, fid, factAt, { rise: 40, blur: 8 }));
      b.anim(draw(ctx, b.id(`fx${i}`), shift(factAt, 0.4), 0.45, "power2.out"));
      if (i < c - 1) b.anim(dim(ctx, fid, beatOf(pairs[i + 1].at?.myth, 2 * i + 2, 2 * c, n, 0.05), 0.5));
      y += L.h + rowGap;
    });
    return b.done();
  },
};
