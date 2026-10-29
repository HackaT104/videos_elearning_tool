import type { Tone } from "@cvs/themes";
import { iconSvg } from "../icons";
import { count, dim, draw, enter, fade, grow, pop, shift, undim } from "../motion";
import { blockHeight, esc, fitSize, formatViNumber, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };
const iconSchema = { type: "string", description: "Tên biểu tượng trong thư viện" };
const headerProps = { kicker: { type: "string" }, title: { type: "string" } };

// ---------------- title-card ----------------
export type TitleCardParams = { kicker?: string; title: string; subtitle?: string; icon?: string; tone?: Tone; at?: { subtitle?: Beat; icon?: Beat } };

export const titleCard: TemplateDef<TitleCardParams> = {
  id: "title-card",
  label: "Thẻ tiêu đề",
  when: "Cảnh mở đầu/giới thiệu chủ đề: một tiêu đề lớn, dòng phụ, có thể kèm một biểu tượng.",
  schema: { type: "object", properties: { kicker: { type: "string" }, title: { type: "string" }, subtitle: { type: "string" }, icon: iconSchema, tone: toneSchema, at: { type: "object", properties: { subtitle: beatSchema, icon: beatSchema } } }, required: ["title"] },
  example: { kicker: "Học phần 1", title: "Tín chỉ carbon là gì?", subtitle: "Một tín chỉ = một tấn CO₂e được giảm hoặc loại bỏ", icon: "co2" },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const W = P.icon ? 1120 : 1500;
    const tSize = fitSize(P.title, W, 104, { maxLines: 3, kind: "display", min: 56 });
    const tH = blockHeight(P.title, tSize, W, "display");
    const sSize = P.subtitle ? fitSize(P.subtitle, W, 44, { maxLines: 3, min: 30 }) : 0;
    const sH = P.subtitle ? blockHeight(P.subtitle, sSize, W) : 0;
    const total = (P.kicker ? 62 : 0) + tH + 44 + (P.subtitle ? 30 + sH : 0);
    let y = Math.max(SAFE.y0 + 60, 520 - total / 2);
    const tone = toneClass(P.tone);
    b.add(`<div id="${b.id("wrap")}" class="abs ${tone}" style="${box(0, 0, 1920, 1080)}">`);
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(SAFE.x0, y, W)}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.2 }, { rise: 14 }));
      y += 62;
    }
    b.add(`<div id="${b.id("title")}" class="abs d t" style="${box(SAFE.x0, y, W)}font-size:${tSize}px;">${rich(b.text(P.title))}</div>`);
    b.anim(enter(ctx, b.id("title"), { t: 0.35 }, { rise: 30 }));
    y += tH + 22;
    b.add(`<svg id="${b.id("rule")}" class="abs" style="${box(SAFE.x0, y, 360, 12)}overflow:visible" viewBox="0 0 360 12"><path class="line draw" pathLength="1" d="M2 6 H358" style="stroke:var(--tone);stroke-width:8px" id="${b.id("rule-p")}"/></svg>`);
    b.anim(draw(ctx, b.id("rule-p"), { t: 0.75 }, 0.8));
    y += 22;
    if (P.subtitle) {
      y += 30;
      b.add(`<div id="${b.id("sub")}" class="abs b soft t" style="${box(SAFE.x0, y, W)}font-size:${sSize}px;">${rich(b.text(P.subtitle))}</div>`);
      b.anim(enter(ctx, b.id("sub"), beatOf(P.at?.subtitle, n > 1 ? 1 : 0, 2, n, n > 1 ? 0.05 : 0.45)));
    }
    if (P.icon) {
      const S = 420;
      b.add(`<div id="${b.id("disc")}" class="abs" style="${box(1340, 540 - S / 2, S, S)}border-radius:50%;background:var(--bg2);"></div>`);
      b.add(`<div id="${b.id("icon")}" class="abs icon" style="${box(1340 + S * 0.2, 540 - S * 0.3, S * 0.6, S * 0.6)}">${iconSvg(P.icon)}</div>`);
      b.anim(pop(ctx, b.id("disc"), { t: 0.5 }, 0.7));
      b.anim(enter(ctx, b.id("icon"), beatOf(P.at?.icon, 0, 1, n, 0.15), { scale: 0.8, rise: 0 }));
    }
    b.add(`</div>`);
    return b.done();
  },
};

// ---------------- split-compare ----------------
type Side = { label: string; icon?: string; tone?: Tone; points?: { text: string; at?: Beat }[]; at?: Beat };
export type SplitCompareParams = { kicker?: string; title?: string; left: Side; right: Side; verdict?: { text: string; at?: Beat } };

export const splitCompare: TemplateDef<SplitCompareParams> = {
  id: "split-compare",
  label: "So sánh trái/phải",
  when: "So sánh hai khái niệm, hai phương án, trước/sau, bắt buộc/tự nguyện…",
  schema: {
    type: "object",
    properties: {
      ...headerProps,
      left: { $ref: "#/$defs/side" },
      right: { $ref: "#/$defs/side" },
      verdict: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] },
    },
    required: ["left", "right"],
    $defs: {
      side: {
        type: "object",
        properties: {
          label: { type: "string" }, icon: iconSchema, tone: toneSchema, at: beatSchema,
          points: { type: "array", maxItems: 4, items: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] } },
        },
        required: ["label"],
      },
    },
  },
  example: {
    title: "Thẩm định và thẩm tra",
    left: { label: "Thẩm định", icon: "search", tone: "alt", points: [{ text: "Trước khi đăng ký dự án" }] },
    right: { label: "Thẩm tra", icon: "magnifier", tone: "accent", points: [{ text: "Định kỳ, sau mỗi kỳ giám sát" }] },
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const bottom = P.verdict ? 850 : 990;
    const gap = 120;
    const w = (SAFE.w - gap) / 2;
    const half = Math.max(1, Math.ceil(n / 2));
    const anyPts = [P.left, P.right].some((s) => (s.points?.length ?? 0) > 0);
    // đo nội dung để thẻ vừa khít (không để thẻ rỗng to)
    const layoutSide = (s: Side) => {
      const pts = s.points ?? [];
      if (!anyPts) {
        const iconS = s.icon ? 190 : 0;
        const lSize = fitSize(s.label, w - 100, 72, { maxLines: 2, kind: "display", min: 40 });
        return { mode: "hero" as const, iconS, lSize, size: 0, h: 70 + (iconS ? iconS + 40 : 0) + blockHeight(s.label, lSize, w - 100, "display") + 70, pts };
      }
      const iconS = s.icon ? 96 : 0;
      const lw = w - 80 - (iconS ? iconS + 28 : 0);
      const lSize = fitSize(s.label, lw, 54, { maxLines: 2, kind: "display", min: 36 });
      const headH = Math.max(iconS, blockHeight(s.label, lSize, lw, "display"));
      let size = 40;
      const pw = w - 80 - 34;
      const ptsH = (sz: number) => pts.reduce((acc, p) => acc + blockHeight(p.text, sz, pw) + 22, 0);
      while (size > 28 && 40 + headH + 44 + ptsH(size) + 36 > bottom - y0) size -= 2;
      return { mode: "list" as const, iconS, lSize, size, h: 40 + headH + 44 + ptsH(size) + 36, pts, headH, lw, pw };
    };
    const L = [layoutSide(P.left), layoutSide(P.right)];
    const h = Math.min(bottom - y0, Math.max(...L.map((l) => l.h)));
    const y = y0 + (bottom - y0 - h) / 2;
    const sides: [Side, number, string][] = [
      [P.left, SAFE.x0, "l"],
      [P.right, SAFE.x0 + w + gap, "r"],
    ];
    sides.forEach(([s, x, k], si) => {
      const lay = L[si] as any;
      const cardAt = s.at ? beatOf(s.at, 0, 1, n) : si === 0 ? { cue: 0, f: 0.02 } : { cue: Math.min(n - 1, half), f: 0.02 };
      const tone = toneClass(s.tone ?? (si === 0 ? "alt" : "accent"));
      b.add(`<div id="${b.id(k)}" class="card ${tone}" style="${box(x, y, w, h)}">`);
      if (lay.mode === "hero") {
        const top = (h - (lay.h - 140)) / 2;
        if (s.icon) b.add(`<div class="icon abs" style="${box((w - lay.iconS) / 2, top, lay.iconS, lay.iconS)}">${iconSvg(s.icon)}</div>`);
        b.add(`<div class="abs d t" style="${box(50, top + (lay.iconS ? lay.iconS + 40 : 0), w - 100)}font-size:${lay.lSize}px;color:var(--tone);text-align:center;">${rich(b.text(s.label))}</div>`);
      } else {
        if (s.icon) b.add(`<div class="icon abs" style="${box(40, 40, lay.iconS, lay.iconS)}">${iconSvg(s.icon)}</div>`);
        b.add(`<div class="abs d t" style="${box(40 + (lay.iconS ? lay.iconS + 28 : 0), 40, lay.lw)}font-size:${lay.lSize}px;color:var(--tone);min-height:${lay.iconS}px;display:flex;align-items:center;">${rich(b.text(s.label))}</div>`);
        let py = 40 + lay.headH + 44;
        const cue0 = "cue" in cardAt ? cardAt.cue : 0;
        const end = si === 0 ? Math.max(cue0, half - 1) : n - 1;
        (lay.pts as { text: string; at?: Beat }[]).forEach((pt, pi) => {
          const id = b.id(`${k}p${pi}`);
          b.add(`<div id="${id}" class="abs b t" style="${box(40, py, w - 80)}font-size:${lay.size}px;padding-left:34px;"><span class="abs" style="left:0;top:${px(lay.size * 0.42)};width:14px;height:14px;border-radius:50%;background:var(--tone);"></span>${rich(b.text(pt.text))}</div>`);
          const auto = { cue: Math.min(end, cue0 + Math.floor((pi * (end - cue0 + 1)) / Math.max(1, lay.pts.length))), f: pi === 0 ? 0.35 : 0.1 };
          b.anim(enter(ctx, id, pt.at ? beatOf(pt.at, 0, 1, n) : auto, { rise: 16 }));
          py += blockHeight(pt.text, lay.size, lay.pw) + 22;
        });
      }
      b.add(`</div>`);
      b.anim(enter(ctx, b.id(k), cardAt, { x: si === 0 ? -40 : 40, rise: 0 }));
    });
    const cx = SAFE.x0 + w + gap / 2;
    b.add(`<div id="${b.id("vs")}" class="abs d" style="${box(cx - 40, y + h / 2 - 40, 80, 80)}border-radius:50%;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:34px;color:var(--ink-soft);">↔</div>`);
    b.anim(pop(ctx, b.id("vs"), { cue: Math.min(n - 1, half), f: 0.0 }));
    if (P.verdict) {
      const vs = fitSize(P.verdict.text, SAFE.w - 80, 40, { maxLines: 2, min: 30 });
      b.add(`<div id="${b.id("verdict")}" class="abs b bb t tone-accent" style="${box(SAFE.x0, 880, SAFE.w)}font-size:${vs}px;border-left:8px solid var(--tone);padding-left:28px;">${rich(b.text(P.verdict.text))}</div>`);
      b.anim(enter(ctx, b.id("verdict"), beatOf(P.verdict.at, n - 1, 1, n, 0.4)));
    }
    return b.done();
  },
};

// ---------------- stat-hero ----------------
export type StatHeroParams = {
  kicker?: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  unit?: string;
  caption: string;
  from?: number;
  tone?: Tone;
  secondary?: { value: string; label: string; at?: Beat }[];
  at?: { value?: Beat; caption?: Beat };
};

export const statHero: TemplateDef<StatHeroParams> = {
  id: "stat-hero",
  label: "Số lớn đếm lên",
  when: "Một con số quan trọng có trong tài liệu (tỷ lệ, sản lượng, năm, nhiệt độ). Số phải lấy đúng từ kịch bản.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" }, value: { type: "number" }, decimals: { type: "integer", minimum: 0, maximum: 3 }, prefix: { type: "string" }, suffix: { type: "string" },
      unit: { type: "string" }, caption: { type: "string" }, from: { type: "number" }, tone: toneSchema,
      secondary: { type: "array", maxItems: 3, items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, at: beatSchema }, required: ["value", "label"] } },
      at: { type: "object", properties: { value: beatSchema, caption: beatSchema } },
    },
    required: ["value", "caption"],
  },
  example: { kicker: "Mục tiêu Thỏa thuận Paris", value: 1.5, decimals: 1, suffix: "°C", caption: "Giới hạn mức tăng nhiệt độ toàn cầu so với thời kỳ tiền công nghiệp" },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const dec = P.decimals ?? (Number.isInteger(P.value) ? 0 : String(P.value).split(".")[1]?.length ?? 1);
    const finalText = `${P.prefix ?? ""}${formatViNumber(P.value, dec)}${P.suffix ?? ""}`;
    const hasSec = (P.secondary?.length ?? 0) > 0;
    const W = hasSec ? 1100 : 1600;
    const numSize = Math.max(120, Math.min(280, Math.floor(W / (finalText.length * 0.62))));
    const tone = toneClass(P.tone);
    const cSize = fitSize(P.caption, W - 60, 46, { maxLines: 3, min: 30 });
    const unitH = P.unit ? 80 : 0;
    const total = (P.kicker ? 62 : 0) + numSize * 1.02 + unitH + 36 + blockHeight(P.caption, cSize, W - 60);
    let y = Math.max(SAFE.y0 + 40, 540 - total / 2);
    const top = y;
    b.add(`<div class="abs ${tone}" style="${box(0, 0, 1920, 1080)}">`);
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(SAFE.x0 + 60, y, W)}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.25 }, { rise: 14 }));
      y += 62;
    }
    b.text(finalText);
    b.add(`<div id="${b.id("num")}" class="abs d" style="${box(SAFE.x0 + 60, y, W)}font-size:${numSize}px;line-height:1;color:var(--tone);white-space:nowrap;font-variant-numeric:tabular-nums;">${esc(`${P.prefix ?? ""}${formatViNumber(P.from ?? 0, dec)}${P.suffix ?? ""}`)}</div>`);
    const vAt = beatOf(P.at?.value, 0, 1, n, 0.15);
    b.anim(enter(ctx, b.id("num"), vAt, { rise: 20, scale: 0.92 }));
    b.count(count(ctx, b.id("num"), shift(vAt, 0.1), P.value, { from: P.from ?? 0, decimals: dec, prefix: P.prefix, suffix: P.suffix }));
    y += numSize * 1.02;
    if (P.unit) {
      b.add(`<div id="${b.id("unit")}" class="abs d t" style="${box(SAFE.x0 + 60, y + 6, W)}font-size:56px;color:var(--ink);">${rich(b.text(P.unit))}</div>`);
      b.anim(enter(ctx, b.id("unit"), shift(vAt, 0.5), { rise: 12 }));
      y += unitH;
    }
    y += 36;
    b.add(`<div id="${b.id("cap")}" class="abs b t" style="${box(SAFE.x0 + 60, y, W - 60)}font-size:${cSize}px;">${rich(b.text(P.caption))}</div>`);
    b.anim(enter(ctx, b.id("cap"), beatOf(P.at?.caption, n > 1 ? 1 : 0, 2, n, n > 1 ? 0.05 : 0.5)));
    y += blockHeight(P.caption, cSize, W - 60);
    b.add(`<div id="${b.id("bar")}" class="abs" style="${box(SAFE.x0, top, 14, y - top)}background:var(--tone);border-radius:7px;transform-origin:50% 0%;"></div>`);
    b.anim(grow(ctx, b.id("bar"), { t: 0.2 }, "y", 0.9));
    if (hasSec) {
      const sec = P.secondary!;
      const sw = 520;
      const sh = 190;
      const gap = 28;
      const sy0 = 540 - (sec.length * sh + (sec.length - 1) * gap) / 2;
      sec.forEach((s, i) => {
        const id = b.id(`sec${i}`);
        const vs = fitSize(s.value, sw - 80, 64, { maxLines: 1, kind: "display", min: 36 });
        b.add(`<div id="${id}" class="card" style="${box(1824 - sw, sy0 + i * (sh + gap), sw, sh)}padding:28px 36px;"><div class="d t" style="font-size:${vs}px;color:var(--tone);line-height:1.05">${rich(b.text(s.value))}</div><div class="b soft t" style="font-size:${fitSize(s.label, sw - 72, 30, { maxLines: 2, min: 28 })}px;margin-top:10px;">${rich(b.text(s.label))}</div></div>`);
        b.anim(enter(ctx, id, beatOf(s.at, i + 1, sec.length + 1, n, 0.2), { x: 40, rise: 0 }));
      });
    }
    b.add(`</div>`);
    return b.done();
  },
};

// ---------------- icon-grid ----------------
export type IconGridParams = { kicker?: string; title?: string; items: { icon?: string; title: string; text?: string; tone?: Tone; at?: Beat }[] };

export const iconGrid: TemplateDef<IconGridParams> = {
  id: "icon-grid",
  label: "Lưới biểu tượng (2–4)",
  when: "Liệt kê 2–4 thành phần/bên tham gia/loại, mỗi mục có biểu tượng và nhãn ngắn.",
  schema: {
    type: "object",
    properties: { ...headerProps, items: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", properties: { icon: iconSchema, title: { type: "string" }, text: { type: "string" }, tone: toneSchema, at: beatSchema }, required: ["title"] } } },
    required: ["items"],
  },
  example: { title: "Các bên tham gia", items: [{ icon: "people", title: "Chủ dự án" }, { icon: "magnifier", title: "Tổ chức VVB" }, { icon: "ledger", title: "Verra" }] },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const items = P.items.slice(0, 4);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const gap = 48;
    const cols = items.length;
    const w = (SAFE.w - gap * (cols - 1)) / cols;
    const hasText = items.some((i) => i.text);
    const h = Math.min(990 - y0, hasText ? 560 : 420);
    const y = y0 + (990 - y0 - h) / 2;
    const iconS = Math.min(140, w * 0.32);
    const beats = items.map((it, i) => beatOf(it.at, i, items.length, n, 0.05));
    items.forEach((it, i) => {
      const id = b.id(`it${i}`);
      const tSize = fitSize(it.title, w - 72, 44, { maxLines: 2, kind: "display", min: 30 });
      const txSize = it.text ? fitSize(it.text, w - 72, 32, { maxLines: 4, min: 28 }) : 0;
      b.add(
        `<div id="${id}" class="card ${toneClass(it.tone)}" style="${box(SAFE.x0 + i * (w + gap), y, w, h)}"><div class="icon" style="width:${px(iconS)};height:${px(iconS)};margin-bottom:28px;">${iconSvg(it.icon)}</div><div class="d t" style="font-size:${tSize}px;">${rich(b.text(it.title))}</div>${
          it.text ? `<div class="b soft t" style="font-size:${txSize}px;margin-top:16px;">${rich(b.text(it.text))}</div>` : ""
        }</div>`,
      );
      b.anim(enter(ctx, id, beats[i], { rise: 40 }));
      if (i < items.length - 1 && items.length > 2) b.anim(dim(ctx, id, beats[i + 1], 0.5));
    });
    if (items.length > 2) {
      const last = { cue: n - 1, f: 0.75 };
      items.slice(0, -1).forEach((_, i) => b.anim(undim(ctx, b.id(`it${i}`), last, 0.5)));
    }
    return b.done();
  },
};

// ---------------- flow-chain ----------------
export type FlowChainParams = { kicker?: string; title?: string; steps: { label: string; sub?: string; icon?: string; tone?: Tone; at?: Beat }[] };

export const flowChain: TemplateDef<FlowChainParams> = {
  id: "flow-chain",
  label: "Chuỗi ô + mũi tên",
  when: "Một chuỗi nhân quả hoặc luồng 2–5 bước nối tiếp (A → B → C).",
  schema: {
    type: "object",
    properties: { ...headerProps, steps: { type: "array", minItems: 2, maxItems: 5, items: { type: "object", properties: { label: { type: "string" }, sub: { type: "string" }, icon: iconSchema, tone: toneSchema, at: beatSchema }, required: ["label"] } } },
    required: ["steps"],
  },
  example: { title: "Chu trình dự án", steps: [{ label: "Thiết kế", icon: "document" }, { label: "Thẩm định", icon: "search" }, { label: "Đăng ký", icon: "ledger" }] },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const steps = P.steps.slice(0, 5);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const ag = steps.length > 4 ? 72 : 96;
    const w = (SAFE.w - ag * (steps.length - 1)) / steps.length;
    const hasSub = steps.some((s) => s.sub);
    const hasIcon = steps.some((s) => s.icon);
    const h = Math.min(990 - y0, (hasIcon ? 150 : 40) + 150 + (hasSub ? 130 : 0));
    const y = y0 + (990 - y0 - h) / 2;
    steps.forEach((s, i) => {
      const id = b.id(`st${i}`);
      const at = beatOf(s.at, i, steps.length, n, 0.05);
      const ls = fitSize(s.label, w - 56, 42, { maxLines: 3, kind: "display", min: 28 });
      const ss = s.sub ? fitSize(s.sub, w - 56, 30, { maxLines: 3, min: 28 }) : 0;
      b.add(
        `<div id="${id}" class="card ${toneClass(s.tone)}" style="${box(SAFE.x0 + i * (w + ag), y, w, h)}padding:32px 28px;">${
          s.icon ? `<div class="icon" style="width:96px;height:96px;margin-bottom:24px;">${iconSvg(s.icon)}</div>` : ""
        }<div class="d t" style="font-size:${ls}px;">${rich(b.text(s.label))}</div>${s.sub ? `<div class="b soft t" style="font-size:${ss}px;margin-top:14px;">${rich(b.text(s.sub))}</div>` : ""}</div>`,
      );
      b.anim(enter(ctx, id, at, { x: -30, rise: 0 }));
      if (i > 0) {
        const ax = SAFE.x0 + i * (w + ag) - ag + 10;
        const aid = b.id(`ar${i}`);
        b.add(`<svg class="abs" style="${box(ax, y + h / 2 - 20, ag - 20, 40)}overflow:visible" viewBox="0 0 ${ag - 20} 40"><path id="${aid}" class="line draw" pathLength="1" d="M0 20 H${ag - 26} M${ag - 38} 8 L${ag - 24} 20 L${ag - 38} 32" style="stroke:var(--ink-soft)"/></svg>`);
        b.anim(draw(ctx, aid, shift(at, -0.35), 0.5));
      }
    });
    return b.done();
  },
};

// ---------------- bar-compare ----------------
export type BarCompareParams = { kicker?: string; title?: string; unit?: string; bars: { label: string; value: number; display?: string; tone?: Tone; at?: Beat }[]; note?: string };

export const barCompare: TemplateDef<BarCompareParams> = {
  id: "bar-compare",
  label: "Cột so sánh",
  when: "So sánh 2–6 giá trị số có trong tài liệu (theo năm, theo loại dự án…).",
  schema: {
    type: "object",
    properties: {
      ...headerProps, unit: { type: "string" }, note: { type: "string" },
      bars: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" }, display: { type: "string" }, tone: toneSchema, at: beatSchema }, required: ["label", "value"] } },
    },
    required: ["bars"],
  },
  example: { title: "Ví dụ", unit: "triệu tCO₂e", bars: [{ label: "2021", value: 300 }, { label: "2022", value: 250 }] },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const bars = P.bars.slice(0, 6);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const base = P.note ? 830 : 880;
    const top = y0 + 70;
    const maxV = Math.max(...bars.map((x) => Math.abs(x.value)), 1e-9);
    const gap = bars.length > 4 ? 48 : 80;
    const chartW = Math.min(SAFE.w - 120, bars.length * 260 + (bars.length - 1) * gap);
    const bw = (chartW - gap * (bars.length - 1)) / bars.length;
    const x0 = SAFE.x0 + 60;
    if (P.unit) {
      b.add(`<div id="${b.id("unit")}" class="abs b soft t" style="${box(SAFE.x0, y0, 1000)}font-size:30px;">${rich(b.text(P.unit))}</div>`);
      b.anim(fade(ctx, b.id("unit"), { t: 0.5 }));
    }
    b.add(`<svg class="abs" style="${box(SAFE.x0, base, chartW + 120, 6)}overflow:visible" viewBox="0 0 ${chartW + 120} 6"><path id="${b.id("axis")}" class="line draw" pathLength="1" d="M0 3 H${chartW + 120}"/></svg>`);
    b.anim(draw(ctx, b.id("axis"), { t: 0.4 }, 0.8));
    bars.forEach((bar, i) => {
      const at = beatOf(bar.at, i, bars.length, n, 0.1);
      const hgt = Math.max(6, ((base - top - 70) * Math.abs(bar.value)) / maxV);
      const x = x0 + i * (bw + gap);
      const dec = Number.isInteger(bar.value) ? 0 : String(bar.value).split(".")[1]?.length ?? 1;
      const tone = toneClass(bar.tone ?? (i === bars.length - 1 ? "accent" : "neutral"));
      b.add(`<div id="${b.id(`b${i}`)}" class="abs ${tone}" style="${box(x, base - hgt, bw, hgt)}background:var(--tone);border-radius:${px(Math.min(12, bw / 8))} ${px(Math.min(12, bw / 8))} 0 0;transform-origin:50% 100%;"></div>`);
      b.anim(grow(ctx, b.id(`b${i}`), at, "y"));
      const vs = Math.min(52, Math.max(30, bw / 4));
      const vid = b.id(`v${i}`);
      if (bar.display) {
        b.add(`<div id="${vid}" class="abs d t ${tone}" style="${box(x - 20, base - hgt - vs * 1.3, bw + 40)}font-size:${vs}px;text-align:center;color:var(--tone);">${rich(b.text(bar.display))}</div>`);
        b.anim(enter(ctx, vid, shift(at, 0.6), { rise: 12 }));
      } else {
        b.text(formatViNumber(bar.value, dec));
        b.add(`<div id="${vid}" class="abs d ${tone}" style="${box(x - 20, base - hgt - vs * 1.3, bw + 40)}font-size:${vs}px;text-align:center;color:var(--tone);">${formatViNumber(0, dec)}</div>`);
        b.anim(fade(ctx, vid, shift(at, 0.2), 0.4));
        b.count(count(ctx, vid, shift(at, 0.2), bar.value, { decimals: dec }));
      }
      const ls = fitSize(bar.label, bw + 30, 32, { maxLines: 2, min: 28 });
      b.add(`<div id="${b.id(`l${i}`)}" class="abs b t" style="${box(x - 15, base + 18, bw + 30)}font-size:${ls}px;text-align:center;">${rich(b.text(bar.label))}</div>`);
      b.anim(fade(ctx, b.id(`l${i}`), at, 0.5));
    });
    if (P.note) {
      b.add(`<div id="${b.id("note")}" class="abs b soft t" style="${box(SAFE.x0, 950, SAFE.w)}font-size:28px;">${rich(b.text(P.note))}</div>`);
      b.anim(fade(ctx, b.id("note"), { cue: n - 1, f: 0.3 }));
    }
    return b.done();
  },
};
