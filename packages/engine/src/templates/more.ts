import type { Tone } from "@cvs/themes";
import { iconSvg } from "../icons";
import { dim, draw, enter, fade, grow, move, pop, shift, undim } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };
const iconSchema = { type: "string", description: "Tên biểu tượng trong thư viện" };
const headerProps = { kicker: { type: "string" }, title: { type: "string" } };

// ---------------- process-steps ----------------
export type ProcessStepsParams = { kicker?: string; title?: string; steps: { title: string; text?: string; at?: Beat }[] };

export const processSteps: TemplateDef<ProcessStepsParams> = {
  id: "process-steps",
  label: "Các bước có thanh tiến trình",
  when: "Quy trình 3–6 bước theo thứ tự, mỗi bước một câu giải thích.",
  schema: { type: "object", properties: { ...headerProps, steps: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { title: { type: "string" }, text: { type: "string" }, at: beatSchema }, required: ["title"] } } }, required: ["steps"] },
  example: { title: "Quy trình cấp tín chỉ", steps: [{ title: "Giám sát", text: "Chủ dự án đo đạc kết quả" }, { title: "Thẩm tra", text: "VVB kiểm tra báo cáo" }, { title: "Cấp VCU", text: "Verra cấp tín chỉ" }] },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const steps = P.steps.slice(0, 6);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const avail0 = 1000 - y0;
    const rowH0 = Math.min(200, avail0 / steps.length);
    const yc = Math.max(0, (avail0 - rowH0 * steps.length) / 2);
    const avail = avail0;
    const rowH = rowH0;
    void avail;
    const node = Math.min(72, rowH - 24);
    const railX = SAFE.x0 + node / 2;
    const yFirst = y0 + yc + node / 2;
    const yLast = y0 + yc + (steps.length - 1) * rowH + node / 2;
    b.add(`<div class="abs" style="${box(railX - 3, yFirst, 6, yLast - yFirst)}background:var(--grid);border-radius:3px;"></div>`);
    b.add(`<div id="${b.id("rail")}" class="abs tone-accent" style="${box(railX - 3, yFirst, 6, yLast - yFirst)}background:var(--tone);border-radius:3px;transform-origin:50% 0%;"></div>`);
    const beats = steps.map((s, i) => beatOf(s.at, i, steps.length, n, 0.05));
    const tx = SAFE.x0 + node + 36;
    const tw = SAFE.w - node - 36;
    steps.forEach((s, i) => {
      const y = y0 + yc + i * rowH;
      const tSize = fitSize(s.title, tw, Math.min(46, rowH * 0.32), { maxLines: 1, kind: "display", min: 30 });
      const xSize = s.text ? fitSize(s.text, tw, Math.min(32, rowH * 0.22), { maxLines: rowH > 150 ? 2 : 1, min: 28 }) : 0;
      b.add(`<div id="${b.id(`n${i}`)}" class="abs d tone-accent" style="${box(SAFE.x0, y, node, node)}border-radius:50%;background:var(--tone);color:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:${px(node * 0.45)};">${i + 1}</div>`);
      b.add(`<div id="${b.id(`t${i}`)}" class="abs" style="${box(tx, y + node / 2 - tSize * 0.62, tw)}"><div class="d t" style="font-size:${tSize}px;">${rich(b.text(s.title))}</div>${s.text ? `<div class="b soft t" style="font-size:${xSize}px;margin-top:8px;">${rich(b.text(s.text))}</div>` : ""}</div>`);
      b.anim(pop(ctx, b.id(`n${i}`), beats[i]));
      b.anim(enter(ctx, b.id(`t${i}`), shift(beats[i], 0.1), { x: -24, rise: 0 }));
      if (i < steps.length - 1) b.anim(dim(ctx, b.id(`t${i}`), beats[i + 1], 0.45));
    });
    // thanh tiến trình chạy theo từng bước
    for (let i = 1; i < steps.length; i++) {
      const from = (i - 1) / (steps.length - 1);
      const to = i / (steps.length - 1);
      b.anim(move(ctx, b.id("rail"), shift(beats[i], -0.6), { scaleY: from }, { scaleY: to }, 0.6));
    }
    b.anims.unshift({ id: b.id("rail"), from: { scaleY: 0 }, to: { scaleY: 0 }, at: { t: 0 }, dur: 0.01, ease: "none" });
    const last: TimeRef = { cue: n - 1, f: 0.8 };
    steps.slice(0, -1).forEach((_, i) => b.anim(undim(ctx, b.id(`t${i}`), last, 0.45)));
    return b.done();
  },
};

// ---------------- timeline-run ----------------
export type TimelineRunParams = { kicker?: string; title?: string; points: { label: string; text: string; tone?: Tone; at?: Beat }[]; series?: { values: number[]; label?: string } };

export const timelineRun: TemplateDef<TimelineRunParams> = {
  id: "timeline-run",
  label: "Thanh thời gian chạy",
  when: "Các mốc thời gian (năm, giai đoạn, hạn chót) theo thứ tự; tùy chọn đồ thị nếu tài liệu có số liệu.",
  schema: {
    type: "object",
    properties: {
      ...headerProps,
      points: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, text: { type: "string" }, tone: toneSchema, at: beatSchema }, required: ["label", "text"] } },
      series: { type: "object", properties: { values: { type: "array", items: { type: "number" } }, label: { type: "string" } }, required: ["values"] },
    },
    required: ["points"],
  },
  example: { title: "Các mốc chính", points: [{ label: "1997", text: "Nghị định thư Kyoto" }, { label: "2015", text: "Thỏa thuận Paris" }] },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const pts = P.points.slice(0, 6);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const axisY = P.series ? 760 : Math.max(y0 + 200, 640);
    const x0 = SAFE.x0 + 40;
    const x1 = SAFE.x1 - 40;
    const step = (x1 - x0) / Math.max(1, pts.length - 1);
    const xs = pts.map((_, i) => (pts.length === 1 ? (x0 + x1) / 2 : x0 + i * step));
    b.add(`<svg class="abs" style="${box(SAFE.x0, axisY - 3, SAFE.w, 6)}overflow:visible" viewBox="0 0 ${SAFE.w} 6"><path id="${b.id("axis")}" class="line draw" pathLength="1" d="M0 3 H${SAFE.w}" style="stroke:var(--ink-soft)"/></svg>`);
    b.anim(draw(ctx, b.id("axis"), { t: 0.35 }, 1.0));
    const beats = pts.map((p, i) => beatOf(p.at, i, pts.length, n, 0.05));
    if (P.series && P.series.values.length > 1) {
      const vals = P.series.values;
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const gTop = y0 + 20;
      const gH = axisY - 80 - gTop;
      const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${(i * SAFE.w) / (vals.length - 1)} ${gH - ((v - lo) / Math.max(1e-9, hi - lo)) * gH}`).join(" ");
      b.add(`<svg class="abs tone-alt" style="${box(SAFE.x0, gTop, SAFE.w, gH)}overflow:visible" viewBox="0 0 ${SAFE.w} ${gH}"><path id="${b.id("graph")}" class="line draw" pathLength="1" d="${d}" style="stroke:var(--tone);stroke-width:5px"/></svg>`);
      b.anim({ ...draw(ctx, b.id("graph"), beats[0], 2.4, "sine.inOut"), until: beats[beats.length - 1] });
      if (P.series.label) {
        b.add(`<div id="${b.id("glabel")}" class="abs b soft t" style="${box(SAFE.x0, gTop - 8, 900)}font-size:28px;">${rich(b.text(P.series.label))}</div>`);
        b.anim(fade(ctx, b.id("glabel"), beats[0]));
      }
    }
    // con chạy
    b.add(`<div id="${b.id("run")}" class="abs tone-accent" style="${box(xs[0] - 14, axisY - 14, 28, 28)}border-radius:50%;background:var(--tone);"></div>`);
    b.anim(pop(ctx, b.id("run"), beats[0]));
    const colW = Math.min(420, pts.length > 1 ? step - 24 : 600);
    pts.forEach((p, i) => {
      const x = xs[i];
      const tone = toneClass(p.tone);
      if (i > 0) b.anim(move(ctx, b.id("run"), shift(beats[i], -0.5), { x: xs[i - 1] - xs[0] }, { x: x - xs[0] }, 0.7));
      b.add(`<div id="${b.id(`m${i}`)}" class="abs ${tone}" style="${box(x - 11, axisY - 11, 22, 22)}border-radius:50%;border:5px solid var(--tone);background:var(--bg3);"></div>`);
      b.anim(pop(ctx, b.id(`m${i}`), shift(beats[i], 0.15)));
      const ls = fitSize(p.label, colW, 52, { maxLines: 1, kind: "display", min: 32 });
      const lx = Math.max(SAFE.x0, Math.min(SAFE.x1 - colW, x - colW / 2));
      b.add(`<div id="${b.id(`l${i}`)}" class="abs d t ${tone}" style="${box(lx, axisY - 36 - ls * 1.12, colW)}font-size:${ls}px;text-align:center;color:var(--tone);">${rich(b.text(p.label))}</div>`);
      const ts = fitSize(p.text, colW, 32, { maxLines: 3, min: 28 });
      b.add(`<div id="${b.id(`x${i}`)}" class="abs b t" style="${box(lx, axisY + 34, colW)}font-size:${ts}px;text-align:center;">${rich(b.text(p.text))}</div>`);
      b.anim(enter(ctx, b.id(`l${i}`), shift(beats[i], 0.2), { rise: 16 }));
      b.anim(enter(ctx, b.id(`x${i}`), shift(beats[i], 0.35), { rise: -16 }));
    });
    return b.done();
  },
};

// ---------------- document-transform ----------------
type Doc = { title: string; lines: string[]; tone?: Tone; icon?: string };
export type DocumentTransformParams = { kicker?: string; title?: string; from: Doc; to: Doc & { stamp?: string }; arrowLabel?: string; at?: { from?: Beat; arrow?: Beat; to?: Beat; stamp?: Beat } };

export const documentTransform: TemplateDef<DocumentTransformParams> = {
  id: "document-transform",
  label: "Tài liệu A → tài liệu B",
  when: "Một tài liệu/hồ sơ được xử lý thành tài liệu khác (báo cáo giám sát → chứng nhận, PD → dự án đăng ký).",
  schema: {
    type: "object",
    properties: {
      ...headerProps,
      from: { $ref: "#/$defs/doc" },
      to: { allOf: [{ $ref: "#/$defs/doc" }], properties: { stamp: { type: "string" } } },
      arrowLabel: { type: "string" },
      at: { type: "object", properties: { from: beatSchema, arrow: beatSchema, to: beatSchema, stamp: beatSchema } },
    },
    required: ["from", "to"],
    $defs: { doc: { type: "object", properties: { title: { type: "string" }, lines: { type: "array", maxItems: 4, items: { type: "string" } }, tone: toneSchema, icon: iconSchema }, required: ["title", "lines"] } },
  },
  example: { from: { title: "Báo cáo giám sát", lines: ["Kết quả đo đạc", "Giai đoạn giám sát"] }, to: { title: "Chứng nhận tín chỉ", lines: ["Lượng giảm đã thẩm tra"], stamp: "ĐÃ THẨM TRA" }, arrowLabel: "Thẩm tra" },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const w = 640;
    const h = Math.min(600, 990 - y0);
    const y = y0 + (990 - y0 - h) / 2;
    const aFrom = beatOf(P.at?.from, 0, 3, n, 0.05);
    const aArrow = beatOf(P.at?.arrow, 1, 3, n, 0.1);
    const aTo = beatOf(P.at?.to, 2, 3, n, 0.05);
    const doc = (d: Doc, x: number, k: string, defTone: Tone) => {
      const ts = fitSize(d.title, w - 80 - 88, 44, { maxLines: 2, kind: "display", min: 30 });
      let ly = 0;
      const lines = d.lines.slice(0, 4).map((l, i) => {
        const s = fitSize(l, w - 80 - 30, 32, { maxLines: 2, min: 28 });
        const html = `<div class="b t" style="font-size:${s}px;padding-left:30px;position:relative;margin-top:${i ? 18 : 0}px;"><span class="abs" style="left:0;top:${px(s * 0.5)};width:16px;height:4px;background:var(--tone);"></span>${rich(b.text(l))}</div>`;
        ly += blockHeight(l, s, w - 110) + 18;
        return html;
      });
      b.add(
        `<div id="${b.id(k)}" class="card ${toneClass(d.tone ?? defTone)}" style="${box(x, y, w, h)}"><div style="display:flex;gap:24px;align-items:center;margin-bottom:34px;"><div class="icon" style="width:64px;height:64px;flex:none;">${iconSvg(d.icon ?? (k === "to" ? "certificate" : "document"))}</div><div class="d t" style="font-size:${ts}px;">${rich(
          b.text(d.title),
        )}</div></div><div style="height:4px;background:var(--grid);margin-bottom:30px;"></div>${lines.join("")}</div>`,
      );
      void ly;
    };
    doc(P.from, SAFE.x0, "from", "neutral");
    doc(P.to, SAFE.x1 - w, "to", "accent");
    b.anim(enter(ctx, b.id("from"), aFrom, { x: -40, rise: 0 }));
    const ax = SAFE.x0 + w + 40;
    const aw = SAFE.x1 - w - 40 - ax;
    b.add(`<svg class="abs" style="${box(ax, y + h / 2 - 30, aw, 60)}overflow:visible" viewBox="0 0 ${aw} 60"><path id="${b.id("arrow")}" class="line draw" pathLength="1" d="M0 30 H${aw - 6} M${aw - 26} 12 L${aw - 4} 30 L${aw - 26} 48" style="stroke:var(--accent);stroke-width:6px"/></svg>`);
    b.anim(draw(ctx, b.id("arrow"), aArrow, 0.8));
    if (P.arrowLabel) {
      const s = fitSize(P.arrowLabel, aw + 40, 34, { maxLines: 2, min: 28 });
      b.add(`<div id="${b.id("alabel")}" class="abs b bb t tone-accent" style="${box(ax - 20, y + h / 2 - 50 - s * 2.7, aw + 40)}font-size:${s}px;text-align:center;color:var(--tone);display:flex;align-items:flex-end;justify-content:center;height:${px(s * 2.7)};">${rich(b.text(P.arrowLabel))}</div>`);
      b.anim(enter(ctx, b.id("alabel"), shift(aArrow, 0.3), { rise: 12 }));
    }
    b.anim(dim(ctx, b.id("from"), aTo, 0.5));
    b.anim(enter(ctx, b.id("to"), aTo, { x: 40, rise: 0 }));
    if (P.to.stamp) {
      const aStamp = beatOf(P.at?.stamp, n - 1, 1, n, 0.4);
      b.add(`<div id="${b.id("stamp")}" class="abs d t tone-accent" style="${box(SAFE.x1 - 470, y + h - 170, 420)}font-size:${fitSize(P.to.stamp, 360, 40, { maxLines: 1, kind: "display", min: 28 })}px;color:var(--tone);border:5px solid var(--tone);border-radius:10px;padding:14px 22px;text-align:center;">${rich(b.text(P.to.stamp))}</div>`);
      b.anim({ id: b.id("stamp"), from: { opacity: 0, scale: 1.6, rotate: -14 }, to: { opacity: 1, scale: 1, rotate: -8 }, at: aStamp, dur: 0.5, ease: "power4.out" });
    }
    return b.done();
  },
};

// ---------------- cause-effect ----------------
export type CauseEffectParams = {
  kicker?: string;
  title?: string;
  cause: { label: string; icon?: string; tone?: Tone };
  effect: { label: string; icon?: string; tone?: Tone };
  token: { label?: string; icon?: string; tone?: Tone };
  note?: string;
  at?: { cause?: Beat; token?: Beat; effect?: Beat; note?: Beat };
};

export const causeEffect: TemplateDef<CauseEffectParams> = {
  id: "cause-effect",
  label: "Vật thể bay giữa các khối",
  when: "Một thứ (hóa đơn, tiền, tín chỉ, khí thải) di chuyển từ bên này sang bên kia: mua bán, chi trả, chuyển giao.",
  schema: {
    type: "object",
    properties: {
      ...headerProps,
      cause: { type: "object", properties: { label: { type: "string" }, icon: iconSchema, tone: toneSchema }, required: ["label"] },
      effect: { type: "object", properties: { label: { type: "string" }, icon: iconSchema, tone: toneSchema }, required: ["label"] },
      token: { type: "object", properties: { label: { type: "string" }, icon: iconSchema, tone: toneSchema } },
      note: { type: "string" },
      at: { type: "object", properties: { cause: beatSchema, token: beatSchema, effect: beatSchema, note: beatSchema } },
    },
    required: ["cause", "effect", "token"],
  },
  example: { cause: { label: "Doanh nghiệp", icon: "building" }, effect: { label: "Dự án trồng rừng", icon: "forest" }, token: { label: "Chi trả", icon: "coin", tone: "money" } },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const w = 500;
    const h = 380;
    const cy = y0 + (P.note ? 900 : 990 - y0) / 2 - (P.note ? y0 / 2 - 40 : 0);
    const y = Math.max(y0, Math.min(cy - h / 2, (P.note ? 860 : 990) - h));
    const aC = beatOf(P.at?.cause, 0, 3, n, 0.05);
    const aT = beatOf(P.at?.token, 1, 3, n, 0.2);
    const aE = beatOf(P.at?.effect, 2, 3, n, 0.05);
    const blk = (s: { label: string; icon?: string; tone?: Tone }, x: number, k: string, tone: Tone) => {
      const ls = fitSize(s.label, w - 80, 44, { maxLines: 2, kind: "display", min: 30 });
      b.add(`<div id="${b.id(k)}" class="card ${toneClass(s.tone ?? tone)}" style="${box(x, y, w, h)}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"><div class="icon" style="width:150px;height:150px;margin-bottom:26px;">${iconSvg(s.icon)}</div><div class="d t" style="font-size:${ls}px;">${rich(b.text(s.label))}</div></div>`);
    };
    blk(P.cause, SAFE.x0, "cause", "alt");
    blk(P.effect, SAFE.x1 - w, "effect", "accent");
    b.anim(enter(ctx, b.id("cause"), aC, { x: -30, rise: 0 }));
    b.anim(enter(ctx, b.id("effect"), aE, { x: 30, rise: 0 }));
    // đường bay
    const sx = SAFE.x0 + w + 30;
    const ex = SAFE.x1 - w - 30;
    const lw = ex - sx;
    b.add(`<svg class="abs" style="${box(sx, y + h / 2 - 150, lw, 160)}overflow:visible" viewBox="0 0 ${lw} 160"><path id="${b.id("path")}" class="line draw" pathLength="1" d="M0 150 Q ${lw / 2} -60 ${lw} 150" style="stroke:var(--ink-soft);stroke-dasharray:1;opacity:.6"/></svg>`);
    b.anim(draw(ctx, b.id("path"), shift(aT, -0.5), 0.6));
    const ts = 120;
    const tokTone = toneClass(P.token.tone ?? "money");
    b.add(`<div id="${b.id("token")}" class="abs ${tokTone}" style="${box(sx - ts / 2, y + h / 2 - ts / 2, ts, ts + 50)}text-align:center;"><div class="icon" style="width:${ts}px;height:${ts}px;background:var(--bg3);border-radius:50%;padding:22px;border:4px solid var(--tone);">${iconSvg(P.token.icon ?? "coin")}</div></div>`);
    if (P.token.label) b.text(P.token.label);
    const flyDur = ctx.slow ? 1.8 : 1.4;
    b.anim(pop(ctx, b.id("token"), aT));
    b.anim({ id: b.id("token"), from: { x: 0 }, to: { x: lw }, at: shift(aT, 0.35), dur: flyDur, ease: "power1.inOut" });
    b.anim({ id: b.id("token"), from: { y: 0 }, to: { y: -150 }, at: shift(aT, 0.35), dur: flyDur / 2, ease: "power2.out" });
    b.anim({ id: b.id("token"), from: { y: -150 }, to: { y: 0 }, at: shift(aT, 0.35 + flyDur / 2), dur: flyDur / 2, ease: "power2.in" });
    b.anim({ id: b.id("token"), from: { opacity: 1, scale: 1 }, to: { opacity: 0, scale: 0.5 }, at: shift(aT, 0.35 + flyDur - 0.15), dur: 0.35, ease: "power2.in" });
    b.anim({ id: b.id("effect"), from: { scale: 1 }, to: { scale: 1.04 }, at: shift(aT, 0.35 + flyDur), dur: 0.2, ease: "power2.out" });
    b.anim({ id: b.id("effect"), from: { scale: 1.04 }, to: { scale: 1 }, at: shift(aT, 0.55 + flyDur), dur: 0.35, ease: "power2.inOut" });
    if (P.token.label) {
      const tl = b.id("tlabel");
      b.add(`<div id="${tl}" class="abs b bb t ${tokTone}" style="${box(sx, y + h / 2 + 30, lw)}font-size:34px;text-align:center;color:var(--tone);">${rich(P.token.label)}</div>`);
      b.anim(enter(ctx, tl, shift(aT, 0.35 + flyDur), { rise: 12 }));
    }
    if (P.note) {
      const s = fitSize(P.note, SAFE.w, 38, { maxLines: 2, min: 28 });
      b.add(`<div id="${b.id("note")}" class="abs b t" style="${box(SAFE.x0, 900, SAFE.w)}font-size:${s}px;text-align:center;">${rich(b.text(P.note))}</div>`);
      b.anim(enter(ctx, b.id("note"), beatOf(P.at?.note, n - 1, 1, n, 0.3)));
    }
    return b.done();
  },
};

// ---------------- checklist ----------------
export type ChecklistParams = { kicker?: string; title?: string; items: { text: string; at?: Beat }[] };

export const checklist: TemplateDef<ChecklistParams> = {
  id: "checklist",
  label: "Danh sách kiểm",
  when: "Các điều kiện/yêu cầu cần đáp ứng, lần lượt được đánh dấu.",
  schema: { type: "object", properties: { ...headerProps, items: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] } } }, required: ["items"] },
  example: { title: "Điều kiện đủ", items: [{ text: "Tính bổ sung" }, { text: "Không đếm trùng" }, { text: "Bền vững lâu dài" }] },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const items = P.items.slice(0, 6);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const rowH = Math.min(150, (1000 - y0) / items.length);
    const boxS = Math.min(64, rowH - 30);
    const yc = Math.max(0, (1000 - y0 - rowH * items.length) / 2);
    const tw = SAFE.w - boxS - 40;
    items.forEach((it, i) => {
      const y = y0 + yc + i * rowH;
      const at = beatOf(it.at, i, items.length, n, 0.1);
      const s = fitSize(it.text, tw, Math.min(46, rowH * 0.36), { maxLines: rowH > 120 ? 2 : 1, min: 28 });
      b.add(`<div id="${b.id(`bx${i}`)}" class="abs tone-accent" style="${box(SAFE.x0, y, boxS, boxS)}border:4px solid var(--ink-soft);border-radius:${px(Math.min(12, theme(ctx).radius))};"></div>`);
      b.add(`<svg class="abs tone-accent" style="${box(SAFE.x0 + boxS * 0.18, y + boxS * 0.14, boxS * 0.64, boxS * 0.64)}overflow:visible" viewBox="0 0 24 24"><path id="${b.id(`ck${i}`)}" class="line draw" pathLength="1" d="M4 12.5 L10 18 L21 5" style="stroke:var(--tone);stroke-width:7px;vector-effect:non-scaling-stroke"/></svg>`);
      b.add(`<div id="${b.id(`tx${i}`)}" class="abs b t" style="${box(SAFE.x0 + boxS + 40, y + boxS / 2 - s * 0.68, tw)}font-size:${s}px;">${rich(b.text(it.text))}</div>`);
      b.anim(fade(ctx, b.id(`bx${i}`), shift(at, -0.2), 0.4));
      b.anim(enter(ctx, b.id(`tx${i}`), at, { x: -20, rise: 0 }));
      b.anim(draw(ctx, b.id(`ck${i}`), shift(at, 0.45), 0.45, "power2.out"));
    });
    return b.done();
  },
};
const theme = (ctx: { theme: { radius: number } }) => ctx.theme;

// ---------------- quote-banner ----------------
export type QuoteBannerParams = { kicker?: string; quote: string; attribution?: string; tone?: Tone; at?: { quote?: Beat; attribution?: Beat } };

export const quoteBanner: TemplateDef<QuoteBannerParams> = {
  id: "quote-banner",
  label: "Thông điệp lớn",
  when: "Một thông điệp/kết luận/trích dẫn quan trọng, thường ở cảnh kết.",
  schema: { type: "object", properties: { kicker: { type: "string" }, quote: { type: "string" }, attribution: { type: "string" }, tone: toneSchema, at: { type: "object", properties: { quote: beatSchema, attribution: beatSchema } } }, required: ["quote"] },
  example: { kicker: "Ghi nhớ", quote: "Mỗi tín chỉ phải đại diện cho **một tấn** giảm phát thải thực sự." },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const W = 1500;
    const qs = fitSize(P.quote, W, 80, { maxLines: 4, kind: "display", min: 40 });
    const qh = blockHeight(P.quote, qs, W, "display");
    const total = (P.kicker ? 62 : 0) + qh + (P.attribution ? 70 : 0);
    let y = 520 - total / 2;
    const top = y;
    b.add(`<div class="abs ${toneClass(P.tone)}" style="${box(0, 0, 1920, 1080)}">`);
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(220, y, W)}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.25 }, { rise: 14 }));
      y += 62;
    }
    b.add(`<div id="${b.id("q")}" class="abs d t" style="${box(220, y, W)}font-size:${qs}px;">${rich(b.text(P.quote))}</div>`);
    b.anim(enter(ctx, b.id("q"), beatOf(P.at?.quote, 0, 1, n, 0.05), { rise: 24 }));
    y += qh;
    if (P.attribution) {
      y += 34;
      b.add(`<div id="${b.id("attr")}" class="abs b soft t" style="${box(220, y, W)}font-size:32px;">— ${rich(b.text(P.attribution))}</div>`);
      b.anim(enter(ctx, b.id("attr"), beatOf(P.at?.attribution, n - 1, 1, n, 0.3), { rise: 12 }));
      y += 44;
    }
    b.add(`<div id="${b.id("bar")}" class="abs" style="${box(140, top, 12, y - top)}background:var(--tone);border-radius:6px;transform-origin:50% 0%;"></div>`);
    b.anim(grow(ctx, b.id("bar"), { t: 0.2 }, "y", 0.9));
    b.add(`</div>`);
    return b.done();
  },
};

// ---------------- draft (animatic) ----------------
export type DraftParams = { note?: string };

export const draft: TemplateDef<DraftParams> = {
  id: "draft",
  label: "Cảnh nháp (animatic)",
  when: "Cảnh chưa dựng: hiện lời thoại theo mốc để duyệt nhịp.",
  schema: { type: "object", properties: { note: { type: "string" } } },
  example: {},
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    b.add(`<div id="${b.id("badge")}" class="draft-badge">BẢN NHÁP</div>`);
    b.add(`<div id="${b.id("scene")}" class="abs kicker t" style="${box(SAFE.x0, 96, 1300)}">${esc(ctx.p.toUpperCase())} · ${esc(b.text(ctx.sceneTitle))}</div>`);
    b.anim(fade(ctx, b.id("badge"), { t: 0.1 }, 0.3));
    b.anim(fade(ctx, b.id("scene"), { t: 0.15 }, 0.3));
    if (P.note) {
      b.add(`<div class="abs b soft" style="${box(SAFE.x0, 150, 1500)}font-size:28px;">${esc(P.note)}</div>`);
    }
    ctx.sentences.forEach((s, i) => {
      const size = fitSize(s, 1500, 54, { maxLines: 4, min: 32 });
      const h = blockHeight(s, size, 1500);
      b.add(`<div id="${b.id(`c${i}`)}" class="abs b t" style="${box(SAFE.x0, 560 - h / 2, 1500)}font-size:${size}px;">${rich(s)}</div>`);
      b.anim(enter(ctx, b.id(`c${i}`), { cue: i, f: 0 }, { rise: 18, dur: 0.4 }));
      if (i < n - 1) b.anim({ id: b.id(`c${i}`), from: { opacity: 1 }, to: { opacity: 0 }, at: { cue: i + 1, f: 0, d: -0.3 }, dur: 0.3, ease: "power2.in" });
    });
    // thanh tiến độ câu
    b.add(`<div class="abs" style="${box(SAFE.x0, 960, SAFE.w, 6)}background:var(--grid);"></div>`);
    b.add(`<div id="${b.id("prog")}" class="abs tone-warn" style="${box(SAFE.x0, 960, SAFE.w, 6)}background:var(--tone);transform-origin:0% 50%;"></div>`);
    b.anim({ id: b.id("prog"), from: { scaleX: 0 }, to: { scaleX: 1 }, at: { t: 0 }, dur: 1, until: { end: 0.5 }, ease: "none" });
    return b.done();
  },
};
