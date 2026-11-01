// image-focus – Ảnh của người dùng (ảnh chụp màn hình, ảnh hiện trường): khung ảnh viền mảnh bật vào, ảnh trôi chậm (Ken Burns)
// suốt cảnh, vùng khoanh (≤ 4) vẽ nét theo câu kèm nhãn, tuỳ chọn phóng tới một vùng. Mọi transform nằm trên div HTML bọc
// (lớp cvs-cam để QA đo bố cục ở scale 1); khung vẽ SVG chỉ tween dash/opacity. Toạ độ khoanh/phóng theo % của ẢNH.
// Ảnh thiếu/mã sai → khung giữ chỗ trung tính (bộ dựng bỏ <img> trỏ tới ảnh không còn).

import { ASSET_ID_RE, IMG_DIR, parseAssetId } from "../assets";
import { iconSvg } from "../icons";
import { dim, enter, fade, move, shift } from "../motion";
import { blockHeight, fitSize, rich } from "../text";
import { beatOf, box, header, SAFE, SpecBuilder, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const pct = { type: "number", minimum: 0, maximum: 100 };

export type ImageCallout = { x: number; y: number; w: number; h: number; label?: string; at?: Beat };
export type ImageFocusParams = {
  kicker?: string;
  title?: string;
  /** Mã ảnh của dự án (do người dùng tải lên). */
  image: string;
  /** contain: thấy trọn ảnh (ảnh chụp màn hình); cover: ảnh phủ kín khung (ảnh chụp thật). */
  fit?: "contain" | "cover";
  callouts?: ImageCallout[];
  zoom?: { x: number; y: number; scale?: number; at?: Beat };
};

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export const imageFocus: TemplateDef<ImageFocusParams> = {
  id: "image-focus",
  label: "Ảnh của cảnh (khoanh vùng, phóng to)",
  when: "CHỈ khi cảnh đã có ảnh người dùng tải lên (ảnh chụp màn hình phần mềm, ảnh hiện trường/thiết bị) – giữ nguyên \"image\" của thiết kế hiện tại. Khoanh lần lượt ≤ 4 vùng có nhãn theo lời thoại (x, y, w, h tính % của ảnh), tuỳ chọn phóng tới một vùng.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      image: { type: "string", description: "Mã ảnh của dự án – không tự đặt" },
      fit: { type: "string", enum: ["contain", "cover"] },
      callouts: {
        type: "array",
        maxItems: 4,
        items: { type: "object", properties: { x: pct, y: pct, w: pct, h: pct, label: { type: "string" }, at: beatSchema }, required: ["x", "y", "w", "h"] },
      },
      zoom: { type: "object", properties: { x: pct, y: pct, scale: { type: "number", minimum: 1.1, maximum: 2.5 }, at: beatSchema }, required: ["x", "y"] },
    },
    required: ["image"],
  },
  example: {
    title: "Khai báo sự cố trên **phần mềm**",
    image: "0000000000000000-1600x1000.png",
    fit: "contain",
    callouts: [
      { x: 3, y: 18, w: 22, h: 10, label: "Mục Báo cáo sự cố" },
      { x: 34, y: 40, w: 40, h: 9, label: "Mô tả ngắn gọn" },
      { x: 70, y: 82, w: 20, h: 9, label: "Gửi báo cáo" },
    ],
    zoom: { x: 80, y: 86, scale: 1.6 },
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const meta = parseAssetId(P.image);
    if (!meta) b.assume(`Ảnh "${String(P.image ?? "").slice(0, 40)}" không hợp lệ – hiện khung giữ chỗ`);
    const iw0 = meta?.w ?? 1600;
    const ih0 = meta?.h ?? 1000;
    const fit = P.fit === "cover" ? "cover" : "contain";
    const y0 = P.title || P.kicker ? header(b, { kicker: P.kicker, title: P.title }) : SAFE.y0 + 24;
    const area = { x: SAFE.x0, y: y0, w: SAFE.w, h: SAFE.y1 - 12 - y0 };

    // khung + vị trí ảnh trong khung (toạ độ khung)
    let W: number, H: number, ix: number, iy: number, iw: number, ih: number;
    if (fit === "contain") {
      const s = Math.min(area.w / iw0, area.h / ih0);
      W = iw0 * s;
      H = ih0 * s;
      [ix, iy, iw, ih] = [0, 0, W, H];
    } else {
      W = area.w;
      H = area.h;
      const s = Math.max(W / iw0, H / ih0);
      iw = iw0 * s;
      ih = ih0 * s;
      ix = (W - iw) / 2;
      iy = (H - ih) / 2;
    }
    const fx = area.x + (area.w - W) / 2;
    const fy = area.y + (area.h - H) / 2;
    const toX = (p: number) => ix + (p / 100) * iw;
    const toY = (p: number) => iy + (p / 100) * ih;

    const callouts = (P.callouts ?? []).slice(0, 4).map((c) => {
      const x = clamp(c?.x, 0, 99, 0);
      const y = clamp(c?.y, 0, 99, 0);
      return { x, y, w: clamp(c?.w, 1, 100 - x, 10), h: clamp(c?.h, 1, 100 - y, 10), label: typeof c?.label === "string" && c.label.trim() ? c.label : undefined, at: c?.at };
    });
    const nC = callouts.length;
    const zoom = P.zoom && Number.isFinite(P.zoom.x) && Number.isFinite(P.zoom.y) ? P.zoom : undefined;
    const slots = nC + (zoom ? 1 : 0);
    const cBeat = (i: number) => beatOf(callouts[i].at, i, slots, n, 0.15);

    const frame = b.id("frame");
    const zid = b.id("zoom");
    const kb = b.id("kb");
    const R = "var(--radius)";
    const inner: string[] = [];
    // khung giữ chỗ (nằm dưới ảnh; hiện ra khi ảnh thiếu)
    const icS = Math.min(W, H) * 0.22;
    inner.push(`<div class="abs icon tone-neutral" style="${box((W - icS) / 2, (H - icS) / 2, icS, icS)}opacity:.5;">${iconSvg("image")}</div>`);
    if (meta && ASSET_ID_RE.test(P.image)) inner.push(`<img src="${IMG_DIR}${P.image}" alt="" style="position:absolute;${box(ix, iy, iw, ih)}display:block;max-width:none;">`);

    // vùng khoanh: nền nhấn mờ + viền vẽ nét; nhãn đặt trên vùng (thiếu chỗ → dưới; vẫn thiếu → góc trong)
    const svg: string[] = [];
    const labels: string[] = [];
    const ls = 30;
    callouts.forEach((c, i) => {
      const x = toX(c.x), y = toY(c.y), w = (c.w / 100) * iw, h = (c.h / 100) * ih;
      const g = b.id(`cg${i}`);
      svg.push(
        `<g id="${g}"><rect id="${b.id(`cf${i}`)}" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="10" style="fill:var(--accent);fill-opacity:.12;stroke:none"/>` +
          `<rect id="${b.id(`c${i}`)}" class="draw" pathLength="1" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="10" style="fill:none;stroke:var(--accent);stroke-width:5px;stroke-linejoin:round"/></g>`,
      );
      const at = cBeat(i);
      b.anim({ id: b.id(`c${i}`), from: { dash: 1 }, to: { dash: 0 }, at, dur: ctx.slow ? 1.0 : 0.75, ease: "power2.inOut" });
      b.anim(fade(ctx, b.id(`cf${i}`), shift(at, 0.3), 0.4));
      if (c.label) {
        const maxW = Math.min(560, W - 24);
        const tw = Math.min(maxW - 40, Math.ceil(c.label.length * ls * 0.56) + 8);
        const lh = blockHeight(c.label, ls, tw);
        const cw = tw + 40;
        const ch = lh + 20;
        // lề 28 px: Ken Burns phóng 1,04 đẩy mép nhãn ra ngoài khung
        const lx = Math.max(28, Math.min(W - cw - 28, x));
        const ly = y - ch - 12 >= 24 ? y - ch - 12 : y + h + 12 + ch <= H - 24 ? y + h + 12 : y + 12;
        const id = b.id(`lab${i}`);
        labels.push(
          `<div id="${id}" class="abs b bb t tone-accent" style="${box(lx, ly, cw, ch)}box-sizing:border-box;padding:10px 20px;border-radius:10px;background:var(--tone);color:var(--bg3);font-size:${ls}px;box-shadow:0 6px 18px rgba(0,0,0,.18);">${rich(b.text(c.label))}</div>`,
        );
        b.anim(enter(ctx, id, shift(at, 0.35), { rise: 10, blur: 4, dur: 0.5 }));
        // nhãn cũ che nội dung ảnh → ẩn hẳn khi vùng sau hiện (khung khoanh chỉ lùi lại)
        if (i < nC - 1) b.anim({ id, from: { opacity: 1 }, to: { opacity: 0 }, at: shift(cBeat(i + 1), -0.1), dur: 0.35, ease: "power2.in" });
      }
      if (i < nC - 1) b.anim(dim(ctx, g, cBeat(i + 1), 0.45));
    });
    if (svg.length) inner.push(`<svg class="abs" style="${box(0, 0, W, H)}overflow:visible" viewBox="0 0 ${r1(W)} ${r1(H)}">${svg.join("")}</svg>`);
    inner.push(...labels);

    // Ken Burns: phóng 1 → 1,04 quanh tâm và trôi nhẹ về phía các vùng khoanh (không lộ mép: trôi < phần dư 2 %)
    const cx = nC ? callouts.reduce((a, c) => a + c.x + c.w / 2, 0) / nC : 60;
    const cy = nC ? callouts.reduce((a, c) => a + c.y + c.h / 2, 0) / nC : 50;
    const dx = Math.max(-0.016, Math.min(0.016, ((50 - cx) / 50) * 0.016)) * W;
    const dy = Math.max(-0.012, Math.min(0.012, ((50 - cy) / 50) * 0.012)) * H;
    b.anim({ id: kb, from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.04, x: r1(dx), y: r1(dy) }, at: { t: 0 }, until: { end: 0 }, dur: 1, ease: "sine.inOut" });

    // phóng tới vùng: gốc 0 0, đưa điểm về giữa khung nhưng không để lộ mép ảnh

    if (zoom) {
      const s = clamp(zoom.scale, 1.1, 2.5, 1.6);
      const px0 = toX(clamp(zoom.x, 0, 100, 50));
      const py0 = toY(clamp(zoom.y, 0, 100, 50));
      const tx = Math.max(W - s * W, Math.min(0, W / 2 - s * px0));
      const ty = Math.max(H - s * H, Math.min(0, H / 2 - s * py0));
      const at = beatOf(zoom.at, nC, slots, n, 0.1);
      b.anim(move(ctx, zid, at, { scale: 1, x: 0, y: 0 }, { scale: s, x: r1(tx), y: r1(ty) }, ctx.slow ? 1.4 : 1.1));
    }

    b.add(
      `<div id="${frame}" class="abs" style="${box(fx, fy, W, H)}border-radius:${R};background:var(--bg2);box-shadow:0 24px 60px rgba(0,0,0,.16);transform-origin:50% 50%;">` +
        `<div class="abs" style="${box(0, 0, W, H)}overflow:hidden;border-radius:${R};">` +
        `<div id="${zid}" class="abs cvs-cam" style="${box(0, 0, W, H)}transform-origin:0px 0px;">` +
        `<div id="${kb}" class="abs cvs-cam" style="${box(0, 0, W, H)}transform-origin:50% 50%;">${inner.join("")}</div>` +
        `</div></div>` +
        // viền mảnh phủ trên ảnh (ảnh nền trắng vẫn tách khỏi nền cảnh)
        `<div class="abs" style="${box(0, 0, W, H)}box-sizing:border-box;border-radius:${R};box-shadow:inset 0 0 0 2px var(--card-border);pointer-events:none;"></div>` +
        `</div>`,
    );
    b.anim(enter(ctx, frame, { t: 0.3 }, { rise: 30, scale: 0.97 }));
    return b.done();
  },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
