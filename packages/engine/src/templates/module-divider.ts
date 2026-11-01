// Chuyển học phần: số học phần khổng lồ màu nhấn mờ làm nền, tên học phần, 1–3 mục tiêu, và thanh tiến độ khoá học N đoạn
// (đoạn đã học tô đầy lần lượt bằng scaleX, đoạn hiện tại sáng dần rồi nhấp nhẹ bằng opacity).
import type { Tone } from "@cvs/themes";
import { draw, enter, fade, shift } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, rich } from "../text";
import { beatOf, box, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

export type ModuleDividerParams = {
  /** Số thứ tự học phần (1…total). */
  number: number;
  /** Tổng số học phần của khoá (2–12) → số đoạn thanh tiến độ. */
  total: number;
  title: string;
  kicker?: string;
  goalsLabel?: string;
  goals?: { text: string; at?: Beat }[];
  tone?: Tone;
  at?: { title?: Beat };
};

export const moduleDivider: TemplateDef<ModuleDividerParams> = {
  id: "module-divider",
  label: "Chuyển học phần",
  when: "Mở đầu một học phần mới trong khoá: số học phần lớn, tên học phần, 1–3 mục tiêu học tập và thanh tiến độ khoá học (đã học bao nhiêu phần).",
  schema: {
    type: "object",
    properties: {
      number: { type: "integer", minimum: 1 },
      total: { type: "integer", minimum: 2, maximum: 12 },
      title: { type: "string" },
      kicker: { type: "string" },
      goalsLabel: { type: "string", description: "Nhãn danh sách mục tiêu, mặc định «Mục tiêu»" },
      goals: { type: "array", maxItems: 3, items: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] } },
      tone: toneSchema,
      at: { type: "object", properties: { title: beatSchema } },
    },
    required: ["number", "total", "title"],
  },
  example: {
    number: 2,
    total: 5,
    kicker: "Học phần 2",
    title: "Nhận diện mối nguy và đánh giá rủi ro",
    goals: [{ text: "Phân biệt **mối nguy** và **rủi ro**" }, { text: "Áp dụng ma trận khả năng × mức độ nghiêm trọng" }, { text: "Chọn biện pháp theo thứ bậc kiểm soát" }],
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const total = Math.max(2, Math.min(12, Math.round(P.total)));
    const num = Math.max(1, Math.min(total, Math.round(P.number)));
    const numStr = String(num).padStart(2, "0");
    const goals = (P.goals ?? []).slice(0, 3);
    const tone = toneClass(P.tone);
    const W = 1000;
    const x = SAFE.x0;
    const barY = 930;
    b.add(`<div class="abs ${tone}" style="${box(0, 0, 1920, 1080)}">`);

    // số khổng lồ mờ làm nền (bên phải, không chạm cột chữ)
    const bigSize = 540;
    b.text(numStr);
    b.add(`<div id="${b.id("num")}" class="abs d t" style="${box(SAFE.x1 - 820, 440 - bigSize * 0.5, 790)}font-size:${bigSize}px;line-height:1;text-align:right;color:var(--tone);letter-spacing:-0.04em;transform-origin:100% 50%;">${numStr}</div>`);
    b.anim({ id: b.id("num"), from: { opacity: 0, scale: 1.04, blur: 12 }, to: { opacity: 0.16, scale: 1, blur: 0 }, at: { t: 0.15 }, dur: ctx.slow ? 1.8 : 1.4, ease: "power2.out" });

    // cột chữ: kicker, tên học phần, nét kẻ, mục tiêu
    const tSize = fitSize(P.title, W, 84, { maxLines: 3, kind: "display", min: 48 });
    const tH = blockHeight(P.title, tSize, W, "display");
    const gLabel = P.goalsLabel ?? "Mục tiêu";
    if (goals.length && !P.goalsLabel) b.assume(`Nhãn «${gLabel}» do template thêm`);
    const gSize = goals.length ? Math.min(...goals.map((g) => fitSize(g.text, W - 56, 38, { maxLines: 2, min: 30 }))) : 0;
    const gH = goals.reduce((a, g) => a + blockHeight(g.text, gSize, (W - 56) * 0.92) + 20, 0);
    const colH = (P.kicker ? 62 : 0) + tH + 40 + (goals.length ? 70 + 56 + gH : 0);
    let y = Math.max(SAFE.y0 + 50, (barY - 60) / 2 + 20 - colH / 2);
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(x, y, W)}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.3 }, { rise: 14 }));
      y += 62;
    }
    const tAt: TimeRef = P.at?.title ? beatOf(P.at.title, 0, 1, n) : { t: 0.45 };
    b.add(`<div id="${b.id("title")}" class="abs d t" style="${box(x, y, W)}font-size:${tSize}px;">${rich(b.text(P.title))}</div>`);
    b.anim(enter(ctx, b.id("title"), tAt, { rise: 30, blur: 8 }));
    y += tH + 26;
    b.add(`<svg class="abs" style="${box(x, y, 240, 10)}overflow:visible" viewBox="0 0 240 10"><path id="${b.id("rule")}" class="draw" pathLength="1" d="M3 5 H237" style="fill:none;stroke:var(--tone);stroke-width:8px;stroke-linecap:round"/></svg>`);
    b.anim(draw(ctx, b.id("rule"), shift(tAt, 0.4), 0.7));
    y += 14;
    if (goals.length) {
      y += 56;
      b.add(`<div id="${b.id("glabel")}" class="abs b bb soft t" style="${box(x, y, W)}font-size:30px;letter-spacing:.04em;">${esc(b.text(gLabel))}</div>`);
      // mục tiêu i ở vị trí i+1 trong (tiêu đề, mục tiêu…) rải trên các câu
      const gBeat = (i: number) => beatOf(goals[i].at, i + 1, goals.length + 1, n, 0.05);
      const gAt0 = gBeat(0);
      b.anim(enter(ctx, b.id("glabel"), shift(gAt0, -0.15), { rise: 10 }));
      y += 56;
      goals.forEach((g, i) => {
        const at = gBeat(i);
        const id = b.id(`g${i}`);
        b.add(
          `<div id="${id}" class="abs b t" style="${box(x, y, W)}font-size:${gSize}px;padding-left:56px;"><span class="abs" style="left:4px;top:${px(gSize * 0.36)};width:26px;height:${px(gSize * 0.26)};border-radius:4px;background:var(--tone);"></span>${rich(b.text(g.text))}</div>`,
        );
        b.anim(enter(ctx, id, at, { x: 24, rise: 0 }));
        y += blockHeight(g.text, gSize, (W - 56) * 0.92) + 20;
      });
    }

    // thanh tiến độ khoá học: N đoạn
    const gap = total > 8 ? 10 : 16;
    const segW = (SAFE.w - gap * (total - 1)) / total;
    const segH = 14;
    const prog = `${num} / ${total}`;
    b.text(prog);
    b.assume(`Tiến độ «${prog}» do template tính từ number/total`);
    b.add(`<div id="${b.id("prog")}" class="abs b bb t" style="${box(SAFE.x1 - 300, barY + 30, 300)}font-size:30px;text-align:right;color:var(--tone);">${esc(prog)}</div>`);
    b.anim(fade(ctx, b.id("prog"), { t: 0.6 }, 0.5));
    let t0 = 0.7;
    for (let i = 0; i < total; i++) {
      const sx = SAFE.x0 + i * (segW + gap);
      const tid = b.id(`tr${i}`);
      b.add(`<div id="${tid}" class="abs" style="${box(sx, barY, segW, segH)}border-radius:${px(segH / 2)};background:var(--line);opacity:.16;"></div>`);
      b.anim({ id: tid, from: { opacity: 0, scaleX: 0.6 }, to: { opacity: 0.16, scaleX: 1 }, at: { t: Math.min(0.95, 0.35 + i * 0.04) }, dur: 0.5, ease: "power2.out" });
      if (i > num - 1) continue;
      const fid = b.id(`fl${i}`);
      b.add(`<div id="${fid}" class="abs" style="${box(sx, barY, segW, segH)}border-radius:${px(segH / 2)};background:var(--tone);transform-origin:0% 50%;"></div>`);
      const at: TimeRef = { cue: 0, f: 0, d: t0 };
      if (i < num - 1) {
        // đã học: tô đầy lần lượt
        b.anim({ id: fid, from: { scaleX: 0 }, to: { scaleX: 1 }, at, dur: 0.35, ease: "power2.inOut" });
        t0 += 0.22;
      } else {
        // đang học: sáng dần rồi nhấp nhẹ hai lần (chậm, không nhấp nháy)
        const p = ctx.slow ? 1.1 : 0.9;
        b.anim({ id: fid, from: { opacity: 0 }, to: { opacity: 1 }, at: { ...at, d: t0 + 0.2 }, dur: 0.5, ease: "power2.out" });
        b.anim({ id: fid, from: { opacity: 1 }, to: { opacity: 0.45 }, at: { ...at, d: t0 + 0.9 }, dur: p, ease: "sine.inOut" });
        b.anim({ id: fid, from: { opacity: 0.45 }, to: { opacity: 1 }, at: { ...at, d: t0 + 0.9 + p }, dur: p, ease: "sine.inOut" });
        b.anim({ id: fid, from: { opacity: 1 }, to: { opacity: 0.6 }, at: { ...at, d: t0 + 0.9 + 2 * p }, dur: p, ease: "sine.inOut" });
        b.anim({ id: fid, from: { opacity: 0.6 }, to: { opacity: 1 }, at: { ...at, d: t0 + 0.9 + 3 * p }, dur: p, ease: "sine.inOut" });
      }
    }
    b.add(`</div>`);
    return b.done();
  },
};
