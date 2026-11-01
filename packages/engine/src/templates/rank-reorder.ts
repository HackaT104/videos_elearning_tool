// rank-reorder – Xếp hạng thay đổi: 3–6 hàng (nhãn + thanh). Giai đoạn 1: thanh mọc (scaleX) theo giá trị cũ, số đếm 0 → cũ.
// Tại mốc câu sau: các hàng đổi chỗ (tween y, mỗi hàng có y cũ → y mới tính sẵn), thanh co giãn cũ → mới, số đếm cũ → mới.
// Thang trục cố định theo max(cũ, mới) – không đổi thang giữa chừng. Ô số hạng (1, 2, 3…) đứng yên, hàng trượt qua.

import type { Tone } from "@cvs/themes";
import { dim, enter, fade, move, shift } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, formatViNumber, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

export type RankReorderParams = {
  kicker?: string;
  title?: string;
  unit?: string;
  /** Nhãn kỳ cũ / kỳ mới (ví dụ "2023" → "2024"). */
  fromLabel?: string;
  toLabel?: string;
  /** 3–6 hàng: giá trị kỳ cũ (from) và kỳ mới (to). */
  items: { label: string; from: number; to: number; tone?: Tone }[];
  /** Hàng được nhấn mạnh (mặc định: hàng tăng hạng nhiều nhất). */
  highlight?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  note?: string;
  at?: { grow?: Beat; reorder?: Beat; note?: Beat };
};

const decOf = (v: number) => (Number.isInteger(v) ? 0 : Math.min(2, String(v).split(".")[1]?.length ?? 1));

/** Thứ hạng (0 = cao nhất) theo giá trị giảm dần, hoà thì giữ thứ tự nhập. */
export function ranks(vals: number[]): number[] {
  const order = vals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const r = new Array(vals.length).fill(0);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
}

export const rankReorder: TemplateDef<RankReorderParams> = {
  id: "rank-reorder",
  label: "Xếp hạng thay đổi",
  when: "So sánh thứ hạng 3–6 hạng mục giữa hai kỳ (năm trước/năm nay, trước/sau cải tiến) khi tài liệu có số liệu cả hai kỳ và thứ tự thay đổi.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      unit: { type: "string" },
      fromLabel: { type: "string" },
      toLabel: { type: "string" },
      items: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: { type: "object", properties: { label: { type: "string" }, from: { type: "number" }, to: { type: "number" }, tone: toneSchema }, required: ["label", "from", "to"] },
      },
      highlight: { type: "integer", minimum: 0, maximum: 5 },
      decimals: { type: "integer", minimum: 0, maximum: 2 },
      prefix: { type: "string" },
      suffix: { type: "string" },
      note: { type: "string" },
      at: { type: "object", properties: { grow: beatSchema, reorder: beatSchema, note: beatSchema } },
    },
    required: ["items"],
  },
  example: {
    title: "Nguyên nhân sự cố an toàn tại xưởng",
    unit: "Số vụ ghi nhận",
    fromLabel: "2023",
    toLabel: "2024",
    items: [
      { label: "Trượt ngã", from: 42, to: 18 },
      { label: "Va chạm xe nâng", from: 31, to: 12 },
      { label: "Vật rơi", from: 17, to: 20 },
      { label: "Hoá chất", from: 9, to: 6 },
      { label: "Điện giật", from: 5, to: 2 },
    ],
    highlight: 2,
    note: "Vật rơi thành **rủi ro hàng đầu** – ưu tiên khu vực kệ cao",
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const items = P.items.slice(0, 6);
    const k = items.length;
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const r0 = ranks(items.map((x) => x.from));
    const r1 = ranks(items.map((x) => x.to));
    const hi = P.highlight !== undefined ? Math.max(0, Math.min(k - 1, P.highlight)) : items.map((_, i) => r0[i] - r1[i]).reduce((best, d, i, arr) => (d > arr[best] ? i : best), 0);
    const maxV = Math.max(1e-9, ...items.flatMap((x) => [Math.abs(x.from), Math.abs(x.to)]));
    const decs = P.decimals ?? Math.max(...items.flatMap((x) => [decOf(x.from), decOf(x.to)]));
    const fmt = (v: number) => `${P.prefix ?? ""}${formatViNumber(v, decs)}${P.suffix ?? ""}`;

    // mốc
    const growAt: TimeRef = P.at?.grow ? beatOf(P.at.grow, 0, 1, n) : { cue: 0, f: 0.15 };
    const reAt: TimeRef = P.at?.reorder ? beatOf(P.at.reorder, 0, 1, n) : n > 1 ? { cue: 1, f: 0.1 } : { cue: 0, f: 0.6 };
    const noteAt: TimeRef = P.at?.note ? beatOf(P.at.note, 0, 1, n) : n > 2 ? { cue: n - 1, f: 0.1 } : shift(reAt, 1.6);
    const reDur = ctx.slow ? 1.5 : 1.2;
    const reEase = "power2.inOut";

    // dòng đơn vị + nhãn kỳ
    let top = y0;
    const tagW = 300;
    const hasTag = !!(P.fromLabel || P.toLabel);
    if (P.unit || hasTag) {
      if (P.unit) {
        b.add(`<div id="${b.id("unit")}" class="abs b soft t" style="${box(SAFE.x0, top, SAFE.w - (hasTag ? tagW + 20 : 0))}font-size:${fitSize(P.unit, SAFE.w - tagW, 30, { maxLines: 1, min: 28 })}px;">${rich(b.text(P.unit))}</div>`);
        b.anim(fade(ctx, b.id("unit"), { t: 0.5 }));
      }
      if (hasTag) {
        const tag = (id: string, s: string) => {
          const fs = fitSize(s, tagW, 56, { maxLines: 1, kind: "display", min: 32 });
          b.add(`<div id="${b.id(id)}" class="abs d t tone-accent" style="${box(SAFE.x1 - tagW, top - 12, tagW)}font-size:${fs}px;text-align:right;color:var(--tone);white-space:nowrap;">${rich(b.text(s))}</div>`);
        };
        if (P.fromLabel) {
          tag("tag0", P.fromLabel);
          b.anim(enter(ctx, b.id("tag0"), growAt, { rise: 14 }));
          if (P.toLabel) b.anim({ id: b.id("tag0"), from: { opacity: 1, y: 0 }, to: { opacity: 0, y: -24 }, at: shift(reAt, -0.1), dur: 0.4, ease: "power2.in" });
        }
        if (P.toLabel) {
          tag("tag1", P.toLabel);
          b.anim({ id: b.id("tag1"), from: { opacity: 0, y: 24 }, to: { opacity: 1, y: 0 }, at: shift(reAt, 0.25), dur: 0.5, ease: "power2.out" });
        }
      }
      top += 64;
    }

    // hàng
    const ns = P.note ? fitSize(P.note, SAFE.w - 40, 38, { maxLines: 2, min: 30 }) : 0;
    const noteH = P.note ? blockHeight(P.note, ns, SAFE.w - 40) : 0;
    const bottom = SAFE.y1 - 30 - (P.note ? noteH + 36 : 0);
    const rh = Math.min(132, (bottom - top) / k);
    const rows0 = top + (bottom - top - rh * k) / 2;
    const slotY = (r: number) => rows0 + r * rh;
    const numW = 64;
    const lSize0 = Math.min(40, Math.max(28, Math.floor(rh * 0.34)));
    const longest = Math.max(...items.map((x) => x.label.length));
    const labelW = Math.max(300, Math.min(560, Math.ceil(longest * 0.53 * lSize0) + 20));
    const barX = numW + 20 + labelW + 24; // trong hàng
    const vs = Math.min(44, Math.max(30, Math.floor(rh * 0.36)));
    const valW = Math.max(...items.flatMap((x) => [fmt(x.from).length, fmt(x.to).length])) * vs * 0.62 + 24;
    const maxLen = SAFE.w - barX - valW - 20;
    const bh = Math.min(56, Math.max(26, rh * 0.46));

    // ô số hạng (đứng yên)
    for (let r = 0; r < k; r++) {
      const id = b.id(`no${r}`);
      b.text(String(r + 1));
      b.add(`<div id="${id}" class="abs d t" style="${box(SAFE.x0, slotY(r) + rh / 2 - vs * 0.62, numW)}font-size:${vs}px;color:var(--ink-soft);text-align:right;">${r + 1}</div>`);
      b.anim(fade(ctx, id, { t: 0.4 + r * 0.08 }, 0.5));
    }

    // hàng nhấn mạnh vẽ sau cùng (nằm trên khi lướt qua nhau)
    const order = items.map((_, i) => i).sort((a, c) => (a === hi ? 1 : c === hi ? -1 : r0[a] - r0[c]));
    for (const i of order) {
      const it = items[i];
      const tone = toneClass(it.tone ?? (i === hi ? "accent" : "alt"));
      const rid = b.id(`r${i}`);
      const ls = fitSize(it.label, labelW, lSize0, { maxLines: rh > 104 ? 2 : 1, min: 28 });
      const lh = blockHeight(it.label, ls, labelW);
      const l0 = (Math.abs(it.from) / maxV) * maxLen;
      const l1 = (Math.abs(it.to) / maxV) * maxLen;
      b.add(
        `<div id="${rid}" class="abs ${tone}" style="${box(SAFE.x0, slotY(r0[i]), SAFE.w, rh)}">` +
          `<div class="abs b t" style="left:${px(numW + 20)};top:${px((rh - lh) / 2)};width:${px(labelW)};font-size:${ls}px;${i === hi ? "font-weight:var(--w-bold);" : ""}">${rich(b.text(it.label))}</div>` +
          `<div id="${b.id(`bar${i}`)}" class="abs" style="left:${px(barX)};top:${px((rh - bh) / 2)};width:${px(maxLen)};height:${px(bh)};background:var(--tone);border-radius:0 6px 6px 0;transform-origin:0% 50%;${i === hi ? "" : "opacity:.7;"}"></div>` +
          `<div id="${b.id(`val${i}`)}" class="abs" style="left:${px(barX + 16)};top:${px(rh / 2 - vs * 0.62)};width:${px(valW)};height:${px(vs * 1.3)};">` +
          `<div id="${b.id(`vo${i}`)}" class="abs d" style="left:0;top:0;font-size:${vs}px;color:var(--tone);white-space:nowrap;font-variant-numeric:tabular-nums;">${esc(fmt(0))}</div>` +
          `<div id="${b.id(`vn${i}`)}" class="abs d" style="left:0;top:0;font-size:${vs}px;color:var(--tone);white-space:nowrap;font-variant-numeric:tabular-nums;">${esc(fmt(it.from))}</div>` +
          `</div></div>`,
      );
      b.text(fmt(it.from));
      b.text(fmt(it.to));
      const g = shift(growAt, r0[i] * 0.1);
      b.anim(enter(ctx, rid, { t: 0.4 + r0[i] * 0.08 }, { x: -20, rise: 0 }));
      // giai đoạn 1: mọc theo giá trị cũ
      const gDur = ctx.slow ? 1.4 : 1.1;
      b.anim(move(ctx, b.id(`bar${i}`), g, { scaleX: 0 }, { scaleX: l0 / maxLen }, gDur));
      b.anim(move(ctx, b.id(`val${i}`), g, { x: 0 }, { x: l0 }, gDur));
      b.anim(fade(ctx, b.id(`vo${i}`), g, 0.3));
      b.count({ id: b.id(`vo${i}`), from: 0, to: it.from, decimals: decs, prefix: P.prefix, suffix: P.suffix, at: g, dur: gDur, ease: ctx.theme.motion.moveEase });
      // giai đoạn 2: đổi chỗ + co giãn tới giá trị mới
      const dy = slotY(r1[i]) - slotY(r0[i]);
      if (dy) b.anim({ id: rid, from: { y: 0 }, to: { y: dy }, at: reAt, dur: reDur, ease: reEase });
      b.anim({ id: b.id(`bar${i}`), from: { scaleX: l0 / maxLen }, to: { scaleX: l1 / maxLen }, at: reAt, dur: reDur, ease: reEase });
      b.anim({ id: b.id(`val${i}`), from: { x: l0 }, to: { x: l1 }, at: reAt, dur: reDur, ease: reEase });
      b.anim({ id: b.id(`vo${i}`), from: { opacity: 1 }, to: { opacity: 0 }, at: reAt, dur: 0.1, ease: "none" });
      b.anim({ id: b.id(`vn${i}`), from: { opacity: 0 }, to: { opacity: 1 }, at: reAt, dur: 0.1, ease: "none" });
      b.count({ id: b.id(`vn${i}`), from: it.from, to: it.to, decimals: decs, prefix: P.prefix, suffix: P.suffix, at: reAt, dur: reDur, ease: reEase });
      // một điểm nhấn: các hàng khác lùi lại sau khi đổi chỗ xong
      if (i !== hi) b.anim(dim(ctx, rid, shift(reAt, reDur + 0.2), 0.6));
    }

    if (P.note) {
      const id = b.id("note");
      b.add(`<div id="${id}" class="abs b t tone-accent" style="${box(SAFE.x0, SAFE.y1 - 30 - noteH, SAFE.w)}font-size:${ns}px;border-left:8px solid var(--tone);padding-left:28px;">${rich(b.text(P.note))}</div>`);
      b.anim(enter(ctx, id, noteAt, { rise: 16 }));
    }
    return b.done();
  },
};
