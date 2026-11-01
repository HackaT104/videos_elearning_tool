// ui-walkthrough – Hướng dẫn thao tác phần mềm: khung cửa sổ/trình duyệt giả lập bằng HTML (thanh tiêu đề, menu trái, ô nhập, nút –
// đơn giản hoá vì chữ ≥ 28 px), con trỏ chuột (SVG trong div) di chuyển x/y tới từng mục theo câu, bấm: con trỏ nhún + gợn sóng
// (vòng tròn scale + mờ) + viền sáng quanh mục được bấm; ô nhập hiện giá trị sau khi bấm. Bên phải: danh sách bước, bước cũ mờ đi.
// Tuỳ chọn phóng to ở bước cuối: lớp bọc nội dung cửa sổ (class cvs-cam, để QA đo bố cục ở scale 1) scale quanh điểm bấm.

import { dim, enter, fade, move, pop, shift } from "../motion";
import { blockHeight, esc, fitSize, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };

export type UiStep = {
  /** Nhãn của nút / ô / mục menu được bấm (đúng chữ trên phần mềm). */
  label: string;
  /** Mô tả thao tác (hiện ở cột hướng dẫn bên phải). */
  text: string;
  kind?: "menu" | "field" | "button";
  /** Giá trị hiện trong ô sau khi bấm (ô nhập). */
  value?: string;
  at?: Beat;
};

export type UiWalkthroughParams = {
  kicker?: string;
  title?: string;
  /** Tiêu đề cửa sổ phần mềm. */
  window: { title: string; url?: string };
  /** Các mục menu trái (≤ 5); bước kind "menu" phải trùng một mục, nếu thiếu sẽ được thêm. */
  menu?: string[];
  /** Tiêu đề trang bên trong cửa sổ. */
  heading?: string;
  steps: UiStep[];
  /** Phóng to quanh điểm bấm ở bước cuối. */
  zoom?: boolean;
};

const CURSOR_SVG = `<svg viewBox="0 0 40 48" width="40" height="48" style="overflow:visible;display:block"><path d="M3 3 L3 39 L12.5 30 L19 45 L26 42 L19.5 27.5 L33 27.5 Z" style="fill:var(--ink);stroke:var(--bg3);stroke-width:3px;stroke-linejoin:round"/></svg>`;

export const uiWalkthrough: TemplateDef<UiWalkthroughParams> = {
  id: "ui-walkthrough",
  label: "Hướng dẫn thao tác phần mềm",
  when: "Hướng dẫn từng bước thao tác trên phần mềm/biểu mẫu điện tử (2–5 lần bấm: chọn menu, nhập ô, bấm nút) – ví dụ khai báo sự cố, lập phiếu hành động khắc phục.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      window: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title"] },
      menu: { type: "array", maxItems: 5, items: { type: "string" } },
      heading: { type: "string" },
      steps: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          properties: { label: { type: "string" }, text: { type: "string" }, kind: { type: "string", enum: ["menu", "field", "button"] }, value: { type: "string" }, at: beatSchema },
          required: ["label", "text"],
        },
      },
      zoom: { type: "boolean" },
    },
    required: ["window", "steps"],
  },
  example: {
    window: { title: "Hệ thống quản lý an toàn", url: "an-toan.noi-bo/su-co/moi" },
    menu: ["Tổng quan", "Báo cáo sự cố", "Hành động khắc phục"],
    heading: "Khai báo sự cố mới",
    steps: [
      { label: "Báo cáo sự cố", kind: "menu", text: "Mở mục **Báo cáo sự cố** ở menu trái" },
      { label: "Khu vực", value: "Xưởng ép nhựa", text: "Chọn khu vực xảy ra sự cố" },
      { label: "Mô tả", value: "Trượt ngã do dầu tràn", text: "Mô tả ngắn gọn điều đã xảy ra" },
      { label: "Gửi báo cáo", text: "Bấm **Gửi báo cáo** – trưởng ca nhận thông báo ngay" },
    ],
    zoom: true,
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const steps = P.steps.slice(0, 5);
    const y0 = header(b, { kicker: P.kicker, title: P.title });

    // phân loại bước
    const menu = [...(P.menu ?? [])].slice(0, 5);
    const kinds = steps.map((s, i) => s.kind ?? (menu.includes(s.label) ? "menu" : s.value !== undefined ? "field" : i === steps.length - 1 ? "button" : "field"));
    steps.forEach((s, i) => {
      if (kinds[i] === "menu" && !menu.includes(s.label)) menu.push(s.label);
    });
    const fieldIdx = steps.map((_, i) => i).filter((i) => kinds[i] === "field");
    const btnIdx = steps.map((_, i) => i).filter((i) => kinds[i] === "button");

    // khung: cửa sổ trái, cột hướng dẫn phải
    const panelW = 520;
    const gap = 56;
    const W = SAFE.w - panelW - gap;
    const top = y0;
    const maxH = SAFE.y1 - 20 - top;
    const barH = 64;
    const urlH = P.window.url ? 68 : 0;
    const sbW = menu.length ? 290 : 0;
    const cx0 = sbW + 44; // lề trái nội dung trong cửa sổ
    const cw = W - cx0 - 44;
    // ước lượng chữ hơi hẹp hơn thực tế → đo với bề rộng ×0,85 cho an toàn
    const est = (w: number) => w * 0.85;
    const hs = P.heading ? fitSize(P.heading, est(cw), 44, { maxLines: 2, kind: "display", min: 32 }) : 0;
    const hh = P.heading ? blockHeight(P.heading, hs, est(cw), "display") : 0;
    const labW = 260;
    const fieldW = cw - labW - 24;
    const fieldRows = fieldIdx.map((i) => {
      const s = steps[i];
      const ls = fitSize(s.label, est(labW), 30, { maxLines: 2, min: 28 });
      const vs = s.value ? fitSize(s.value, est(fieldW - 48), 30, { maxLines: 1, min: 28 }) : 30;
      const vh = s.value ? blockHeight(s.value, vs, est(fieldW - 48)) : 0;
      const ih = Math.max(64, vh + 22);
      return { i, ls, vs, ih, h: Math.max(ih, blockHeight(s.label, ls, est(labW)) + 8) };
    });
    const fGap = 24;
    const btnH = 70;
    const contentH = 36 + (P.heading ? hh + 30 : 0) + fieldRows.reduce((a, r) => a + r.h + fGap, 0) + (btnIdx.length ? 20 + btnH : 0) + 40;
    const menuRows = menu.map((m) => {
      const ms = fitSize(m, est(sbW - 56), 30, { maxLines: 2, min: 28 });
      return { ms, h: Math.max(64, blockHeight(m, ms, est(sbW - 56)) + 16) };
    });
    const menuH = 28 + menuRows.reduce((a, r) => a + r.h + 8, 0) + 28;
    const bodyH = Math.max(contentH, menuH, 340);
    const H = Math.min(maxH, barH + urlH + bodyH);
    const wy = top + (maxH - H) / 2;
    const wx = SAFE.x0;
    const bodyTop = barH + urlH;

    // vị trí các mục (toạ độ trong cửa sổ) → tâm mục tiêu cho con trỏ
    const target: { x: number; y: number; w: number; h: number }[] = steps.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    const inner: string[] = [];
    const winTitleS = fitSize(P.window.title, est(W - 260), 30, { maxLines: 1, min: 28 });
    // thanh tiêu đề
    inner.push(
      `<div class="abs" style="${box(0, 0, W, barH)}background:var(--bg2);border-bottom:2px solid var(--card-border);"></div>` +
        [0, 1, 2].map((k) => `<div class="abs" style="${box(24 + k * 30, barH / 2 - 9, 18, 18)}border-radius:50%;background:var(--card-border);"></div>`).join("") +
        `<div id="${b.id("wtitle")}" class="abs b bb t" style="${box(130, barH / 2 - winTitleS * 0.68, W - 260)}font-size:${winTitleS}px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-top:.3em;margin-top:-.3em;">${rich(b.text(P.window.title))}</div>`,
    );
    if (P.window.url) {
      inner.push(
        `<div class="abs" style="${box(0, barH, W, urlH)}background:var(--bg2);border-bottom:2px solid var(--card-border);"></div>` +
          `<div id="${b.id("url")}" class="abs b soft t" style="${box(24, barH + 10, W - 48, urlH - 20)}border-radius:999px;background:var(--bg3);border:2px solid var(--card-border);font-size:28px;line-height:${px(urlH - 24)};padding:0 26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(b.text(P.window.url))}</div>`,
      );
    }
    // menu trái
    if (sbW) {
      inner.push(`<div class="abs" style="${box(0, bodyTop, sbW, H - bodyTop)}background:var(--bg2);border-right:2px solid var(--card-border);"></div>`);
      let my = bodyTop + 28;
      menu.forEach((m, k) => {
        const { ms, h } = menuRows[k];
        const si = steps.findIndex((s, i) => kinds[i] === "menu" && s.label === m);
        if (si >= 0) target[si] = { x: 14, y: my, w: sbW - 28, h };
        const lh = blockHeight(m, ms, est(sbW - 56));
        inner.push(`<div id="${b.id(`menu${k}`)}" class="abs b t" style="${box(28, my + (h - lh) / 2, sbW - 56)}font-size:${ms}px;">${rich(b.text(m))}</div>`);
        my += h + 8;
      });
    }
    // nội dung: tiêu đề trang, ô nhập, nút
    let y = bodyTop + 36;
    const gapsY = [0, barH, bodyTop, bodyTop + 18];
    if (P.heading) {
      inner.push(`<div id="${b.id("heading")}" class="abs d t" style="${box(cx0, y, cw)}font-size:${hs}px;">${rich(b.text(P.heading))}</div>`);
      y += hh + 30;
      gapsY.push(y - 15);
    }
    const valIds: [number, string][] = [];
    for (const r of fieldRows) {
      const s = steps[r.i];
      const lh = blockHeight(s.label, r.ls, est(labW));
      inner.push(`<div id="${b.id(`lab${r.i}`)}" class="abs b t" style="${box(cx0, y + (r.h - lh) / 2, labW)}font-size:${r.ls}px;">${rich(b.text(s.label))}</div>`);
      const iy = y + (r.h - r.ih) / 2;
      inner.push(`<div class="abs" style="${box(cx0 + labW + 24, iy, fieldW, r.ih)}border-radius:10px;background:var(--bg3);border:2px solid var(--card-border);"></div>`);
      target[r.i] = { x: cx0 + labW + 24, y: iy, w: fieldW, h: r.ih };
      if (s.value) {
        const vid = b.id(`val${r.i}`);
        const vh = blockHeight(s.value, r.vs, est(fieldW - 48));
        inner.push(`<div id="${vid}" class="abs b t" style="${box(cx0 + labW + 48, iy + (r.ih - vh) / 2, fieldW - 48)}font-size:${r.vs}px;">${rich(b.text(s.value))}</div>`);
        valIds.push([r.i, vid]);
      }
      y += r.h + fGap;
      gapsY.push(y - fGap / 2);
    }
    if (btnIdx.length) {
      y += 20;
      let bx = cx0 + cw;
      for (const i of [...btnIdx].reverse()) {
        const s = steps[i];
        const bs = fitSize(s.label, 380, 30, { maxLines: 1, min: 28 });
        const bw = Math.min(cw, Math.ceil(s.label.length * bs * 0.56) + 80);
        bx -= bw;
        target[i] = { x: bx, y, w: bw, h: btnH };
        inner.push(
          `<div id="${b.id(`btn${i}`)}" class="abs b bb t tone-accent" style="${box(bx, y, bw, btnH)}border-radius:12px;background:var(--tone);color:var(--bg3);font-size:${bs}px;line-height:${px(btnH)};text-align:center;white-space:nowrap;">${rich(b.text(s.label))}</div>`,
        );
        bx -= 24;
      }
    }

    // mốc
    const beats = steps.map((s, i) => beatOf(s.at, i, steps.length, n, 0.12));
    const zoom = !!P.zoom;
    const last = steps.length - 1;
    const lt = target[last];
    // tâm phóng: đưa điểm bấm về phía giữa khung; mép cắt (trên/trái) rơi vào khe giữa các hàng/cột để không cắt ngang chữ.
    // Tâm o, hệ số Z → mép cắt c = o·(1 − 1/Z), vùng thấy được dài L/Z. Thử vài hệ số, ưu tiên có khe ở cả hai trục (trục dọc trước), rồi hệ số nhỏ.
    const gapsX = [0, sbW, cx0 - 22, cx0 + labW + 12];
    const crop = (Z: number, p0: number, p1: number, L: number, gaps: number[]) => {
      const k1 = 1 - 1 / Z;
      const want = Math.max(0, Math.min(L * k1, ((Z * (p0 + p1)) / 2 - L / 2) / (Z - 1) * k1));
      const ok = gaps.filter((g) => g >= 0 && g <= L * k1 + 0.5 && g <= p0 - 16 && g + L / Z >= p1 + 16);
      // không có khe phù hợp → mép cắt gần mong muốn nhất mà vẫn thấy trọn mục được bấm
      const fit = Math.max(0, Math.min(L * k1, Math.min(p0 - 16, Math.max(p1 + 16 - L / Z, want))));
      return { o: (ok.length ? ok.reduce((a, g) => (Math.abs(g - want) < Math.abs(a - want) ? g : a)) : fit) / k1, gap: ok.length > 0 };
    };
    const tryZ = (Z: number) => ({ Z, x: crop(Z, lt.x, lt.x + lt.w, W, gapsX), y: crop(Z, lt.y, lt.y + lt.h, H, gapsY) });
    const score = (c: ReturnType<typeof tryZ>) => Number(c.x.gap) + Number(c.y.gap) * 1.5;
    // hệ số làm mép cắt trùng đúng một khe khi mục bấm nằm sát mép (mép cắt bị ép về L·(1 − 1/Z))
    const fromGaps = [...gapsX.map((g) => 1 / (1 - g / W)), ...gapsY.map((g) => 1 / (1 - g / H))].filter((z) => z >= 1.18 && z <= 1.5);
    const zs = [1.25, 1.3, 1.35, 1.4, ...fromGaps.map((z) => z + 0.002)];
    const zc = zs.map(tryZ).reduce((a, c) => (score(c) > score(a) || (score(c) === score(a) && Math.abs(c.Z - 1.3) < Math.abs(a.Z - 1.3)) ? c : a));
    const Z = zc.Z;
    const ox = zc.x.o;
    const oy = zc.y.o;

    // viền sáng + gợn sóng + con trỏ
    const fx: string[] = [];
    steps.forEach((_, i) => {
      const t = target[i];
      const hid = b.id(`hl${i}`);
      fx.push(`<div id="${hid}" class="abs tone-accent" style="${box(t.x - 7, t.y - 7, t.w + 14, t.h + 14)}border:5px solid var(--tone);border-radius:16px;transform-origin:50% 50%;"></div>`);
      b.anim({ ...pop(ctx, hid, shift(beats[i], 0.08), 0.94), dur: 0.45, ease: "power3.out" });
      if (i < last) b.anim({ id: hid, from: { opacity: 1 }, to: { opacity: 0 }, at: shift(beats[i + 1], -0.2), dur: 0.35, ease: "power2.in" });
      const rid = b.id(`rip${i}`);
      const R = 70;
      const rx = t.x + t.w / 2;
      const ry = t.y + t.h / 2;
      fx.push(`<div id="${rid}" class="abs tone-accent" style="${box(rx - R, ry - R, R * 2, R * 2)}border-radius:50%;border:6px solid var(--tone);background:var(--hl);transform-origin:50% 50%;"></div>`);
      b.anim({ id: rid, from: { opacity: 0, scale: 0.15 }, to: { opacity: 0.8, scale: 0.45 }, at: beats[i], dur: 0.12, ease: "power1.out" });
      b.anim({ id: rid, from: { opacity: 0.8, scale: 0.45 }, to: { opacity: 0, scale: 1.5 }, at: shift(beats[i], 0.12), dur: 0.55, ease: "power2.out" });
    });
    valIds.forEach(([i, vid]) => b.anim(enter(ctx, vid, shift(beats[i], 0.35), { x: -12, rise: 0, dur: 0.5 })));
    btnIdx.forEach((i) => {
      const id = b.id(`btn${i}`);
      b.anim({ id, from: { scale: 1 }, to: { scale: 0.95 }, at: beats[i], dur: 0.1, ease: "power2.out" });
      b.anim({ id, from: { scale: 0.95 }, to: { scale: 1 }, at: shift(beats[i], 0.1), dur: 0.3, ease: "back.out(2)" });
    });
    // con trỏ: mũi ở (3,3) của div
    const start = { x: W * 0.62, y: H * 0.86 };
    const cur = b.id("cur");
    fx.push(`<div id="${cur}" class="abs" style="${box(start.x - 3, start.y - 3, 40, 48)}transform-origin:3px 3px;">${CURSOR_SVG}</div>`);
    b.anim(fade(ctx, cur, { t: 0.7 }, 0.4));
    let px0 = 0;
    let py0 = 0;
    steps.forEach((_, i) => {
      const t = target[i];
      const tx = t.x + Math.min(t.w * 0.5, 80) - start.x;
      const ty = t.y + t.h * 0.55 - start.y;
      const mDur = ctx.slow ? 0.95 : 0.75;
      b.anim(move(ctx, cur, shift(beats[i], -mDur - 0.05), { x: px0, y: py0 }, { x: tx, y: ty }, mDur));
      b.anim({ id: cur, from: { scale: 1 }, to: { scale: 0.82 }, at: beats[i], dur: 0.1, ease: "power2.out" });
      b.anim({ id: cur, from: { scale: 0.82 }, to: { scale: 1 }, at: shift(beats[i], 0.1), dur: 0.25, ease: "power2.out" });
      px0 = tx;
      py0 = ty;
    });

    // cửa sổ: khung ngoài (bóng, viền) > khung cắt (overflow) > lớp phóng to (cvs-cam)
    const zid = b.id("zoom");
    b.add(
      `<div id="${b.id("win")}" class="abs" style="${box(wx, wy, W, H)}border-radius:var(--radius);background:var(--card);border:2px solid var(--card-border);box-shadow:0 24px 60px rgba(0,0,0,.18);transform-origin:50% 40%;">` +
        `<div class="abs" style="${box(0, 0, W - 4, H - 4)}overflow:hidden;border-radius:var(--radius);">` +
        `<div id="${zid}" class="abs cvs-cam" style="${box(0, 0, W - 4, H - 4)}transform-origin:${px(ox)} ${px(oy)};">${inner.join("")}${fx.join("")}</div>` +
        `</div></div>`,
    );
    b.anim(enter(ctx, b.id("win"), { t: 0.3 }, { rise: 30, scale: 0.97 }));
    if (zoom) b.anim(move(ctx, zid, shift(beats[last], -1.0), { scale: 1 }, { scale: Z }, ctx.slow ? 1.3 : 1.05));

    // cột hướng dẫn
    const px1 = SAFE.x1 - panelW;
    const numS = 56;
    const tw = panelW - numS - 22;
    let size = 34;
    const totalH = (s: number) => steps.reduce((a, st) => a + Math.max(numS, blockHeight(st.text, s, tw)) + 30, -30);
    while (size > 28 && totalH(size) > maxH) size -= 2;
    let sy = top + Math.max(0, (maxH - totalH(size)) / 2);
    steps.forEach((st, i) => {
      const id = b.id(`st${i}`);
      const h = Math.max(numS, blockHeight(st.text, size, tw));
      b.text(String(i + 1));
      b.add(
        `<div id="${id}" class="abs tone-accent" style="${box(px1, sy, panelW, h)}">` +
          `<div class="abs d" style="left:0;top:0;width:${px(numS)};height:${px(numS)};border-radius:50%;background:var(--tone);color:var(--bg3);font-size:30px;line-height:${px(numS)};text-align:center;">${i + 1}</div>` +
          `<div class="abs b t" style="left:${px(numS + 22)};top:${px(Math.max(0, (numS - size * 1.35) / 2))};width:${px(tw)};font-size:${size}px;">${rich(b.text(st.text))}</div>` +
          `</div>`,
      );
      b.anim(enter(ctx, id, shift(beats[i], -0.25), { x: 30, rise: 0 }));
      if (i < last) b.anim(dim(ctx, id, shift(beats[i + 1], -0.25), 0.4));
      sy += h + 30;
    });
    return b.done();
  },
};
