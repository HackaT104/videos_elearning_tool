// Vòng lặp (PDCA): 3–6 giai đoạn trên một vòng tròn. Cung mũi tên giữa các giai đoạn vẽ dần theo lời thoại;
// một chấm đánh dấu chạy theo vòng (xoay lớp bọc HTML, chấm nằm ở mép); giai đoạn đang nói sáng lên, còn lại mờ.
// Cuối cảnh: cung khép vòng về giai đoạn đầu, mọi giai đoạn sáng lại.

import type { Tone } from "@cvs/themes";
import { iconSvg } from "../icons";
import { dim, draw, enter, shift, undim } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };
const iconSchema = { type: "string", description: "Tên biểu tượng trong thư viện" };

export type CycleLoopParams = {
  kicker?: string;
  title?: string;
  center?: { label: string; icon?: string; at?: Beat };
  stages: { label: string; text?: string; mark?: string; icon?: string; tone?: Tone; at?: Beat }[];
};

const DIM = 0.32;

function spread(beats: TimeRef[]): TimeRef[] {
  const seen = new Map<string, number>();
  return beats.map((r) => {
    const k = JSON.stringify(r);
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    return c ? shift(r, 0.1 * c) : r;
  });
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export const cycleLoop: TemplateDef<CycleLoopParams> = {
  id: "cycle-loop",
  label: "Vòng lặp (PDCA)",
  when: "Chu trình lặp lại 3–6 giai đoạn: PDCA (ISO 9001/14001/45001), vòng đời sản phẩm, chu trình đánh giá – cải tiến. Nhãn giai đoạn ≤ 3 từ.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      center: { type: "object", properties: { label: { type: "string" }, icon: iconSchema, at: beatSchema }, required: ["label"] },
      stages: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "≤ 3 từ" },
            text: { type: "string", description: "Dòng phụ ngắn (tuỳ chọn)" },
            mark: { type: "string", description: "Ký hiệu 1–2 ký tự trong vòng tròn (vd P, D, C, A); mặc định số thứ tự" },
            icon: iconSchema,
            tone: toneSchema,
            at: beatSchema,
          },
          required: ["label"],
        },
      },
    },
    required: ["stages"],
  },
  example: {
    kicker: "ISO 9001",
    title: "Chu trình PDCA",
    center: { label: "Cải tiến liên tục", icon: "trend" },
    stages: [
      { label: "Hoạch định", text: "Đặt mục tiêu, lập kế hoạch", mark: "P" },
      { label: "Thực hiện", text: "Triển khai theo kế hoạch", mark: "D" },
      { label: "Kiểm tra", text: "Đo lường, đánh giá kết quả", mark: "C" },
      { label: "Hành động", text: "Điều chỉnh để cải tiến", mark: "A" },
    ],
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const st = P.stages.slice(0, 6);
    const N = st.length;
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const top = y0 + 6;
    const bottom = 1000;
    const H = bottom - top;
    const cx = 960;

    // góc: số chẵn → không có nút ở đỉnh/đáy (PDCA: P trên-phải, đọc theo chiều kim đồng hồ)
    const start = N % 2 === 0 ? -Math.PI / 2 + Math.PI / N : -Math.PI / 2;
    const ang = st.map((_, i) => start + (2 * Math.PI * i) / N);
    const D = N >= 5 ? 116 : 132;
    const side = ang.map((a) => (Math.abs(Math.cos(a)) < 0.3 ? (Math.sin(a) < 0 ? "top" : "bottom") : Math.cos(a) > 0 ? "right" : "left"));
    const vW = 440; // nhãn trên/dưới
    // cỡ chữ nhãn (đo với bề rộng nhỏ nhất có thể, rồi dùng chung)
    const lwGuess = 440;
    const g0 = Math.min(...st.map((s) => fitSize(s.label, lwGuess, 44, { maxLines: 2, kind: "display", min: 30 })));
    const t0 = Math.min(32, ...st.filter((s) => s.text).map((s) => fitSize(s.text!, lwGuess, 32, { maxLines: 2, min: 28 })));
    const lh = st.map((s) => blockHeight(s.label, g0, lwGuess, "display") + (s.text ? 8 + blockHeight(s.text, t0, lwGuess) : 0));

    // bán kính + tâm dọc: mọi nút/nhãn trong [top, bottom]
    const sins = ang.map((a) => Math.sin(a));
    const sNeg = Math.max(...sins.map((v) => -v));
    const sPos = Math.max(...sins);
    const above = st.map((_, i) => (side[i] === "top" ? D / 2 + 14 + lh[i] : Math.max(D / 2, side[i] === "bottom" ? 0 : lh[i] / 2)));
    const below = st.map((_, i) => (side[i] === "bottom" ? D / 2 + 14 + lh[i] : Math.max(D / 2, side[i] === "top" ? 0 : lh[i] / 2)));
    const exTop = Math.max(...st.map((_, i) => (-sins[i] >= sNeg - 0.01 ? above[i] : 0)));
    const exBot = Math.max(...st.map((_, i) => (sins[i] >= sPos - 0.01 ? below[i] : 0)));
    const R = Math.max(180, Math.min(300, (H - exTop - exBot) / Math.max(0.5, sNeg + sPos)));
    const cy = top + exTop + R * sNeg + Math.max(0, (H - exTop - exBot - R * (sNeg + sPos)) / 2);
    const px_ = ang.map((a) => cx + R * Math.cos(a));
    const py_ = ang.map((a) => cy + R * Math.sin(a));
    const lws = st.map((_, i) =>
      side[i] === "top" || side[i] === "bottom" ? vW : Math.min(520, side[i] === "right" ? SAFE.x1 - (px_[i] + D / 2 + 26) : px_[i] - D / 2 - 26 - SAFE.x0),
    );
    const lSize = Math.min(...st.map((s, i) => fitSize(s.label, lws[i], 44, { maxLines: 2, kind: "display", min: 30 })));
    const txSize = Math.min(32, ...st.filter((s) => s.text).map((s) => fitSize(s.text!, lws[st.indexOf(s)], 32, { maxLines: 2, min: 28 })));
    const labH = (s: (typeof st)[number], w: number) => blockHeight(s.label, lSize, w, "display") + (s.text ? 8 + blockHeight(s.text, txSize, w) : 0);

    // ---- mốc thời gian
    const hasCenter = !!P.center;
    const beats = spread(st.map((s, i) => (hasCenter ? beatOf(s.at, i + 1, N + 1, n, 0.06) : beatOf(s.at, i, N, n, 0.06))));
    const centerAt: TimeRef = P.center?.at ? beatOf(P.center.at, 0, 1, n) : { cue: 0, f: 0.05 };
    // khép vòng: giữa câu cuối nếu giai đoạn cuối nói ở câu trước; nếu cùng câu cuối → neo theo cuối cảnh để kịp hoàn tất
    const lastB = beats[N - 1];
    const finalAt: TimeRef = "cue" in lastB && lastB.cue < n - 1 ? { cue: n - 1, f: 0.45 } : { end: 2.0 };
    const moveDur = ctx.slow ? 0.8 : 0.65;

    // vòng nền mờ
    b.add(
      `<svg class="abs" style="${box(cx - R - 10, cy - R - 10, 2 * R + 20, 2 * R + 20)}overflow:visible" viewBox="${r1(cx - R - 10)} ${r1(cy - R - 10)} ${r1(2 * R + 20)} ${r1(2 * R + 20)}"><path id="${b.id("track")}" class="line draw" pathLength="1" d="M${r1(cx)} ${r1(cy - R)} A${r1(R)} ${r1(R)} 0 1 1 ${r1(cx)} ${r1(cy + R)} A${r1(R)} ${r1(R)} 0 1 1 ${r1(cx)} ${r1(cy - R)}" style="stroke:var(--line);opacity:.35"/></svg>`,
    );
    b.anim(draw(ctx, b.id("track"), { t: 0.3 }, 1.1, "power2.inOut"));

    // cung mũi tên i → i+1 (cung cuối khép vòng)
    const gap = (D / 2 + 16) / R;
    const arcs: string[] = [];
    for (let i = 0; i < N; i++) {
      const a0 = ang[i] + gap;
      const a1 = ang[i] + (2 * Math.PI) / N - gap;
      const p0 = { x: cx + R * Math.cos(a0), y: cy + R * Math.sin(a0) };
      const p1 = { x: cx + R * Math.cos(a1), y: cy + R * Math.sin(a1) };
      const large = a1 - a0 > Math.PI ? 1 : 0;
      // đầu mũi tên: tiếp tuyến chiều kim đồng hồ t = (−sin, cos), pháp tuyến n = (cos, sin)
      const t = { x: -Math.sin(a1), y: Math.cos(a1) };
      const nn = { x: Math.cos(a1), y: Math.sin(a1) };
      const L = 18;
      const W = 12;
      const h1 = { x: p1.x - L * t.x + W * nn.x, y: p1.y - L * t.y + W * nn.y };
      const h2 = { x: p1.x - L * t.x - W * nn.x, y: p1.y - L * t.y - W * nn.y };
      const tone = toneClass(st[(i + 1) % N].tone);
      arcs.push(
        `<path id="${b.id(`arc${i}`)}" class="line draw ${tone}" pathLength="1" d="M${r1(p0.x)} ${r1(p0.y)} A${r1(R)} ${r1(R)} 0 ${large} 1 ${r1(p1.x)} ${r1(p1.y)}" style="stroke:var(--tone);stroke-width:6px"/>` +
          `<path id="${b.id(`head${i}`)}" class="line draw ${tone}" pathLength="1" d="M${r1(h1.x)} ${r1(h1.y)} L${r1(p1.x)} ${r1(p1.y)} L${r1(h2.x)} ${r1(h2.y)}" style="stroke:var(--tone);stroke-width:6px"/>`,
      );
    }
    b.add(`<svg class="abs" style="${box(0, 0, 1920, 1080)}overflow:visible" viewBox="0 0 1920 1080">${arcs.join("")}</svg>`);

    // chấm đánh dấu: lớp bọc 2R×2R xoay quanh tâm, chấm ở mép trên (góc −90° khi rotate = 0)
    const rot = (i: number) => r1((ang[0] * 180) / Math.PI + 90 + (360 * i) / N);
    const MK = 30;
    b.add(
      `<div id="${b.id("orb")}" class="abs tone-accent" style="${box(cx - R, cy - R, 2 * R, 2 * R)}transform-origin:50% 50%;"><div class="abs" style="${box(R - MK / 2, -MK / 2, MK, MK)}border-radius:50%;background:var(--tone);border:6px solid var(--card);"></div></div>`,
    );
    b.anim({ id: b.id("orb"), from: { opacity: 0, rotate: rot(0) }, to: { opacity: 1, rotate: rot(0) }, at: shift(beats[0], -0.15), dur: 0.35, ease: "power2.out" });

    // giai đoạn: nhóm (nút + nhãn) – vào mờ, sáng khi được nói tới
    st.forEach((s, i) => {
      const tone = toneClass(s.tone);
      const x = px_[i];
      const y = py_[i];
      const mark = s.mark ? s.mark : String(i + 1);
      const markSize = Math.round(D * (mark.length > 1 ? 0.3 : 0.38));
      const inner = (color: string) =>
        s.icon && !s.mark
          ? `<div class="icon" style="width:${px(D * 0.46)};height:${px(D * 0.46)};${color}">${iconSvg(s.icon)}</div>`
          : `<div class="d" style="font-size:${markSize}px;line-height:1;${color}">${esc(mark)}</div>`;
      if (s.mark) b.text(s.mark);
      const g = b.id(`g${i}`);
      // nền đặc dưới nút: nút mờ không để lộ vòng nền/chấm phía sau
      b.add(`<div id="${b.id(`bk${i}`)}" class="abs" style="${box(x - D / 2, y - D / 2, D, D)}border-radius:50%;background:var(--card);"></div>`);
      b.add(`<div id="${g}" class="abs ${tone}" style="left:0;top:0;">`);
      b.add(
        `<div id="${b.id(`n${i}`)}" class="abs" style="${box(x - D / 2, y - D / 2, D, D)}border-radius:50%;background:var(--card);border:5px solid var(--tone);display:flex;align-items:center;justify-content:center;transform-origin:50% 50%;">${inner("color:var(--tone);")}` +
          `<div id="${b.id(`on${i}`)}" class="abs" style="left:-5px;top:-5px;width:${D}px;height:${D}px;border-radius:50%;background:var(--tone);display:flex;align-items:center;justify-content:center;">${inner("color:var(--bg3);")}</div></div>`,
      );
      // nhãn
      let lx: number, ly: number, lw: number, align: string;
      if (side[i] === "top" || side[i] === "bottom") {
        lw = vW;
        lx = x - lw / 2;
        ly = side[i] === "top" ? y - D / 2 - 14 - lh[i] : y + D / 2 + 14;
        align = "center";
      } else {
        lw = lws[i];
        lx = side[i] === "right" ? x + D / 2 + 26 : x - D / 2 - 26 - lw;
        ly = y - labH(s, lw) / 2;
        align = side[i] === "right" ? "left" : "right";
      }
      b.add(
        `<div id="${b.id(`l${i}`)}" class="abs" style="${box(lx, ly, lw)}text-align:${align};"><div class="d t" style="font-size:${lSize}px;color:var(--tone);">${rich(b.text(s.label))}</div>${
          s.text ? `<div class="b t" style="font-size:${txSize}px;margin-top:8px;">${rich(b.text(s.text))}</div>` : ""
        }</div>`,
      );
      b.add(`</div>`);
      b.anim({ id: b.id(`bk${i}`), from: { opacity: 0, scale: 0.7 }, to: { opacity: 1, scale: 1 }, at: { cue: 0, f: 0, d: -0.2 + 0.08 * i }, dur: 0.6, ease: "back.out(1.6)" });
      b.anim({ id: g, from: { opacity: 0 }, to: { opacity: DIM }, at: { cue: 0, f: 0, d: -0.2 + 0.08 * i }, dur: 0.45, ease: "power2.out" });
      b.anim({ id: b.id(`n${i}`), from: { scale: 0.7 }, to: { scale: 1 }, at: { cue: 0, f: 0, d: -0.2 + 0.08 * i }, dur: 0.6, ease: "back.out(1.6)" });
      // sáng lên khi được nói tới
      b.anim(undim(ctx, g, beats[i], DIM));
      b.anim({ id: b.id(`on${i}`), from: { opacity: 0 }, to: { opacity: 1 }, at: beats[i], dur: 0.4, ease: "power2.out" });
      b.anim({ id: b.id(`n${i}`), from: { scale: 1 }, to: { scale: 1.08 }, at: beats[i], dur: 0.25, ease: "power2.out" });
      b.anim({ id: b.id(`n${i}`), from: { scale: 1.08 }, to: { scale: 1 }, at: shift(beats[i], 0.25), dur: 0.45, ease: "power2.inOut" });
      const off = i < N - 1 ? beats[i + 1] : finalAt;
      if (i < N - 1) b.anim(dim(ctx, g, off, DIM));
      b.anim({ id: b.id(`on${i}`), from: { opacity: 1 }, to: { opacity: 0 }, at: off, dur: 0.45, ease: "power2.inOut" });
      // cung tới giai đoạn kế (cung cuối khép vòng ở finalAt)
      const arcAt = i < N - 1 ? shift(beats[i + 1], -moveDur + 0.05) : finalAt;
      b.anim(draw(ctx, b.id(`arc${i}`), arcAt, moveDur, "power2.inOut"));
      b.anim(draw(ctx, b.id(`head${i}`), shift(arcAt, moveDur - 0.05), 0.25, "power2.out"));
      b.anim({ id: b.id("orb"), from: { rotate: rot(i) }, to: { rotate: rot(i + 1) }, at: arcAt, dur: moveDur + 0.05, ease: "power2.inOut" });
    });
    // khép vòng: mọi giai đoạn sáng lại
    st.slice(0, -1).forEach((_, i) => b.anim(undim(ctx, b.id(`g${i}`), shift(finalAt, 0.15), DIM)));
    b.anim({ id: b.id("orb"), from: { opacity: 1 }, to: { opacity: 0 }, at: shift(finalAt, moveDur), dur: 0.3, ease: "power2.in" });

    if (P.center) {
      const inner = R - D / 2 - 24;
      const cw = Math.min(400, inner * 1.6);
      const iconS = P.center.icon ? Math.min(84, inner * 0.4) : 0;
      const cs = fitSize(P.center.label, cw, 44, { maxLines: 3, kind: "display", min: 30 });
      const chH = blockHeight(P.center.label, cs, cw, "display") + (iconS ? iconS + 14 : 0);
      b.add(
        `<div id="${b.id("center")}" class="abs tone-accent" style="${box(cx - cw / 2, cy - chH / 2, cw, chH)}display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;">${
          iconS ? `<div class="icon" style="width:${px(iconS)};height:${px(iconS)};flex:none;">${iconSvg(P.center.icon)}</div>` : ""
        }<div class="d t" style="font-size:${cs}px;text-wrap:balance;">${rich(b.text(P.center.label))}</div></div>`,
      );
      b.anim(enter(ctx, b.id("center"), centerAt, { scale: 0.9, rise: 10 }));
      b.anim({ id: b.id("center"), from: { scale: 1 }, to: { scale: 1.06 }, at: shift(finalAt, 0.3), dur: 0.35, ease: "power2.out" });
      b.anim({ id: b.id("center"), from: { scale: 1.06 }, to: { scale: 1 }, at: shift(finalAt, 0.65), dur: 0.5, ease: "power2.inOut" });
    }
    return b.done();
  },
};
