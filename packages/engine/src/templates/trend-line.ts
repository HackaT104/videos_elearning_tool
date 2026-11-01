// trend-line – Đường xu hướng: lưới + trục vẽ ra, đường gốc (mức tham chiếu) tuỳ chọn, đường dữ liệu vẽ dần (dash),
// các chấm bật lên đúng lúc nét vẽ đi qua, một điểm then chốt có chú thích (đường dẫn + số đếm + nhãn), nhãn trục ≤ 8, dòng nguồn.
// Toạ độ tính từ dữ liệu: thang "đẹp" (bước 1/2/2,5/5 × 10^k), nhãn trục x thưa dần khi > 8 điểm.

import type { Tone } from "@cvs/themes";
import { dim, draw, enter, fade, pop, shift } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, formatViNumber, rich } from "../text";
import { beatOf, box, header, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

export type TrendLineParams = {
  kicker?: string;
  title?: string;
  /** Đơn vị trục tung, ví dụ "tCO₂e". */
  unit?: string;
  /** 3–12 điểm theo thứ tự thời gian; label là nhãn trục hoành (năm, quý…). */
  points: { label: string; value: number }[];
  /** Đường gốc / mức tham chiếu (năm cơ sở, mục tiêu, giới hạn). */
  baseline?: { value: number; label?: string; tone?: Tone };
  /** Điểm then chốt (mặc định điểm cuối): chấm lớn + chú thích số đếm. */
  key?: { index?: number; text?: string; display?: string };
  decimals?: number;
  prefix?: string;
  suffix?: string;
  tone?: Tone;
  source?: string;
  at?: { baseline?: Beat; line?: Beat; key?: Beat; source?: Beat };
};

/** Thang đẹp cho trục tung. */
export function niceScale(lo: number, hi: number, maxTicks = 5): { lo: number; hi: number; step: number } {
  if (!(hi > lo)) {
    const d = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1;
    lo -= d;
    hi += d;
  }
  const raw = (hi - lo) / Math.max(1, maxTicks - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { lo: Math.floor(lo / step + 1e-9) * step, hi: Math.ceil(hi / step - 1e-9) * step, step };
}

const decOf = (v: number) => (Number.isInteger(v) ? 0 : Math.min(2, String(v).split(".")[1]?.length ?? 1));
/** Ngược của sine.inOut: thời điểm (0..1) nét vẽ đạt tỷ lệ độ dài f. */
const invSine = (f: number) => Math.acos(1 - 2 * Math.max(0, Math.min(1, f))) / Math.PI;

export const trendLine: TemplateDef<TrendLineParams> = {
  id: "trend-line",
  label: "Đường xu hướng",
  when: "Một chuỗi số liệu theo thời gian (3–12 mốc) có trong tài liệu, cần thấy chiều hướng tăng/giảm và một điểm then chốt; tuỳ chọn đường mức nền/mục tiêu.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      unit: { type: "string" },
      points: { type: "array", minItems: 3, maxItems: 12, items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] } },
      baseline: { type: "object", properties: { value: { type: "number" }, label: { type: "string" }, tone: toneSchema }, required: ["value"] },
      key: { type: "object", properties: { index: { type: "integer", minimum: 0 }, text: { type: "string" }, display: { type: "string" } } },
      decimals: { type: "integer", minimum: 0, maximum: 2 },
      prefix: { type: "string" },
      suffix: { type: "string" },
      tone: toneSchema,
      source: { type: "string" },
      at: { type: "object", properties: { baseline: beatSchema, line: beatSchema, key: beatSchema, source: beatSchema } },
    },
    required: ["points"],
  },
  example: {
    title: "Phát thải của nhà máy sau khi áp dụng ISO 14001",
    unit: "nghìn tCO₂e/năm",
    points: [
      { label: "2019", value: 48 },
      { label: "2020", value: 46.5 },
      { label: "2021", value: 43 },
      { label: "2022", value: 39.5 },
      { label: "2023", value: 36 },
      { label: "2024", value: 32.6 },
    ],
    baseline: { value: 48, label: "Năm cơ sở 2019" },
    key: { index: 5, text: "Năm 2024: giảm 32% so với năm cơ sở" },
    source: "Nguồn: báo cáo kiểm kê khí nhà kính của nhà máy – số liệu minh hoạ",
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const pts = P.points.slice(0, 12);
    const vals = pts.map((p) => p.value);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const tone = toneClass(P.tone);

    // thang
    const all = P.baseline ? [...vals, P.baseline.value] : vals;
    let lo = Math.min(...all);
    const hi = Math.max(...all);
    if (lo >= 0 && lo < 0.35 * hi) lo = 0;
    const sc = niceScale(lo, hi, 5);
    const stepDec = decOf(sc.step);
    const ticks: number[] = [];
    for (let v = sc.lo; v <= sc.hi + sc.step * 1e-6; v += sc.step) ticks.push(Math.round(v * 1e6) / 1e6);

    // khung vẽ
    const srcH = P.source ? blockHeight(P.source, 28, SAFE.w) + 18 : 0;
    const unitH = P.unit ? 46 : 0;
    const plotTop = y0 + unitH + 16;
    const xLabH = 50;
    const plotBot = SAFE.y1 - 40 - srcH - xLabH;
    const tickTxt = ticks.map((t) => formatViNumber(t, stepDec));
    const yLabW = Math.ceil(Math.max(...tickTxt.map((t) => t.length)) * 0.56 * 28) + 8;
    const plotL = SAFE.x0 + yLabW + 24;
    const plotR = SAFE.x1;
    const W = plotR - plotL;
    const H = plotBot - plotTop;
    const padX = 48;
    const X = (i: number) => (pts.length === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (pts.length - 1));
    const Y = (v: number) => H - ((v - sc.lo) / (sc.hi - sc.lo)) * H;

    if (P.unit) {
      b.add(`<div id="${b.id("unit")}" class="abs b soft t" style="${box(SAFE.x0, y0, SAFE.w)}font-size:${fitSize(P.unit, SAFE.w, 30, { maxLines: 1, min: 28 })}px;">${rich(b.text(P.unit))}</div>`);
      b.anim(fade(ctx, b.id("unit"), { t: 0.5 }));
    }

    // lưới + trục
    const svg: string[] = [];
    ticks.forEach((t, i) => {
      const y = Math.round(Y(t) * 10) / 10;
      const isAxis = i === 0;
      svg.push(`<path id="${b.id(`g${i}`)}" class="line draw" pathLength="1" d="M0 ${y} H${W}" style="stroke:${isAxis ? "var(--line)" : "var(--grid)"};stroke-width:${isAxis ? "var(--stroke)" : "2px"};"/>`);
      b.anim(draw(ctx, b.id(`g${i}`), { t: 0.35 + i * 0.08 }, 0.8, "power2.out"));
      const lid = b.id(`yl${i}`);
      b.add(`<div id="${lid}" class="abs b soft t" style="${box(SAFE.x0, plotTop + y - 20, yLabW)}font-size:28px;line-height:1.35;text-align:right;font-variant-numeric:tabular-nums;">${esc(b.text(tickTxt[i]))}</div>`);
      b.anim(fade(ctx, lid, { t: 0.45 + i * 0.08 }, 0.5));
    });

    // nhãn trục hoành (≤ 8)
    const every = Math.ceil(pts.length / 8);
    const shown = pts.map((_, i) => i).filter((i) => i % every === 0);
    const last = pts.length - 1;
    if (shown[shown.length - 1] !== last) {
      if (last - shown[shown.length - 1] < every && shown.length > 1) shown[shown.length - 1] = last;
      else shown.push(last);
    }
    const slotW = Math.min(260, (W - 2 * padX) / Math.max(1, (pts.length - 1) / every) - 12);
    shown.forEach((i, k) => {
      const id = b.id(`xl${i}`);
      const s = fitSize(pts[i].label, slotW, 30, { maxLines: 1, min: 28 });
      const lx = Math.max(SAFE.x0, Math.min(SAFE.x1 - slotW, plotL + X(i) - slotW / 2));
      b.add(`<div id="${id}" class="abs b soft t" style="${box(lx, plotBot + 12, slotW)}font-size:${s}px;text-align:center;white-space:nowrap;">${rich(b.text(pts[i].label))}</div>`);
      b.anim(fade(ctx, id, { t: 0.6 + k * 0.06 }, 0.5));
    });

    // mốc thời gian
    const hasBase = !!P.baseline;
    const baseAt: TimeRef = beatOf(P.at?.baseline, 0, 1, n, 0.3);
    const lineAt: TimeRef = P.at?.line ? beatOf(P.at.line, 0, 1, n) : hasBase && n > 2 ? { cue: 1, f: 0.05 } : { cue: 0, f: hasBase ? 0.55 : 0.2 };
    const lineDur = ctx.slow ? 2.8 : 2.2;
    const lineCue = "cue" in lineAt ? lineAt.cue : 0;
    const keyAt: TimeRef = P.at?.key ? beatOf(P.at.key, 0, 1, n) : n - 1 > lineCue ? { cue: n - 1, f: 0.1 } : shift(lineAt, lineDur + 0.3);

    // vùng chú thích điểm then chốt nên tránh (toạ độ trong khung vẽ)
    const avoid: [number, number][] = [];
    // đường gốc
    if (P.baseline) {
      const by = Math.round(Y(P.baseline.value) * 10) / 10;
      const bt = toneClass(P.baseline.tone ?? "alt");
      svg.push(`<path id="${b.id("base")}" class="line draw ${bt}" pathLength="1" d="M0 ${by} H${W}" style="stroke:var(--tone);stroke-width:4px;opacity:.85"/>`);
      b.anim(draw(ctx, b.id("base"), baseAt, 0.9));
      for (let x = 0; x <= W; x += 24) avoid.push([x, by]);
      if (P.baseline.label) {
        const bs = fitSize(P.baseline.label, 560, 30, { maxLines: 1, min: 28 });
        // nhãn ở phía ít dữ liệu: trên hay dưới đường gốc, ở đầu trái
        const nearL = vals.slice(0, Math.ceil(vals.length / 3)).map(Y);
        const above = by - 50 > 0 && nearL.every((y) => y > by - 4 || y < by - 60);
        const ly = above ? by - bs * 1.35 - 8 : by + 10;
        const lw = Math.min(560, P.baseline.label.length * bs * 0.56);
        for (let x = 12; x <= 12 + lw; x += 16) for (let y = ly; y <= ly + bs * 1.35; y += 12) avoid.push([x, y]);
        b.add(`<div id="${b.id("blabel")}" class="abs b bb t ${bt}" style="${box(plotL + 12, plotTop + ly, 560)}font-size:${bs}px;color:var(--tone);">${rich(b.text(P.baseline.label))}</div>`);
        b.anim(enter(ctx, b.id("blabel"), shift(baseAt, 0.4), { rise: 10 }));
      }
    }

    // đường dữ liệu
    const xy = pts.map((p, i) => [X(i), Y(p.value)] as const);
    const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join(" ");
    svg.push(`<path id="${b.id("line")}" class="line draw ${tone}" pathLength="1" d="${d}" style="stroke:var(--tone);stroke-width:6px;"/>`);
    b.anim({ ...draw(ctx, b.id("line"), lineAt, lineDur, "sine.inOut") });
    const seg = xy.map((p, i) => (i ? Math.hypot(p[0] - xy[i - 1][0], p[1] - xy[i - 1][1]) : 0));
    const total = seg.reduce((a, v) => a + v, 0) || 1;
    let acc = 0;

    // điểm then chốt
    const ki = Math.max(0, Math.min(pts.length - 1, P.key?.index ?? pts.length - 1));
    xy.forEach(([x, y], i) => {
      acc += seg[i];
      const id = b.id(`dot${i}`);
      b.add(`<div id="${id}" class="abs ${tone}" style="${box(plotL + x - 11, plotTop + y - 11, 22, 22)}border-radius:50%;background:var(--bg3);border:5px solid var(--tone);"></div>`);
      b.anim({ ...pop(ctx, id, shift(lineAt, Math.max(0, lineDur * invSine(acc / total) - 0.08)), 0.2), dur: 0.45 });
      if (i !== ki) b.anim(dim(ctx, id, keyAt, 0.45));
    });

    // chú thích điểm then chốt
    const kp = pts[ki];
    const dec = P.decimals ?? decOf(kp.value);
    const finalTxt = P.key?.display ?? `${P.prefix ?? ""}${formatViNumber(kp.value, dec)}${P.suffix ?? ""}`;
    const kt = P.key?.text;
    const bw = Math.min(520, Math.max(300, kt ? 460 : finalTxt.length * 34 + 60));
    const nSize = fitSize(finalTxt, bw - 44, 60, { maxLines: 1, kind: "display", min: 36 });
    const tSize = kt ? fitSize(kt, bw - 44, 32, { maxLines: 3, min: 28 }) : 0;
    const bh = 32 + nSize * 1.1 + (kt ? 8 + blockHeight(kt, tSize, bw - 44) + tSize * 0.4 : 0);
    const [kx, ky] = xy[ki];
    // chọn chỗ đặt ít đè lên đường nhất
    const samples: [number, number][] = [];
    xy.forEach((p, i) => {
      if (!i) return samples.push([p[0], p[1]]);
      const [x0, yA] = xy[i - 1];
      const steps = Math.ceil(seg[i] / 8);
      for (let s = 1; s <= steps; s++) samples.push([x0 + ((p[0] - x0) * s) / steps, yA + ((p[1] - yA) * s) / steps]);
    });
    samples.push(...avoid);
    for (let a = 0; a < 16; a++) samples.push([kx + 34 * Math.cos((a * Math.PI) / 8), ky + 34 * Math.sin((a * Math.PI) / 8)]);
    // lưới vị trí: ít đè nhất, rồi gần điểm then chốt nhất
    const yMin = -unitH - 6;
    const yMax = H - bh - 8;
    let best = { x: 0, y: yMin, s: Infinity };
    for (let x = 0; x <= W - bw + 0.5; x += Math.max(8, (W - bw) / 40))
      for (let y = yMin; y <= yMax + 0.5; y += Math.max(8, (yMax - yMin) / 30)) {
        const hits = samples.filter(([sx, sy]) => sx > x - 16 && sx < x + bw + 16 && sy > y - 16 && sy < y + bh + 16).length;
        const cx = Math.max(x, Math.min(x + bw, kx));
        const cy = Math.max(y, Math.min(y + bh, ky));
        const s = hits * 1000 + Math.hypot(cx - kx, cy - ky) + (cy > ky ? 40 : 0);
        if (s < best.s) best = { x, y, s };
      }
    const bx = best.x;
    const byy = best.y;
    const ex = Math.max(bx, Math.min(bx + bw, kx));
    const ey = Math.max(byy, Math.min(byy + bh, ky));
    const dist = Math.hypot(ex - kx, ey - ky);
    if (dist > 30) {
      const ux = (ex - kx) / dist;
      const uy = (ey - ky) / dist;
      svg.push(`<path id="${b.id("lead")}" class="line draw ${tone}" pathLength="1" d="M${Math.round(kx + ux * 24)} ${Math.round(ky + uy * 24)} L${Math.round(ex)} ${Math.round(ey)}" style="stroke:var(--tone);stroke-width:3px;"/>`);
      b.anim(draw(ctx, b.id("lead"), shift(keyAt, 0.2), 0.45, "power2.out"));
    }
    b.add(`<svg class="abs" style="${box(plotL, plotTop, W, H)}overflow:visible" viewBox="0 0 ${W} ${H}">${svg.join("")}</svg>`);
    // vòng nhấn quanh điểm then chốt (div để được scale)
    b.add(`<div id="${b.id("ring")}" class="abs ${tone}" style="${box(plotL + kx - 26, plotTop + ky - 26, 52, 52)}border-radius:50%;border:4px solid var(--tone);"></div>`);
    b.anim(pop(ctx, b.id("ring"), keyAt, 0.3));

    const kid = b.id("key");
    b.text(finalTxt);
    const numHtml = P.key?.display
      ? rich(P.key.display)
      : esc(`${P.prefix ?? ""}${formatViNumber(0, dec)}${P.suffix ?? ""}`);
    b.add(
      `<div id="${kid}" class="abs ${tone}" style="${box(plotL + bx, plotTop + byy, bw)}background:var(--card);border:2px solid var(--card-border);border-left:8px solid var(--tone);border-radius:var(--radius);padding:14px 20px 14px 22px;">` +
        `<div id="${b.id("knum")}" class="d${P.key?.display ? " t" : ""}" style="font-size:${nSize}px;line-height:1.1;color:var(--tone);white-space:nowrap;font-variant-numeric:tabular-nums;">${numHtml}</div>` +
        (kt ? `<div class="b t" style="font-size:${tSize}px;margin-top:8px;">${rich(b.text(kt))}</div>` : "") +
        `</div>`,
    );
    b.anim(enter(ctx, kid, shift(keyAt, 0.35), { rise: 14 }));
    if (!P.key?.display) b.count({ id: b.id("knum"), from: 0, to: kp.value, decimals: dec, prefix: P.prefix, suffix: P.suffix, at: shift(keyAt, 0.4), dur: ctx.slow ? 1.5 : 1.2, ease: "power2.out" });

    if (P.source) {
      const ss = fitSize(P.source, SAFE.w, 28, { maxLines: 2, min: 28 });
      const sh = blockHeight(P.source, ss, SAFE.w);
      b.add(`<div id="${b.id("src")}" class="abs b soft t" style="${box(SAFE.x0, SAFE.y1 - 40 - sh, SAFE.w)}font-size:${ss}px;">${rich(b.text(P.source))}</div>`);
      b.anim(fade(ctx, b.id("src"), beatOf(P.at?.source, 0, 1, n, 0.6), 0.6));
    }
    return b.done();
  },
};
