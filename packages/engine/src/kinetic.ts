// Chữ chuyển động (kinetic typography): tách khối chữ theo TỪ (khoảng trắng – không bao giờ tách chữ cái, giữ nguyên
// dấu tiếng Việt chồng tầng), mỗi từ là inline-block có id riêng và rãnh chuyển động lệch nhịp. Từ nhấn **…** được gom
// thành cụm để quét dạ quang (highlight-sweep) hoặc vẽ gạch chân (underline-draw).

import { shift } from "./motion";
import type { Anim, AnimProps, TimeRef } from "./spec";
import { rich } from "./text";
import type { SpecBuilder } from "./templates/common";

export type KineticPreset = "word-rise" | "word-fade" | "mask-rise" | "highlight-sweep" | "underline-draw" | "scale-pop";
export type KineticMark = "highlight-sweep" | "underline-draw";

export type KineticOpts = {
  /** Tên phần tử (id = b.id(name); từ thứ i: name-w{i}). */
  name: string;
  text: string;
  /** Lớp của khối, ví dụ "abs d t". */
  cls: string;
  /** style nội tuyến của khối (vị trí, cỡ chữ…). */
  style: string;
  /** Cỡ chữ px (đổi em → px cho độ trượt). */
  size: number;
  /** line-height (mặc định 1,12 cho .d); khác 1,12 → đặt vào style của khối. */
  lh?: number;
  preset: KineticPreset;
  /** Hiệu ứng cho từ nhấn **…**; mặc định theo preset (highlight-sweep/underline-draw) hoặc không có. */
  mark?: KineticMark;
  at: TimeRef;
  /** Tổng thời gian lộ chữ (s), mặc định 1,2. */
  total?: number;
  /** Mốc kết thúc lộ chữ: dùng khi cùng câu (cue) với at – rải từ theo f; khác câu → dùng total. */
  until?: TimeRef;
};

/**
 * Hiệu ứng từ nhấn hợp phong cách: theme có mark nền (bút dạ bang-trang, viên phang-tuoi-sang – xem markCss trong
 * packages/themes/src/css.ts) → quét nền đúng kiểu mark của theme; theme mark chỉ đổi màu chữ → vẽ gạch chân accent.
 */
const MARK_BG_THEMES = new Set(["bang-trang", "phang-tuoi-sang"]);
export const themeMark = (themeId: string): KineticMark => (MARK_BG_THEMES.has(themeId) ? "highlight-sweep" : "underline-draw");

/** line-height cho khối chữ: gạch chân nằm dưới dấu nặng cần thêm khoảng giữa các dòng (1,24 thay 1,12). */
export const kineticLh = (text: string, mark: KineticMark | undefined): number => (mark === "underline-draw" && /\*\*.+?\*\*/.test(text) ? 1.24 : 1.12);

export type KineticWord = { text: string; html: string; group: number };
export type KineticResult = { id: string; wordIds: string[]; anims: Anim[]; reveal: number };

/** Tách chữ (NFC) thành từ; từ thuộc cụm nhấn có group ≥ 0 (cụm ≤ 3 từ để không ngắt dòng giữa cụm). */
export function kineticWords(text: string): KineticWord[] {
  const s = text.normalize("NFC");
  // đánh dấu từng ký tự có nằm trong **…** (cùng quy tắc với rich())
  const chars: { c: string; mark: number }[] = [];
  let phrase = 0;
  for (const part of s.split(/(\*\*.+?\*\*)/)) {
    const m = part.match(/^\*\*(.+?)\*\*$/);
    if (m) {
      for (const c of m[1]) chars.push({ c, mark: phrase });
      phrase++;
    } else for (const c of part) chars.push({ c, mark: -1 });
  }
  const words: { runs: { t: string; mark: number }[] }[] = [];
  let cur: { t: string; mark: number }[] = [];
  const flush = () => {
    if (cur.length) words.push({ runs: cur });
    cur = [];
  };
  for (const { c, mark } of chars) {
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    const last = cur[cur.length - 1];
    if (last && last.mark === mark) last.t += c;
    else cur.push({ t: c, mark });
  }
  flush();
  // gom cụm: các từ liên tiếp chạm cùng một cụm nhấn; chia nhỏ ≤ 3 từ
  let group = -1;
  let prevMark = -1;
  let inGroup = 0;
  return words.map((w) => {
    const mk = w.runs.find((r) => r.mark >= 0)?.mark ?? -1;
    if (mk < 0) prevMark = -1;
    else if (mk !== prevMark || inGroup >= 3) {
      group++;
      inGroup = 1;
      prevMark = mk;
    } else inGroup++;
    return {
      text: w.runs.map((r) => r.t).join(""),
      html: w.runs.map((r) => (r.mark >= 0 ? `<mark>${rich(r.t)}</mark>` : rich(r.t))).join(""),
      group: mk < 0 ? -1 : group,
    };
  });
}

const STAGGER: Record<"word-rise" | "word-fade" | "mask-rise" | "scale-pop", number> = { "word-rise": 0.08, "word-fade": 0.07, "mask-rise": 0.09, "scale-pop": 0.07 };
/** Mốc giây cứng chỉ được < 1 s (lint HyperFrames). */
const T_MAX = 0.98;
const capT = (r: TimeRef): TimeRef => ("t" in r ? { t: Math.min(T_MAX, Math.round(r.t * 1000) / 1000) } : r);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Thêm khối chữ chuyển động vào b (markup + CSS + chữ đầy đủ vào b.texts + rãnh chuyển động) và trả lại các anim đã thêm.
 * Không tự gọi b.anim() lần nữa với kết quả trả về.
 */
export function kineticText(b: SpecBuilder, o: KineticOpts): KineticResult {
  const id = b.id(o.name);
  const words = kineticWords(o.text);
  const n = words.length;
  const lh = o.lh ?? 1.12;
  const mark: KineticMark | undefined = o.mark ?? (o.preset === "highlight-sweep" || o.preset === "underline-draw" ? o.preset : undefined);
  const wp = o.preset === "highlight-sweep" || o.preset === "underline-draw" ? "word-fade" : o.preset;
  const slow = b.ctx.slow ? 1.2 : 1;
  const dur = r3({ "word-rise": 0.6, "word-fade": 0.5, "mask-rise": 0.75, "scale-pop": 0.55 }[wp] * slow);
  const ease = { "word-rise": "power3.out", "word-fade": "power2.out", "mask-rise": "power4.out", "scale-pop": "back.out(1.7)" }[wp];
  const em = (k: number) => r3(k * o.size);
  const from: AnimProps =
    wp === "word-rise"
      ? { opacity: 0, y: em(0.35), blur: 4 }
      : wp === "word-fade"
        ? { opacity: 0, blur: 3 }
        : wp === "mask-rise"
          ? { opacity: 0, y: em(lh + 0.7) }
          : { opacity: 0, scale: 0.6 };
  const to: AnimProps = Object.fromEntries(Object.keys(from).map((k) => [k, k === "opacity" || k === "scale" ? 1 : 0]));

  // nhịp lệch: vừa tổng thời gian lộ chữ; mốc giây cứng (tiêu đề) giữ từ cuối < 1 s
  const total = o.total ?? 1.2;
  let stagger = n > 1 ? Math.min(STAGGER[wp], Math.max(0.03, (total - dur * 0.5) / (n - 1))) : 0;
  if ("t" in o.at && n > 1 && o.at.t < T_MAX) stagger = Math.min(stagger, (T_MAX - o.at.t) / (n - 1));
  stagger = r3(stagger);
  const u = o.until;
  const sameCue = u && "cue" in u && "cue" in o.at && u.cue === o.at.cue && (u.d ?? 0) === (o.at.d ?? 0);
  const timeOf = (i: number): TimeRef => {
    if (sameCue && n > 1 && "cue" in o.at && "cue" in u!) {
      const f0 = o.at.f ?? 0;
      const f1 = Math.max(f0, (u.f ?? 0) - 0.02);
      return { ...o.at, f: r3(f0 + ((f1 - f0) * i) / (n - 1)) };
    }
    return capT(shift(o.at, i * stagger));
  };

  const wordIds = words.map((_, i) => `${id}-w${i}`);
  const anims: Anim[] = words.map((_, i) => ({ id: wordIds[i], from: { ...from }, to: { ...to }, at: timeOf(i), dur, ease }));

  // markup: từ cách nhau bằng khoảng trắng thật (ngắt dòng tự nhiên); cụm nhấn là inline-block không ngắt
  const wordHtml = (w: KineticWord, i: number) => {
    const span = `<span id="${wordIds[i]}" class="kt-w">${w.html}</span>`;
    return wp === "mask-rise" ? `<span class="kt-k">${span}</span>` : span;
  };
  const parts: string[] = [];
  let g = 0;
  for (let i = 0; i < n; ) {
    const w = words[i];
    if (w.group < 0 || !mark) {
      parts.push(wordHtml(w, i));
      i++;
      continue;
    }
    let j = i;
    while (j < n && words[j].group === w.group) j++;
    const inner = words.slice(i, j).map((ww, k) => wordHtml(ww, i + k)).join(" ");
    const gid = `${id}-m${g}`;
    // bắt đầu khi từ nhấn cuối đã lộ gần hết; mốc giây cứng bị chặn < 1 s → kéo dài tween từ mốc chặn (ease inOut nên
    // vạch vẫn đi sau chữ) để vẫn kết thúc đúng lúc dự kiến
    const want = shift(anims[j - 1].at, r3(dur * 0.45));
    const at = capT(want);
    const late = "t" in want && "t" in at ? r3(Math.max(0, want.t - at.t)) : 0;
    const mDur = (d: number) => r3(d * slow + late);
    const mEase = late > 0 ? "power3.inOut" : "power2.inOut";
    if (mark === "highlight-sweep") {
      // vạch là <mark> rỗng → mang đúng nền/bo góc của mark theo theme; chữ bên trong bỏ nền
      parts.push(`<span class="kt-mk"><mark id="${gid}" class="kt-hl"></mark>${inner}</span>`);
      anims.push({ id: gid, from: { scaleX: 0 }, to: { scaleX: 1 }, at, dur: mDur(0.55), ease: mEase });
    } else {
      // gạch chân là vạch nở scaleX từ trái (không dùng dash: pathLength + non-scaling-stroke vẽ đứt đoạn trong Chromium)
      parts.push(`<span class="kt-mk">${inner}<span id="${gid}" class="kt-ul"></span></span>`);
      anims.push({ id: gid, from: { scaleX: 0 }, to: { scaleX: 1 }, at, dur: mDur(0.6), ease: late > 0 ? mEase : "power2.out" });
    }
    g++;
    i = j;
  }

  b.css.push(
    [
      // scale-pop: nở từ mép trái (vượt đà back.out chỉ sang phải, không lấn mép trái vùng an toàn)
      `#${id} .kt-w{display:inline-block;${wp === "scale-pop" ? "transform-origin:0% 70%;" : ""}}`,
      // mặt nạ: clip-path chừa ≥ 0,35em trên/dưới cho dấu chồng tầng; không đổi bố cục/đường cơ sở như overflow:hidden
      `#${id} .kt-k{display:inline-block;clip-path:inset(-0.35em -0.3em -0.35em -0.3em);}`,
      // vạch nằm gọn trong hộp cụm (không tràn ngang → QA "clipped"); lề quanh chữ là padding của cụm
      `#${id} .kt-mk{display:inline-block;position:relative;isolation:isolate;${mark === "highlight-sweep" ? "padding:0 0.1em;" : ""}}`,
      `#${id} .kt-mk mark.kt-hl{position:absolute;inset:0;padding:0;z-index:-1;transform-origin:0% 50%;}`,
      mark === "highlight-sweep" ? `#${id} .kt-mk mark:not(.kt-hl){background:none;padding:0;}` : "",
      // nằm dưới dấu nặng (ộ, ự…) và trên dấu của dòng sau
      `#${id} .kt-ul{position:absolute;left:0;right:0;bottom:-${r3(0.15 - (lh - 1.12) / 2)}em;height:${Math.max(4, Math.round(o.size * 0.065))}px;border-radius:999px;background:var(--tone, var(--accent));transform-origin:0% 50%;}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  b.add(`<div id="${id}" class="${o.cls}" style="${o.style}${lh !== 1.12 ? `line-height:${lh};` : ""}">${parts.join(" ")}</div>`);
  b.text(o.text);
  b.anim(...anims);
  const last = Math.max(0, n - 1) * stagger + dur;
  return { id, wordIds, anims, reveal: r3(last) };
}
