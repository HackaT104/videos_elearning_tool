// Trung tâm – vệ tinh: một khái niệm trung tâm (đĩa tròn có biểu tượng) và 3–6 thẻ vệ tinh trên một quỹ đạo elip.
// Đường nối vẽ ra theo thứ tự lời thoại rồi thẻ bật lên; ý cũ lùi mờ khi sang ý mới, cuối cảnh sáng lại.
// Cảm hứng bố cục: HyperFrames constellation-hub / radial-surround (Apache-2.0) – viết lại theo SpecBuilder.

import type { Tone } from "@cvs/themes";
import { guessIcon, iconSvg } from "../icons";
import { dim, draw, enter, fade, pop, shift, undim } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, fitSize, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };
const iconSchema = { type: "string", description: "Tên biểu tượng trong thư viện" };

export type HubSpokeParams = {
  kicker?: string;
  title?: string;
  hub: { label: string; icon?: string; tone?: Tone; at?: Beat };
  spokes: { label: string; text?: string; icon?: string; tone?: Tone; at?: Beat }[];
};

/** Góc (độ, 0 = phải, chiều kim đồng hồ) của vệ tinh theo số lượng – trải ngang cho khung 16:9, đọc theo chiều kim đồng hồ. */
const ANGLES: Record<number, number[]> = {
  2: [180, 0],
  3: [-90, 30, 150],
  4: [-145, -35, 35, 145],
  5: [-90, -18, 54, 126, 198],
  6: [-124, -56, 0, 56, 124, 180],
};

/** Mốc trùng nhau (cùng câu, cùng f) → lệch dần 0,1 s để vẫn có stagger. */
function spread(beats: TimeRef[]): TimeRef[] {
  const seen = new Map<string, number>();
  return beats.map((r) => {
    const k = JSON.stringify(r);
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    return c ? shift(r, 0.1 * c) : r;
  });
}

export const hubSpoke: TemplateDef<HubSpokeParams> = {
  id: "hub-spoke",
  label: "Trung tâm – vệ tinh",
  when: "Một khái niệm trung tâm và 3–6 thành phần/yếu tố/bên liên quan xoay quanh nó (trụ cột của hệ thống quản lý, các bên liên quan, yếu tố ảnh hưởng). Nhãn vệ tinh ≤ 5 từ.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      hub: { type: "object", properties: { label: { type: "string", description: "≤ 5 từ" }, icon: iconSchema, tone: toneSchema, at: beatSchema }, required: ["label"] },
      spokes: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: { type: "object", properties: { label: { type: "string", description: "≤ 5 từ" }, text: { type: "string", description: "Dòng phụ ngắn (tuỳ chọn)" }, icon: iconSchema, tone: toneSchema, at: beatSchema }, required: ["label"] },
      },
    },
    required: ["hub", "spokes"],
  },
  example: {
    kicker: "ISO 45001",
    title: "Bốn hoạt động cốt lõi của an toàn lao động",
    hub: { label: "An toàn lao động", icon: "shield" },
    spokes: [
      { label: "Nhận diện mối nguy", icon: "warning" },
      { label: "Đánh giá rủi ro", icon: "search" },
      { label: "Biện pháp kiểm soát", icon: "checklist" },
      { label: "Đào tạo người lao động", icon: "people" },
    ],
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const spokes = P.spokes.slice(0, 6);
    const N = Math.max(2, spokes.length);
    const angles = (ANGLES[N] ?? ANGLES[6]).slice(0, spokes.length).map((a) => (a * Math.PI) / 180);
    const y0 = header(b, { kicker: P.kicker, title: P.title });
    const top = y0 + 6;
    const bottom = 1000;
    const cx = 960;

    // ---- thẻ vệ tinh: cùng cỡ chữ, cùng kích thước
    const cardW = N >= 5 ? 380 : 400;
    const pad = 26;
    const hasIcon = spokes.some((s) => s.icon);
    const iconS = hasIcon ? 60 : 0;
    const lw = cardW - pad * 2 - (iconS ? iconS + 18 : 0);
    const lSize = Math.min(...spokes.map((s) => fitSize(s.label, lw, 38, { maxLines: 2, kind: "display", min: 28 })));
    const txSize = Math.min(30, ...spokes.filter((s) => s.text).map((s) => fitSize(s.text!, lw, 30, { maxLines: 2, min: 28 })));
    const innerH = Math.max(iconS, ...spokes.map((s) => blockHeight(s.label, lSize, lw, "display") + (s.text ? 6 + blockHeight(s.text, txSize, lw) : 0)));
    const cardH = Math.ceil(innerH + pad * 2);

    // ---- quỹ đạo: rx theo bề ngang; ry + tâm dọc sao cho thẻ nằm gọn [top, bottom], elip không ra khỏi khung, khối thẻ cân giữa
    const sins = angles.map((a) => Math.sin(a));
    const sNeg = Math.max(0, ...sins.map((v) => -v));
    const sPos = Math.max(0, ...sins);
    const maxSin = Math.max(0.05, sNeg, sPos);
    const H = bottom - top;
    const rx = Math.min(720, ...angles.filter((a) => Math.abs(Math.cos(a)) > 0.05).map((a) => (SAFE.x1 - cardW / 2 - cx) / Math.abs(Math.cos(a))));
    const ry = Math.max(120, Math.min((H - cardH) / Math.max(0.1, sNeg + sPos), (H + 40) / 2, (1030 - top - cardH / 2) / (1 + sNeg), (H - cardH / 2 + 20) / (1 + sPos)));
    const cyExt = top + (H - (ry * (sNeg + sPos) + cardH)) / 2 + cardH / 2 + ry * sNeg;
    const cyLo = Math.max(top - 20 + ry, top + cardH / 2 + ry * sNeg);
    const cyHi = Math.min(1030 - ry, bottom - cardH / 2 - ry * sPos);
    const cy = Math.max(cyLo, Math.min(cyHi, cyExt));
    // đĩa trung tâm: không chạm thẻ trên/dưới
    const vRoom = maxSin > 0.95 ? 2 * (ry - cardH / 2 - 36) : 2 * (bottom - top) * 0.42;
    const D = Math.max(220, Math.min(N >= 6 ? 270 : 320, vRoom));
    const hubTone = toneClass(P.hub.tone);
    const hlW = D * 0.72;
    const hlSize = fitSize(P.hub.label, hlW, 40, { maxLines: 3, kind: "display", min: 28 });
    const hIcon = Math.round(D * 0.26);

    // ---- mốc thời gian
    const hubAt: TimeRef = P.hub.at ? beatOf(P.hub.at, 0, 1, n) : { cue: 0, f: 0.02 };
    const beats = spread(spokes.map((s, i) => beatOf(s.at, i + 1, spokes.length + 1, n, 0.08)));

    // quỹ đạo chấm mờ (trang trí)
    b.add(
      `<svg id="${b.id("orbit")}" class="abs" style="${box(0, 0, 1920, 1080)}overflow:visible;opacity:.55" viewBox="0 0 1920 1080"><ellipse cx="${cx}" cy="${Math.round(cy)}" rx="${Math.round(rx)}" ry="${Math.round(ry)}" style="fill:none;stroke:var(--line);stroke-width:3px;stroke-dasharray:2 16;stroke-linecap:round"/></svg>`,
    );
    b.anim(fade(ctx, b.id("orbit"), { t: 0.3 }, 0.8));

    // đường nối (một SVG chung)
    const pos = angles.map((a) => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }));
    const ends = pos.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const s = Math.min(Math.abs(dx) > 0.5 ? (cardW / 2 + 14) / Math.abs(dx) : Infinity, Math.abs(dy) > 0.5 ? (cardH / 2 + 14) / Math.abs(dy) : Infinity);
      return { x0: cx + (dx / len) * (D / 2 + 12), y0: cy + (dy / len) * (D / 2 + 12), x1: p.x - dx * s, y1: p.y - dy * s };
    });
    b.add(
      `<svg class="abs" style="${box(0, 0, 1920, 1080)}overflow:visible" viewBox="0 0 1920 1080">${ends
        .map(
          (e, i) =>
            `<path id="${b.id(`ln${i}`)}" class="line draw ${toneClass(spokes[i].tone)}" pathLength="1" d="M${Math.round(e.x0)} ${Math.round(e.y0)} L${Math.round(e.x1)} ${Math.round(e.y1)}" style="stroke:var(--tone)"/>`,
        )
        .join("")}</svg>`,
    );

    // đĩa trung tâm
    const halo = D + 56;
    b.add(`<div id="${b.id("halo")}" class="abs ${hubTone}" style="${box(cx - halo / 2, cy - halo / 2, halo, halo)}border-radius:50%;background:var(--bg2);"></div>`);
    b.add(
      `<div id="${b.id("hub")}" class="abs ${hubTone}" style="${box(cx - D / 2, cy - D / 2, D, D)}border-radius:50%;background:var(--card);border:6px solid var(--tone);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding-top:6px;">` +
        `<div class="icon" style="width:${px(hIcon)};height:${px(hIcon)};flex:none;">${iconSvg(P.hub.icon ?? guessIcon(P.hub.label))}</div>` +
        `<div id="${b.id("hubl")}" class="d t" style="width:${px(hlW)};font-size:${hlSize}px;text-align:center;text-wrap:balance;">${rich(b.text(P.hub.label))}</div></div>`,
    );
    b.anim(pop(ctx, b.id("halo"), shift(hubAt, -0.1), 0.5));
    b.anim(pop(ctx, b.id("hub"), hubAt, 0.7));
    b.anim(enter(ctx, b.id("hubl"), shift(hubAt, 0.18), { rise: 12, blur: 4 }));

    spokes.forEach((s, i) => {
      const p = pos[i];
      const e = ends[i];
      const tone = toneClass(s.tone);
      const id = b.id(`sp${i}`);
      b.add(
        `<div id="${id}" class="card ${tone}" style="${box(p.x - cardW / 2, p.y - cardH / 2, cardW, cardH)}padding:${pad}px;display:flex;align-items:center;gap:18px;">` +
          (iconS ? `<div class="icon" style="width:${iconS}px;height:${iconS}px;flex:none;">${s.icon ? iconSvg(s.icon) : ""}</div>` : "") +
          `<div style="width:${px(lw)};"><div class="d t" style="font-size:${lSize}px;text-wrap:balance;">${rich(b.text(s.label))}</div>${
            s.text ? `<div class="b soft t" style="font-size:${txSize}px;margin-top:6px;">${rich(b.text(s.text))}</div>` : ""
          }</div></div>`,
      );
      b.add(`<div id="${b.id(`dt${i}`)}" class="abs ${tone}" style="${box(e.x1 - 8, e.y1 - 8, 16, 16)}border-radius:50%;background:var(--tone);"></div>`);
      b.anim(draw(ctx, b.id(`ln${i}`), beats[i], ctx.slow ? 0.75 : 0.55, "power2.out"));
      b.anim(pop(ctx, b.id(`dt${i}`), shift(beats[i], ctx.slow ? 0.6 : 0.45), 0.4));
      b.anim(pop(ctx, id, shift(beats[i], ctx.slow ? 0.5 : 0.35), 0.82));
    });

    // một điểm nhấn mỗi nhịp: ý trước lùi mờ khi câu mới nói tới ý sau (chỉ khi khác câu)
    const cueOf = (r: TimeRef) => ("cue" in r ? r.cue : -1);
    const dimmed: number[] = [];
    for (let i = 0; i < spokes.length - 1; i++) {
      if (cueOf(beats[i + 1]) > cueOf(beats[i])) {
        b.anim(dim(ctx, b.id(`sp${i}`), beats[i + 1], 0.45));
        dimmed.push(i);
      }
    }
    const lastAt = shift(beats[spokes.length - 1], ctx.slow ? 1.6 : 1.2);
    for (const i of dimmed) b.anim(undim(ctx, b.id(`sp${i}`), lastAt, 0.45));
    return b.done();
  },
};
