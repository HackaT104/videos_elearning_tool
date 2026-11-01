// illustration – Hình minh hoạ vector phẳng do Claude vẽ (SVG đã lọc, màu theo biến theme): các nhóm part-1..N hiện dần theo câu
// (mờ → rõ), nét viền lớp "draw" vẽ ra bằng dash; khung HTML bọc ngoài bật vào (scale chỉ đặt trên div HTML – Remotion ghi đè
// transform của phần tử được tween, nên con SVG chỉ tween opacity/dash). Ý chính (≤ 3) vào bên cạnh, chú thích dưới hình.
// Thiếu SVG (chưa đăng nhập Claude / SVG bị từ chối) → khung giữ chỗ trung tính có biểu tượng, không lỗi.

import { iconSvg } from "../icons";
import { dim, enter, shift } from "../motion";
import type { TimeRef } from "../spec";
import { parseSvg, serializeSvg, svgViewBox, type SvgEl } from "../svg-sanitize";
import { blockHeight, fitSize, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };

export type IllustrationParams = {
  kicker?: string;
  title?: string;
  /** Mô tả hình cần vẽ (AI điền); bước dựng cảnh gọi Claude vẽ rồi lưu SVG vào "svg". */
  brief?: string;
  /** SVG đã lọc (viewBox 0 0 800 600, nhóm part-1..N). */
  svg?: string;
  caption?: string;
  points?: { text: string; at?: Beat }[];
  layout?: "left" | "right" | "full";
  at?: Beat;
};

const MAX_PARTS = 10;
const MAX_DRAWS = 60;

const isEl = (c: SvgEl | string): c is SvgEl => typeof c !== "string";

/** Nhóm hiện dần: phần tử id part-N (sắp theo N, không lồng nhau); không có → gom con cấp 1 thành ≤ 6 nhóm liền nhau. */
function findParts(root: SvgEl): SvgEl[] {
  const found: SvgEl[] = [];
  const walk = (e: SvgEl) => {
    for (const c of e.children.filter(isEl)) {
      if (/^part-\d+$/.test(c.attrs.id ?? "")) found.push(c);
      else walk(c);
    }
  };
  walk(root);
  if (found.length) return found.sort((a, b) => Number(a.attrs.id!.slice(5)) - Number(b.attrs.id!.slice(5)));
  const top = root.children.filter(isEl);
  if (top.length <= 6) return top;
  const k = Math.ceil(top.length / 6);
  const groups: SvgEl[] = [];
  for (let i = 0; i < top.length; i += k) groups.push({ tag: "g", attrs: {}, style: {}, children: top.slice(i, i + k) });
  root.children = groups;
  return groups;
}

function collectDraws(e: SvgEl, out: SvgEl[] = []): SvgEl[] {
  for (const c of e.children.filter(isEl)) {
    if (c.tag !== "g" && c.attrs.class?.split(" ").includes("draw")) out.push(c);
    collectDraws(c, out);
  }
  return out;
}

export const illustration: TemplateDef<IllustrationParams> = {
  id: "illustration",
  label: "Hình minh hoạ (AI vẽ)",
  when: "Cần một hình minh hoạ cụ thể mà biểu tượng không diễn tả được: người/tình huống/thiết bị/hiện trường (vd. công nhân đội mũ bảo hộ đứng cạnh máy ép, kho lạnh có nhiệt kế). Chỉ điền \"brief\" (mô tả hình bằng lời, ≤ 60 từ: chủ thể, hành động, đồ vật, bố cục, phần nào hiện trước), KHÔNG tự viết SVG – hệ thống tự vẽ. Hình không có chữ; thông điệp đặt ở title/points/caption.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      brief: { type: "string", description: "Mô tả hình cần vẽ (tiếng Việt, ≤ 60 từ), nêu thứ tự các phần hiện ra" },
      svg: { type: "string", description: "Do hệ thống điền – không tự viết" },
      caption: { type: "string" },
      points: { type: "array", maxItems: 3, items: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] } },
      layout: { type: "string", enum: ["left", "right", "full"], description: "left/right: hình bên trái/phải, ý chính bên kia; full: hình giữa khung" },
      at: beatSchema,
    },
    required: [],
  },
  example: {
    title: "Trang bị **bảo hộ** trước khi vào xưởng",
    brief: "Người công nhân đứng thẳng, đội mũ bảo hộ màu nhấn, đeo kính và găng tay, cạnh một máy ép công nghiệp. Hiện lần lượt: sàn và máy ép, người công nhân, mũ bảo hộ, kính và găng tay.",
    points: [{ text: "Mũ bảo hộ cài quai" }, { text: "Kính chống bắn tóe" }, { text: "Găng tay chống cắt" }],
    layout: "left",
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const points = (P.points ?? []).filter((p) => p?.text).slice(0, 3);
    const layout = P.layout ?? (points.length ? "left" : "full");
    const y0 = P.title || P.kicker ? header(b, { kicker: P.kicker, title: P.title }) : SAFE.y0 + 30;
    const yMax = SAFE.y1 - 12;

    // SVG: lọc lại (phòng thủ nhiều lớp – kể cả tham số người dùng sửa tay)
    const parsed = P.svg ? parseSvg(P.svg, "illustration") : null;
    const root = parsed?.root ?? null;
    if (P.svg && !root) b.assume(`SVG minh hoạ bị từ chối (${parsed?.error}) – hiện khung giữ chỗ`);
    if (!P.svg) b.assume(`Chưa có hình minh hoạ${P.brief ? ` cho «${P.brief.slice(0, 80)}»` : ""} – cần đăng nhập Claude để vẽ; đang hiện khung giữ chỗ`);
    if (root) b.assume(`Hình minh hoạ do AI vẽ${P.brief ? ` theo mô tả «${P.brief.slice(0, 80)}»` : ""} – cần duyệt hình`);
    const vb = root ? svgViewBox(root) : ([0, 0, 800, 600] as const);
    const ar = vb[2] / vb[3];

    // bố cục: vùng hình + cột/hàng ý chính + chú thích
    const side = layout !== "full" && points.length > 0;
    const colGap = 64;
    const colW = side ? 600 : 0;
    const artRect = { x: SAFE.x0, y: y0, w: SAFE.w - (side ? colW + colGap : 0), h: yMax - y0 };
    if (side && layout === "right") artRect.x = SAFE.x0 + colW + colGap;
    // hàng ý chính dưới hình (layout full)
    const rowPts = !side && points.length > 0;
    const rowGap = 40;
    const rowW = rowPts ? (SAFE.w - rowGap * (points.length - 1)) / points.length : 0;
    const rowSize = rowPts ? Math.min(...points.map((p) => fitSize(p.text, rowW - 70, 36, { maxLines: 2, min: 30 }))) : 0;
    const rowH = rowPts ? Math.max(...points.map((p) => Math.max(52, blockHeight(p.text, rowSize, rowW - 70)))) : 0;
    if (rowPts) artRect.h -= rowH + 36;
    const capW = artRect.w;
    const capSize = P.caption ? fitSize(P.caption, capW, 36, { maxLines: 2, min: 30 }) : 0;
    const capH = P.caption ? blockHeight(P.caption, capSize, capW) : 0;
    if (P.caption) artRect.h -= capH + 24;
    artRect.h = Math.max(240, artRect.h);
    const sc = Math.min(artRect.w / vb[2], artRect.h / vb[3]);
    const aw = vb[2] * sc;
    const ah = vb[3] * sc;
    const ax = artRect.x + (artRect.w - aw) / 2;
    const ay = artRect.y + (artRect.h - ah) / 2;

    // mốc: hình bắt đầu ở câu 0; các nhóm hiện trong nửa đầu (nhường câu cuối cho ý chính)
    const aStart: TimeRef = beatOf(P.at, 0, 1, n, 0.02);
    const revealEnd = points.length && n > points.length ? n - points.length - 1 : Math.max(0, Math.ceil(n / 2) - 1);
    const startCue = "cue" in aStart ? aStart.cue : 0;
    const lastCue = Math.max(startCue, Math.min(n - 1, revealEnd));
    const partBeat = (k: number, m: number): TimeRef => {
      if (n <= 0) return { cue: 0, f: 0 };
      const span = lastCue - startCue + 0.7;
      const pos = startCue + (m <= 1 ? 0 : (k / (m - 1)) * span);
      const cue = Math.min(lastCue, Math.floor(pos));
      return { cue, f: Math.min(0.9, 0.06 + (pos - cue) * 0.85) };
    };

    const wrap = b.id("ill");
    let inner: string;
    let lastReveal: TimeRef = shift(aStart, 0.4);
    if (root) {
      const parts = findParts(root);
      const m = Math.min(parts.length, MAX_PARTS);
      const draws = collectDraws(root);
      const partOf = new Map<SvgEl, number>();
      parts.forEach((p, k) => {
        p.attrs.id = `cvsp${k}`;
        const mark = (e: SvgEl) => {
          partOf.set(e, Math.min(k, MAX_PARTS - 1));
          e.children.filter(isEl).forEach(mark);
        };
        mark(p);
      });
      draws.forEach((d, j) => {
        d.attrs.id ??= `cvsd${j}`;
        d.attrs.pathLength = "1";
      });
      const beats = parts.map((_, k) => partBeat(Math.min(k, m - 1), m));
      inner = serializeSvg(root, { rename: (id) => `${ctx.p}-i-${id}` });
      // thêm kích thước vẽ (SVG gốc không có width/height)
      inner = inner.replace(/^<svg /, `<svg class="sk" style="display:block;width:100%;height:100%;overflow:visible" `); // .sk: nét run tay ở theme bảng trắng
      parts.forEach((p, k) => b.anim({ id: `${ctx.p}-i-${p.attrs.id}`, from: { opacity: 0 }, to: { opacity: 1 }, at: beats[k], dur: ctx.slow ? 0.8 : 0.55, ease: "power2.out" }));
      draws.slice(0, MAX_DRAWS).forEach((d) => {
        const k = partOf.get(d);
        const at = k === undefined ? shift(aStart, 0.25) : beats[k];
        b.anim({ id: `${ctx.p}-i-${d.attrs.id}`, from: { dash: 1 }, to: { dash: 0 }, at, dur: ctx.slow ? 1.2 : 0.9, ease: "power2.inOut" });
      });
      lastReveal = beats.at(-1) ?? lastReveal;
    } else {
      const s = Math.min(aw, ah) * 0.28;
      inner =
        `<div class="abs" style="${box(0, 0, aw, ah)}box-sizing:border-box;border-radius:var(--radius);background:var(--bg2);border:3px dashed var(--card-border);"></div>` +
        `<div class="abs icon tone-neutral" style="${box((aw - s) / 2, (ah - s) / 2, s, s)}opacity:.6;">${iconSvg("image")}</div>`;
    }
    b.add(`<div id="${wrap}" class="abs" style="${box(ax, ay, aw, ah)}transform-origin:50% 60%;">${inner}</div>`);
    b.anim(enter(ctx, wrap, aStart, { rise: 24, scale: 0.94, blur: 6 }));

    if (P.caption) {
      const id = b.id("cap");
      b.add(`<div id="${id}" class="abs b soft t" style="${box(artRect.x, ay + ah + 24, capW)}font-size:${capSize}px;text-align:center;">${rich(b.text(P.caption))}</div>`);
      b.anim(enter(ctx, id, shift(lastReveal, 0.6), { rise: 12 }));
    }

    // ý chính: mặc định mỗi ý một câu cuối (sau phần hiện hình)
    const ptBeat = (i: number) => (points[i].at ? beatOf(points[i].at, i, points.length, n, 0.1) : n > points.length ? { cue: n - points.length + i, f: 0.1 } : beatOf(undefined, i, points.length, n, 0.15));
    const dot = (i: number, size: number) =>
      `<div class="abs d" style="left:0;top:0;width:${px(size)};height:${px(size)};border-radius:50%;background:var(--tone);color:var(--bg3);font-size:${Math.round(size * 0.52)}px;line-height:${px(size)};text-align:center;">${i + 1}</div>`;
    if (side) {
      const cx = layout === "right" ? SAFE.x0 : SAFE.x1 - colW;
      const tw = colW - 78;
      let size = 40;
      const total = (s: number) => points.reduce((a, p) => a + Math.max(56, blockHeight(p.text, s, tw)) + 44, -44);
      while (size > 30 && total(size) > yMax - y0) size -= 2;
      let y = y0 + Math.max(0, (yMax - y0 - total(size)) / 2);
      points.forEach((p, i) => {
        const id = b.id(`pt${i}`);
        const h = Math.max(56, blockHeight(p.text, size, tw));
        b.text(String(i + 1));
        b.add(
          `<div id="${id}" class="abs tone-accent" style="${box(cx, y, colW, h)}">${dot(i, 56)}<div class="abs b t" style="left:78px;top:${px(Math.max(0, (56 - size * 1.35) / 2))};width:${px(tw)};font-size:${size}px;">${rich(b.text(p.text))}</div></div>`,
        );
        b.anim(enter(ctx, id, ptBeat(i), { x: layout === "right" ? -30 : 30, rise: 0 }));
        if (i < points.length - 1) b.anim(dim(ctx, id, ptBeat(i + 1), 0.55));
        y += h + 44;
      });
    } else if (rowPts) {
      const y = yMax - rowH;
      points.forEach((p, i) => {
        const id = b.id(`pt${i}`);
        b.text(String(i + 1));
        b.add(
          `<div id="${id}" class="abs tone-accent" style="${box(SAFE.x0 + i * (rowW + rowGap), y, rowW, rowH)}">${dot(i, 52)}<div class="abs b t" style="left:70px;top:${px(Math.max(0, (52 - rowSize * 1.35) / 2))};width:${px(rowW - 70)};font-size:${rowSize}px;">${rich(b.text(p.text))}</div></div>`,
        );
        b.anim(enter(ctx, id, ptBeat(i), { rise: 20 }));
      });
    }
    return b.done();
  },
};

/** Gợi ý vẽ cho Claude: vai trò màu (biến CSS) + độ dày nét theo theme. */
export function illustrationStyleHints(theme: { dark: boolean; stroke: number }): { strokeWidth: number; dark: boolean } {
  return { strokeWidth: Math.max(3, Math.round(theme.stroke * 1.6)), dark: theme.dark };
}

