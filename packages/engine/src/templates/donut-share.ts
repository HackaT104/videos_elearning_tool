// donut-share – Tỷ trọng vòng tròn: vòng donut 1–3 phân đoạn vẽ nối tiếp (stroke-dashoffset 1 → 1−p), số % ở giữa đếm lên,
// chú giải bên phải, chú thích (đường dẫn + chữ) cho đoạn được nhấn mạnh, dòng nguồn nhỏ.
// Đoạn nhấn mạnh luôn bắt đầu ở 12 giờ (quay vòng theo tổng các đoạn trước nó) → điểm giữa của nó luôn nằm ở nửa phải,
// đường dẫn chú thích không cắt qua vòng.

import type { Tone } from "@cvs/themes";
import { dim, draw, enter, fade, shift } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, formatViNumber, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

export type DonutShareParams = {
  kicker?: string;
  title?: string;
  /** 1–3 phân đoạn, giá trị theo % (tổng ≤ 100; phần còn lại là vòng nền). */
  segments: { label: string; value: number; display?: string; tone?: Tone; at?: Beat }[];
  /** Chỉ số đoạn được nhấn mạnh (mặc định 0): số ở giữa + chú thích. */
  focus?: number;
  /** Dòng nhỏ dưới số ở giữa vòng. */
  centerLabel?: string;
  /** Chú thích cho đoạn nhấn mạnh (hiện ở câu cuối, các đoạn khác mờ đi). */
  note?: string;
  /** Dòng nguồn nhỏ dưới cùng. */
  source?: string;
  decimals?: number;
  suffix?: string;
  at?: { note?: Beat; source?: Beat };
};

const decOf = (v: number) => (Number.isInteger(v) ? 0 : Math.min(2, String(v).split(".")[1]?.length ?? 1));

export const donutShare: TemplateDef<DonutShareParams> = {
  id: "donut-share",
  label: "Tỷ trọng vòng tròn",
  when: "Một tỷ lệ phần trăm hoặc cơ cấu 2–3 phần của một tổng (tỷ trọng phát thải, tỷ lệ đạt/không đạt) có số liệu trong tài liệu.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      segments: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "object", properties: { label: { type: "string" }, value: { type: "number", minimum: 0, maximum: 100 }, display: { type: "string" }, tone: toneSchema, at: beatSchema }, required: ["label", "value"] },
      },
      focus: { type: "integer", minimum: 0, maximum: 2 },
      centerLabel: { type: "string" },
      note: { type: "string" },
      source: { type: "string" },
      decimals: { type: "integer", minimum: 0, maximum: 2 },
      suffix: { type: "string" },
      at: { type: "object", properties: { note: beatSchema, source: beatSchema } },
    },
    required: ["segments"],
  },
  example: {
    title: "Cơ cấu phát thải của một nhà máy",
    segments: [
      { label: "Phạm vi 3 – chuỗi cung ứng", value: 70, at: { cue: 1 } },
      { label: "Phạm vi 2 – điện mua vào", value: 20, at: { cue: 2 } },
      { label: "Phạm vi 1 – đốt nhiên liệu", value: 10, at: { cue: 2, f: 0.5 } },
    ],
    focus: 0,
    centerLabel: "nằm ngoài nhà máy",
    note: "Muốn giảm thực chất, phải làm việc cùng **nhà cung cấp**",
    source: "Nguồn: GHG Protocol – số liệu minh hoạ",
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const segs = P.segments.slice(0, 3);
    const focus = Math.max(0, Math.min(segs.length - 1, P.focus ?? 0));
    const suffix = P.suffix ?? "%";
    const y0 = header(b, { kicker: P.kicker, title: P.title });

    // tỷ lệ (tổng > 100 → co lại cho vừa vòng)
    const raw = segs.map((s) => Math.max(0, s.value));
    const sum = raw.reduce((a, v) => a + v, 0);
    const k = sum > 100 ? 100 / sum : 1;
    if (sum > 100) b.assume(`Tổng các phần ${formatViNumber(sum, 1)} > 100 – vòng tròn được co tỷ lệ`);
    const frac = raw.map((v) => (v * k) / 100);

    // vùng nội dung
    const srcH = P.source ? blockHeight(P.source, 28, SAFE.w) + 16 : 0;
    const bottom = SAFE.y1 - 40 - srcH; // đáy vùng biểu đồ
    const areaH = bottom - y0;
    const D = Math.max(380, Math.min(660, areaH)); // đường kính ngoài
    const sw = Math.round(D * 0.12); // độ dày vòng
    const R = D / 2 - sw / 2; // bán kính đường giữa nét
    const cx = SAFE.x0 + 30 + D / 2;
    const cy = y0 + areaH / 2;

    // vòng: đoạn nhấn mạnh bắt đầu ở 12 giờ
    const before = frac.slice(0, focus).reduce((a, v) => a + v, 0);
    const startOf = (i: number) => frac.slice(0, i).reduce((a, v) => a + v, 0) - before; // phần vòng (0..1) theo chiều kim đồng hồ từ 12 giờ
    const pt = (r: number, f: number) => {
      const a = f * Math.PI * 2;
      return [cx - (SAFE.x0 + 30) + r * Math.sin(a), D / 2 - r * Math.cos(a)] as const;
    };
    const ring = (f0: number) => {
      const [x1, y1] = pt(R, f0);
      const [x2, y2] = pt(R, f0 + 0.5);
      const r2 = (v: number) => Math.round(v * 100) / 100;
      return `M${r2(x1)} ${r2(y1)} A${r2(R)} ${r2(R)} 0 1 1 ${r2(x2)} ${r2(y2)} A${r2(R)} ${r2(R)} 0 1 1 ${r2(x1)} ${r2(y1)}`;
    };
    const gap = segs.length > 1 ? 0.006 : 0;
    const beats = segs.map((s, i) => beatOf(s.at, i, segs.length, P.note && n > 1 ? n - 1 : n, 0.05));
    const noteAt: TimeRef = P.at?.note ? beatOf(P.at.note, 0, 1, n) : { cue: Math.max(0, n - 1), f: segs.length >= n ? 0.5 : 0.1 };
    const drawDur = ctx.slow ? 1.5 : 1.15;
    const tones: Tone[] = segs.map((s, i) => s.tone ?? (i === focus ? "accent" : (["alt", "neutral"] as const)[(i < focus ? i : i - 1) % 2]));

    const svg: string[] = [];
    svg.push(`<circle id="${b.id("track")}" cx="${D / 2}" cy="${D / 2}" r="${R}" style="fill:none;stroke:var(--grid);stroke-width:${sw}px;"/>`);
    segs.forEach((_, i) => {
      const len = Math.max(0.0001, frac[i] - gap);
      svg.push(
        `<path id="${b.id(`seg${i}`)}" class="${toneClass(tones[i])}" pathLength="1" d="${ring(startOf(i) + gap / 2)}" style="fill:none;stroke:var(--tone);stroke-width:${sw}px;stroke-linecap:butt;stroke-dasharray:1;stroke-dashoffset:${1 - len};"/>`,
      );
      b.anim({ id: b.id(`seg${i}`), from: { dash: 1 }, to: { dash: 1 - len }, at: beats[i], dur: drawDur, ease: "power2.inOut" });
    });
    b.add(`<svg class="abs" style="${box(SAFE.x0 + 30, cy - D / 2, D, D)}overflow:visible" viewBox="0 0 ${D} ${D}">${svg.join("")}</svg>`);
    b.anim(fade(ctx, b.id("track"), { t: 0.3 }, 0.6));

    // số ở giữa (đếm cùng lúc vòng vẽ)
    const f = segs[focus];
    const dec = P.decimals ?? decOf(f.value);
    const finalText = f.display ?? `${formatViNumber(f.value, dec)}${suffix}`;
    const inner = 2 * (R - sw / 2) - 40;
    const numSize = Math.round(Math.max(56, Math.min(D * 0.22, inner / (Math.max(3, finalText.length) * 0.7))));
    const cl = P.centerLabel;
    const clSize = cl ? fitSize(cl, inner * 0.82, 32, { maxLines: 2, min: 28 }) : 0;
    const clH = cl ? blockHeight(cl, clSize, inner * 0.82) : 0;
    const blockH = numSize * 1.05 + (cl ? 10 + clH : 0);
    const numY = cy - blockH / 2;
    const tone = toneClass(tones[focus]);
    b.text(finalText);
    if (f.display) {
      b.add(`<div id="${b.id("num")}" class="abs d t ${tone}" style="${box(cx - inner / 2, numY, inner)}font-size:${numSize}px;line-height:1.05;text-align:center;color:var(--tone);white-space:nowrap;">${rich(f.display)}</div>`);
      b.anim(enter(ctx, b.id("num"), shift(beats[focus], 0.2), { rise: 16, scale: 0.9 }));
    } else {
      b.add(
        `<div id="${b.id("num")}" class="abs d ${tone}" style="${box(cx - inner / 2, numY, inner)}font-size:${numSize}px;line-height:1.05;text-align:center;color:var(--tone);white-space:nowrap;font-variant-numeric:tabular-nums;">${esc(formatViNumber(0, dec) + suffix)}</div>`,
      );
      b.anim(enter(ctx, b.id("num"), beats[focus], { rise: 16, scale: 0.9 }));
      b.count({ id: b.id("num"), from: 0, to: f.value, decimals: dec, suffix, at: shift(beats[focus], 0.05), dur: drawDur, ease: "power2.inOut" });
    }
    if (cl) {
      b.add(`<div id="${b.id("cl")}" class="abs b soft t" style="${box(cx - (inner * 0.82) / 2, numY + numSize * 1.05 + 10, inner * 0.82)}font-size:${clSize}px;text-align:center;">${rich(b.text(cl))}</div>`);
      b.anim(enter(ctx, b.id("cl"), shift(beats[focus], 0.5), { rise: 10 }));
    }

    // chú giải bên phải
    const lx = SAFE.x0 + 30 + D + 110;
    const lw = SAFE.x1 - lx;
    const valW = 210;
    const labW = lw - 56 - valW - 20;
    const rowsMeta = segs.map((s) => {
      const ls = fitSize(s.label, labW, 38, { maxLines: 2, min: 28 });
      return { ls, h: Math.max(64, blockHeight(s.label, ls, labW)) };
    });
    const rowGap = 30;
    const noteW = lw - 40;
    const ns = P.note ? fitSize(P.note, noteW - 34, 40, { maxLines: 3, min: 30 }) : 0;
    const noteH = P.note ? blockHeight(P.note, ns, noteW - 34) : 0;
    const legendH = rowsMeta.reduce((a, r) => a + r.h, 0) + rowGap * (segs.length - 1);
    const totalH = legendH + (P.note ? 64 + noteH : 0);
    let ly = Math.max(y0, cy - totalH / 2);
    segs.forEach((s, i) => {
      const id = b.id(`row${i}`);
      const r = rowsMeta[i];
      const d = s.display ?? `${formatViNumber(s.value, P.decimals ?? decOf(s.value))}${suffix}`;
      const vs = fitSize(d, valW, 46, { maxLines: 1, kind: "display", min: 30 });
      b.add(
        `<div id="${id}" class="abs ${toneClass(tones[i])}" style="${box(lx, ly, lw, r.h)}">` +
          `<div class="abs" style="left:0;top:${px(r.h / 2 - 16)};width:32px;height:32px;border-radius:8px;background:var(--tone);"></div>` +
          `<div class="abs b t" style="left:56px;top:${px((r.h - blockHeight(s.label, r.ls, labW)) / 2)};width:${px(labW)};font-size:${r.ls}px;">${rich(b.text(s.label))}</div>` +
          `<div class="abs d t" style="right:0;top:${px(r.h / 2 - vs * 0.62)};width:${px(valW)};font-size:${vs}px;text-align:right;color:var(--tone);white-space:nowrap;">${rich(b.text(d))}</div>` +
          `</div>`,
      );
      b.anim(enter(ctx, id, shift(beats[i], 0.15), { x: -24, rise: 0 }));
      ly += r.h + rowGap;
    });
    ly += 64 - rowGap;

    // chú thích + đường dẫn từ giữa đoạn nhấn mạnh
    if (P.note) {
      const nid = b.id("note");
      b.add(`<div id="${nid}" class="abs b t ${tone}" style="${box(lx + 40, ly, noteW)}font-size:${ns}px;border-left:8px solid var(--tone);padding-left:26px;">${rich(b.text(P.note))}</div>`);
      // điểm trên mép ngoài vòng, giữa đoạn nhấn mạnh (nửa phải vì đoạn này bắt đầu ở 12 giờ)
      const mid = Math.min(0.42, frac[focus] / 2);
      const ox = SAFE.x0 + 30;
      const oy = cy - D / 2;
      const [ax0, ay0] = pt(R + sw / 2 + 12, mid);
      const [bx0, by0] = pt(R + sw / 2 + 44, mid);
      const ax = ox + ax0, ay = oy + ay0, bx = ox + bx0, by = oy + by0;
      const ux = ox + D + 55; // rãnh dọc giữa vòng và chú giải – đường dẫn không cắt qua vòng
      const tx = lx + 22;
      const ty = ly + Math.min(noteH / 2, ns * 0.7);
      const gx = Math.min(ax, tx) - 10;
      const gy = Math.min(ay, by, ty) - 20;
      const gw = Math.max(ux, tx) - gx + 20;
      const gh = Math.max(ay, by, ty) - gy + 20;
      const L = (x: number, y: number) => `${Math.round(x - gx)} ${Math.round(y - gy)}`;
      const dPath = `M${L(ax, ay)} L${L(bx, by)} L${L(ux, by)} L${L(ux, ty)} L${L(tx, ty)}`;
      b.add(
        `<svg class="abs ${tone}" style="${box(gx, gy, gw, gh)}overflow:visible" viewBox="0 0 ${Math.round(gw)} ${Math.round(gh)}"><path id="${b.id("lead")}" class="line draw" pathLength="1" d="${dPath}" style="stroke:var(--tone);stroke-width:4px;"/><circle id="${b.id("dot")}" cx="${Math.round(ax - gx)}" cy="${Math.round(ay - gy)}" r="9" style="fill:var(--tone);"/></svg>`,
      );
      b.anim(fade(ctx, b.id("dot"), noteAt, 0.3));
      b.anim(draw(ctx, b.id("lead"), shift(noteAt, 0.1), 0.6, "power2.out"));
      b.anim(enter(ctx, nid, shift(noteAt, 0.45), { x: -20, rise: 0 }));
      // làm mờ các đoạn khác – một điểm nhấn
      segs.forEach((_, i) => {
        if (i === focus) return;
        b.anim(dim(ctx, b.id(`seg${i}`), noteAt, 0.3));
        b.anim(dim(ctx, b.id(`row${i}`), noteAt, 0.4));
      });
    }

    if (P.source) {
      const ss = fitSize(P.source, SAFE.w, 28, { maxLines: 2, min: 28 });
      const sh = blockHeight(P.source, ss, SAFE.w);
      b.add(`<div id="${b.id("src")}" class="abs b soft t" style="${box(SAFE.x0, SAFE.y1 - 40 - sh, SAFE.w)}font-size:${ss}px;">${rich(b.text(P.source))}</div>`);
      b.anim(fade(ctx, b.id("src"), beatOf(P.at?.source, 0, 1, n, 0.6), 0.6));
    }
    return b.done();
  },
};
