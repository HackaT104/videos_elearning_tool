// Chữ chuyển động (kinetic typography): khối chữ được tách lúc build theo TỪ (khoảng trắng), theo GRAPHEME
// (Intl.Segmenter trên chuỗi NFC – "ệ", "ữ" luôn nguyên một ký tự, từ bọc nowrap nên ngắt dòng không đổi), theo CÂU, hoặc
// giữ nguyên KHỐI. Mỗi phần có id riêng và rãnh chuyển động chỉ dùng AnimProps (opacity/x/y/scale/blur/dash/wipe) → HyperFrames
// (GSAP fromTo) và Remotion (interpolate) giống hệt nhau. Từ nhấn **…** được gom thành cụm để quét dạ quang, gạch chân hoặc
// khoanh tròn.

import { viPad, type Theme } from "@cvs/themes";
import { dim, shift, undim } from "./motion";
import type { Anim, AnimProps, TimeRef } from "./spec";
import { rich } from "./text";
import type { SpecBuilder } from "./templates/common";

export type KineticPreset =
  | "word-rise"
  | "word-fade"
  | "mask-rise"
  | "highlight-sweep"
  | "underline-draw"
  | "scale-pop"
  | "char-soft-rise"
  | "focus-pull"
  | "typewriter"
  | "word-swap"
  | "block-reveal"
  | "tracking-in"
  | "wipe-reveal"
  | "circle-annotate"
  | "odometer"
  | "reading-focus";
export type KineticMark = "highlight-sweep" | "underline-draw" | "circle-annotate";

/** Danh sách kiểu chữ chuyển động (cho giao diện chọn và cho AI). */
export const KINETIC_PRESETS: { id: KineticPreset; label: string; when: string }[] = [
  { id: "word-rise", label: "Từng từ trồi lên", when: "Mặc định, mọi câu ngắn." },
  { id: "word-fade", label: "Từng từ hiện mờ", when: "Trích dẫn, câu dài, giọng trầm." },
  { id: "mask-rise", label: "Từng từ trồi qua mặt nạ", when: "Tiêu đề điện ảnh/biên tập." },
  { id: "scale-pop", label: "Từng từ bật nở", when: "Phong cách vui, học đường (không cho chủ đề nghiêm trọng)." },
  { id: "highlight-sweep", label: "Quét dạ quang từ nhấn", when: "Câu có **từ khoá** cần tô nền." },
  { id: "underline-draw", label: "Gạch chân từ nhấn", when: "Câu có **từ khoá**, phong cách trang nhã." },
  { id: "circle-annotate", label: "Khoanh tròn từ nhấn", when: "Câu có **từ khoá** cần chỉ ra như bút giảng viên." },
  { id: "char-soft-rise", label: "Từng chữ cái trồi mềm", when: "Tiêu đề rất ngắn (≤ 30 ký tự); dài hơn tự chuyển về từng từ." },
  { id: "tracking-in", label: "Chữ giãn rồi khép lại", when: "Tiêu đề ngắn, sang trọng (≤ 30 ký tự)." },
  { id: "typewriter", label: "Máy đánh chữ", when: "Định nghĩa, lệnh, trích văn bản; khoảng 20 ký tự/giây." },
  { id: "focus-pull", label: "Lấy nét cả dòng", when: "Câu chốt hiện cùng lúc, nhẹ nhàng." },
  { id: "block-reveal", label: "Thanh màu lộ chữ", when: "Tiêu đề chương, từ mở đầu mạnh." },
  { id: "wipe-reveal", label: "Lộ chữ trái sang phải", when: "Dòng chữ hiện theo nhịp đọc, gọn gàng." },
  { id: "word-swap", label: "Đổi từ", when: "“Không phải X mà là Y”: từ nhấn **Y** thay cho các từ thay thế (alt) lần lượt." },
  { id: "odometer", label: "Số cuộn", when: "Câu có con số (năm, %, số lượng): từng chữ số cuộn tới giá trị." },
  { id: "reading-focus", label: "Nhấn câu đang đọc", when: "Nhiều câu/dòng: câu đang đọc sáng, câu khác mờ." },
];

export type KineticOpts = {
  /** Tên phần tử (id = b.id(name); phần thứ i: name-w{i} theo từ, name-c{i} theo chữ cái, name-r{i} theo câu, name-in cả khối). */
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
  /** Hiệu ứng cho từ nhấn **…**; mặc định theo preset (highlight-sweep/underline-draw/circle-annotate) hoặc không có. */
  mark?: KineticMark;
  at: TimeRef;
  /** Tổng thời gian lộ chữ (s), mặc định 1,2 (typewriter: số ký tự / 20). */
  total?: number;
  /** Mốc kết thúc lộ chữ: dùng khi cùng câu (cue) với at – rải từ theo f; khác câu → dùng total. word-swap: mốc đổi từ cuối. */
  until?: TimeRef;
  /** word-swap: các từ hiện trước, lần lượt bị thay; từ cuối cùng là cụm **…** (hoặc từ cuối) của text. */
  alternates?: string[];
  /** reading-focus: lúc khối hiện mờ 0,35 (mặc định = at, lúc câu đầu sáng). */
  dimFrom?: TimeRef;
  /** reading-focus: lúc câu cuối của khối lùi về 0,55 (câu/dòng kế tiếp được đọc). */
  next?: TimeRef;
};

/**
 * Hiệu ứng từ nhấn hợp phong cách: theme có mark nền (bút dạ bang-trang, viên phang-tuoi-sang – xem markCss trong
 * packages/themes/src/css.ts) → quét nền đúng kiểu mark của theme; theme mark chỉ đổi màu chữ → vẽ gạch chân accent.
 */
const MARK_BG_THEMES = new Set(["bang-trang", "phang-tuoi-sang"]);
export const themeMark = (themeId: string): KineticMark => (MARK_BG_THEMES.has(themeId) ? "highlight-sweep" : "underline-draw");

/** line-height cho khối chữ: gạch chân/vòng khoanh quanh dấu cần thêm khoảng giữa các dòng (1,24 thay 1,12). */
export const kineticLh = (text: string, mark: KineticMark | undefined): number => ((mark === "underline-draw" || mark === "circle-annotate") && /\*\*.+?\*\*/.test(text) ? 1.24 : 1.12);

/** Đệm mặt nạ (em) trên/dưới cho dấu chồng tầng theo phông tiêu đề: max(0,35, viPad + 0,15). */
export const kineticPad = (theme: Theme): number => Math.max(0.35, Math.round((viPad(theme.fonts.display) + 0.15) * 100) / 100);

const SEG = new Intl.Segmenter("vi", { granularity: "grapheme" });
/** Tách grapheme trên chuỗi NFC (không bao giờ tách dấu khỏi chữ cái). */
export const graphemes = (s: string): string[] => [...SEG.segment(s.normalize("NFC"))].map((x) => x.segment);

export type KineticWord = { text: string; html: string; group: number; runs: { t: string; mark: boolean }[]; phrase: number };
export type KineticResult = {
  id: string;
  /** id các phần có rãnh vào: từ (-w), chữ cái (-c), câu (-r) hoặc cả khối (-in). */
  wordIds: string[];
  anims: Anim[];
  reveal: number;
};

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
      runs: w.runs.map((r) => ({ t: r.t, mark: r.mark >= 0 })),
      phrase: mk,
    };
  });
}

type WordPreset = "word-rise" | "word-fade" | "mask-rise" | "scale-pop";
const STAGGER: Record<WordPreset, number> = { "word-rise": 0.08, "word-fade": 0.07, "mask-rise": 0.09, "scale-pop": 0.07 };
const MARKS = new Set<KineticPreset>(["highlight-sweep", "underline-draw", "circle-annotate"]);
const GRAPHEME = new Set<KineticPreset>(["char-soft-rise", "typewriter", "tracking-in"]);
const BLOCK = new Set<KineticPreset>(["focus-pull", "block-reveal", "wipe-reveal"]);
/** Chữ cái tách riêng chỉ cho tiêu đề ngắn. */
const MAX_GRAPHEMES = 30;
/** Mốc giây cứng chỉ được < 1 s (lint HyperFrames). */
const T_MAX = 0.98;
const capT = (r: TimeRef): TimeRef => ("t" in r ? { t: Math.min(T_MAX, Math.round(r.t * 1000) / 1000) } : r);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Mốc sau ref d giây; giây cứng ≥ 1 s bị cấm → đổi sang mốc câu 0 (cue 0 ≥ 0 nên chỉ có thể trễ hơn, không đảo thứ tự). */
const later = (ref: TimeRef, d: number): TimeRef => {
  const s = shift(ref, r3(d));
  return "t" in s && s.t >= T_MAX ? { cue: 0, f: 0, d: r3(s.t) } : "t" in s ? { t: r3(s.t) } : s;
};
const SENT_END = /[.!?…:;]["”’)»]*$/;

/**
 * Thêm khối chữ chuyển động vào b (markup + CSS + chữ đầy đủ vào b.texts + rãnh chuyển động) và trả lại các anim đã thêm.
 * Không tự gọi b.anim() lần nữa với kết quả trả về.
 */
export function kineticText(b: SpecBuilder, o: KineticOpts): KineticResult {
  const id = b.id(o.name);
  const words = kineticWords(o.text);
  const n = words.length;
  const lh = o.lh ?? 1.12;
  const slow = b.ctx.slow ? 1.2 : 1;
  const em = (k: number) => r3(k * o.size);
  const pad = kineticPad(b.ctx.theme);
  const nG = words.reduce((a, w) => a + graphemes(w.text).length, 0);
  const alts = (o.alternates ?? []).map((s) => s.trim()).filter(Boolean);

  // preset thực dùng: chữ cái chỉ cho tiêu đề ngắn; word-swap cần từ thay thế; odometer cần chữ số
  let p: KineticPreset = o.preset;
  if (GRAPHEME.has(p) && p !== "typewriter" && nG > MAX_GRAPHEMES) p = p === "char-soft-rise" ? "word-rise" : "focus-pull";
  if (p === "word-swap" && !alts.length) p = "word-rise";
  if (p === "odometer" && !/\d/.test(o.text)) p = "word-fade";
  const mark: KineticMark | undefined = o.mark ?? (MARKS.has(p) ? (p as KineticMark) : undefined);
  const wp: WordPreset = p === "word-rise" || p === "word-fade" || p === "mask-rise" || p === "scale-pop" ? p : p === "word-swap" ? "word-rise" : "word-fade";

  const css: string[] = [];
  const anims: Anim[] = [];
  const unitIds: string[] = [];
  let odo = 0;
  const u = o.until;
  const sameCue = !!u && "cue" in u && "cue" in o.at && u.cue === o.at.cue && (u.d ?? 0) === (o.at.d ?? 0);
  /** Rải count phần: nhịp ≤ maxStep vừa total; cùng câu với until → rải theo f; mốc giây cứng giữ phần cuối < 1 s. */
  const spread = (count: number, maxStep: number, dur: number, total = o.total ?? 1.2, minStep = 0.03) => {
    let step = count > 1 ? Math.min(maxStep, Math.max(minStep, (total - dur * 0.5) / (count - 1))) : 0;
    if ("t" in o.at && count > 1 && o.at.t < T_MAX) step = Math.min(step, (T_MAX - o.at.t) / (count - 1));
    step = r3(step);
    const at = (i: number): TimeRef => {
      if (sameCue && count > 1 && "cue" in o.at && "cue" in u!) {
        const f0 = o.at.f ?? 0;
        const f1 = Math.max(f0, (u.f ?? 0) - 0.02);
        return { ...o.at, f: r3(f0 + ((f1 - f0) * i) / (count - 1)) };
      }
      return capT(shift(o.at, i * step));
    };
    return { step, at };
  };

  /** Mốc + thời lượng lộ của từ i (để vạch nhấn bắt đầu khi từ nhấn đã lộ gần hết). */
  let wordTime: (i: number) => { at: TimeRef; dur: number };
  /** Markup một từ (không kể cụm nhấn). */
  let wordHtml: (w: KineticWord, i: number) => string = (w) => w.html;
  let reveal = 0;

  // ---------- theo TỪ ----------
  const wordAnims = () => {
    const dur = r3({ "word-rise": 0.6, "word-fade": 0.5, "mask-rise": 0.75, "scale-pop": 0.55 }[wp] * slow);
    const ease = { "word-rise": "power3.out", "word-fade": "power2.out", "mask-rise": "power4.out", "scale-pop": "back.out(1.7)" }[wp];
    const from: AnimProps =
      wp === "word-rise" ? { opacity: 0, y: em(0.35), blur: 4 } : wp === "word-fade" ? { opacity: 0, blur: 3 } : wp === "mask-rise" ? { opacity: 0, y: em(lh + 0.7) } : { opacity: 0, scale: 0.6 };
    const to: AnimProps = Object.fromEntries(Object.keys(from).map((k) => [k, k === "opacity" || k === "scale" ? 1 : 0]));
    const t = spread(n, STAGGER[wp], dur);
    return { dur, ease, from, to, t };
  };

  if (GRAPHEME.has(p)) {
    // ---------- theo CHỮ CÁI (grapheme) ----------
    const tw = p === "typewriter";
    // typewriter: khoảng trắng giữa từ cũng là một nhịp gõ
    const steps = nG + (tw ? Math.max(0, n - 1) : 0);
    const dur = r3((p === "char-soft-rise" ? 0.5 : p === "tracking-in" ? 0.8 : 0.03) * (tw ? 1 : slow));
    const ease = p === "char-soft-rise" ? "expo.out" : p === "tracking-in" ? "power3.out" : "none";
    const t = tw ? spread(steps, 0.05, 0, o.total ?? steps * 0.05) : p === "char-soft-rise" ? spread(steps, 0.03, dur, 1.2, 0.015) : { step: 0, at: () => capT(o.at) };
    const mid = (nG - 1) / 2;
    const k = em(0.06);
    let gi = 0;
    let si = 0;
    const lastOf: { at: TimeRef; dur: number }[] = [];
    const ghtml = words.map((w) => {
      const html = w.runs
        .map((r) => {
          const inner = graphemes(r.t)
            .map((g) => {
              const cid = `${id}-c${gi}`;
              unitIds.push(cid);
              const from: AnimProps =
                p === "char-soft-rise" ? { opacity: 0, y: Math.min(16, em(0.18)), blur: 8 } : p === "tracking-in" ? { opacity: 0, x: r3((gi - mid) * k), blur: 4 } : { opacity: 0 };
              const to: AnimProps = Object.fromEntries(Object.keys(from).map((key) => [key, key === "opacity" ? 1 : 0]));
              anims.push({ id: cid, from, to, at: t.at(si), dur, ease });
              gi++;
              si++;
              return `<span id="${cid}" class="kt-c">${rich(g)}</span>`;
            })
            .join("");
          return r.mark ? `<mark>${inner}</mark>` : inner;
        })
        .join("");
      lastOf.push({ at: anims[anims.length - 1].at, dur });
      if (tw) si++;
      return `<span class="kt-wn">${html}</span>`;
    });
    wordHtml = (_, i) => ghtml[i];
    wordTime = (i) => lastOf[i];
    reveal = r3(t.step * Math.max(0, steps - 1) + dur);
    css.push(`#${id} .kt-wn{display:inline-block;white-space:nowrap;}`, tw ? "" : `#${id} .kt-c{display:inline-block;}`);
    if (tw) {
      // con trỏ ở cuối khối: hiện khi gõ xong, nháy 2 lần (tween hữu hạn) rồi tắt – khung cuối sạch
      const cid = `${id}-caret`;
      const end = later(t.at(steps - 1), dur);
      anims.push(
        { id: cid, from: { opacity: 0 }, to: { opacity: 1 }, at: end, dur: 0.05, ease: "none" },
        { id: cid, from: { opacity: 1 }, to: { opacity: 0 }, at: later(end, 0.45), dur: 0.08, ease: "none" },
        { id: cid, from: { opacity: 0 }, to: { opacity: 1 }, at: later(end, 0.9), dur: 0.08, ease: "none" },
        { id: cid, from: { opacity: 1 }, to: { opacity: 0 }, at: later(end, 1.35), dur: 0.08, ease: "none" },
      );
      css.push(`#${cid}{display:inline-block;width:0.07em;height:0.86em;margin-left:0.06em;vertical-align:-0.1em;border-radius:0.03em;background:var(--tone, var(--accent));}`);
    }
  } else if (BLOCK.has(p)) {
    // ---------- cả KHỐI ----------
    const iid = `${id}-in`;
    unitIds.push(iid);
    let showAt = o.at;
    let showDur = 0.8 * slow;
    if (p === "focus-pull") {
      anims.push({ id: iid, from: { opacity: 0, blur: 14, scale: 1.03 }, to: { opacity: 1, blur: 0, scale: 1 }, at: o.at, dur: r3(0.8 * slow), ease: "power2.out" });
      css.push(`#${iid}{display:inline-block;}`);
    } else if (p === "wipe-reveal") {
      // clip-path mặc định của wipe cắt đúng hộp phần tử → luật riêng (đọc cùng biến --cvs-wx mà GSAP/Remotion đặt) chừa
      // đệm trên/dưới cho dấu chồng tầng; không dùng padding vì hộp phồng ra bị QA tính là chồng dòng
      anims.push({ id: iid, from: { wipe: 0 }, to: { wipe: 1 }, at: o.at, dur: r3(0.8 * slow), ease: "power3.inOut" });
      css.push(`#${iid}{display:inline-block;clip-path:inset(-${pad}em calc((1 - var(--cvs-wx, 1)) * 100%) -${pad}em -0.12em) !important;}`);
    } else {
      // block-reveal: thanh A nở từ trái che chữ → chữ hiện ở giữa → thanh A tắt, thanh B (gốc phải) co lại để lộ chữ
      const a = `${id}-ba`;
      const bb = `${id}-bb`;
      const d1 = r3(0.4 * slow);
      const mid = later(o.at, d1);
      anims.push(
        { id: a, from: { scaleX: 0 }, to: { scaleX: 1 }, at: o.at, dur: d1, ease: "power3.in" },
        { id: iid, from: { opacity: 0 }, to: { opacity: 1 }, at: mid, dur: 0.01, ease: "none" },
        { id: a, from: { opacity: 1 }, to: { opacity: 0 }, at: mid, dur: 0.01, ease: "none" },
        { id: bb, from: { opacity: 0 }, to: { opacity: 1 }, at: mid, dur: 0.01, ease: "none" },
        { id: bb, from: { scaleX: 1 }, to: { scaleX: 0 }, at: mid, dur: r3(0.45 * slow), ease: "power3.out" },
      );
      showAt = mid;
      showDur = 0.45 * slow;
      css.push(
        `#${id} .kt-br{display:inline-block;position:relative;}`,
        // thanh phủ cả phần dấu vượt trên hộp dòng của phông
        `#${id} .kt-bar{position:absolute;left:-0.08em;right:-0.08em;top:-${r3(viPad(b.ctx.theme.fonts.display))}em;bottom:-0.04em;background:var(--tone, var(--accent));transform-origin:0% 50%;}`,
        `#${bb}{transform-origin:100% 50%;}`,
      );
    }
    wordTime = () => ({ at: showAt, dur: r3(showDur) });
    reveal = r3(p === "block-reveal" ? 0.4 * slow + 0.45 * slow : 0.8 * slow);
  } else if (p === "reading-focus") {
    // ---------- theo CÂU: câu đang đọc sáng, câu chưa đọc 0,35, câu đã đọc 0,55 ----------
    const segOf: number[] = [];
    let s = 0;
    words.forEach((w, i) => {
      segOf.push(s);
      if (SENT_END.test(w.text) && i < n - 1) s++;
    });
    const S = s + 1;
    const nS = b.ctx.sentences.length;
    const segAt = (k: number): TimeRef => (k === 0 ? o.at : "cue" in o.at && o.at.cue + k <= nS - 1 ? { cue: o.at.cue + k, f: o.at.f ?? 0.05 } : later(o.at, k * 2.2));
    const m = b.ctx;
    for (let k = 0; k < S; k++) {
      const rid = `${id}-r${k}`;
      unitIds.push(rid);
      // câu đầu: hiện mờ trước (dimFrom sớm hơn at) rồi sáng; không có dimFrom → hiện thẳng
      const appear = k === 0 ? (o.dimFrom && JSON.stringify(o.dimFrom) !== JSON.stringify(o.at) ? o.dimFrom : undefined) : (o.dimFrom ?? o.at);
      if (appear) {
        anims.push({ id: rid, from: { opacity: 0 }, to: { opacity: 0.35 }, at: appear, dur: 0.5, ease: "power2.out" });
        anims.push(undim(m, rid, segAt(k), 0.35));
      } else anims.push({ id: rid, from: { opacity: 0 }, to: { opacity: 1 }, at: o.at, dur: r3(0.6 * slow), ease: "power2.out" });
      if (k < S - 1) anims.push(dim(m, rid, segAt(k + 1), 0.55));
      else if (o.next) anims.push(dim(m, rid, o.next, 0.55));
    }
    wordTime = (i) => ({ at: segAt(segOf[i]), dur: r3(0.6 * slow) });
    reveal = r3(0.6 * slow);
    // markup: mỗi câu một span (cụm nhấn không vắt qua hai câu)
    const segHtml = (from: number, to: number) => partsOf(from, to).join(" ");
    const out: string[] = [];
    for (let k = 0, i = 0; k < S; k++) {
      let j = i;
      while (j < n && segOf[j] === k) j++;
      out.push(`<span id="${id}-r${k}" class="kt-r">${segHtml(i, j)}</span>`);
      i = j;
    }
    return finish(out.join(" "));
  } else {
    // ---------- theo TỪ (kể cả word-swap, odometer) ----------
    const { dur, ease, from, to, t } = wordAnims();
    const ids = words.map((_, i) => `${id}-w${i}`);
    wordTime = (i) => ({ at: t.at(i), dur });
    wordHtml = (w, i) => {
      const span = `<span id="${ids[i]}" class="kt-w">${p === "odometer" ? odoHtml(w, i) : w.html}</span>`;
      return wp === "mask-rise" ? `<span class="kt-k">${span}</span>` : span;
    };
    reveal = r3(Math.max(0, n - 1) * t.step + dur);
    // word-swap: cụm nhấn đầu tiên (hoặc từ cuối) là ô đổi từ
    let swapFrom = -1;
    let swapTo = -1;
    if (p === "word-swap") {
      swapFrom = words.findIndex((w) => w.phrase >= 0);
      if (swapFrom < 0) swapFrom = n - 1;
      swapTo = swapFrom + 1;
      while (swapTo < n && words[swapFrom].phrase >= 0 && words[swapTo].phrase === words[swapFrom].phrase) swapTo++;
    }
    for (let i = 0; i < n; i++) {
      if (i >= swapFrom && i < swapTo) continue;
      unitIds.push(ids[i]);
      anims.push({ id: ids[i], from: { ...from }, to: { ...to }, at: t.at(i), dur, ease });
    }
    css.push(
      // scale-pop: nở từ mép trái (vượt đà back.out chỉ sang phải, không lấn mép trái vùng an toàn)
      `#${id} .kt-w{display:inline-block;${wp === "scale-pop" ? "transform-origin:0% 70%;" : ""}}`,
      // mặt nạ: clip-path chừa đệm trên/dưới cho dấu chồng tầng theo phông; không đổi bố cục/đường cơ sở như overflow:hidden
      wp === "mask-rise" ? `#${id} .kt-k{display:inline-block;clip-path:inset(-${pad}em -0.3em -${pad}em -0.3em);}` : "",
    );
    if (p === "word-swap") {
      const marked = words[swapFrom].phrase >= 0;
      const items = [...alts.map((a) => (marked ? `<mark>${rich(a)}</mark>` : rich(a))), words.slice(swapFrom, swapTo).map((w) => w.html).join(" ")];
      const xid = (k: number) => `${id}-x${k}`;
      const t0 = t.at(swapFrom);
      unitIds.push(xid(0));
      anims.push({ id: xid(0), from: { ...from }, to: { ...to }, at: t0, dur, ease });
      const K = items.length - 1;
      for (let k = 1; k <= K; k++) {
        const sAt = k === K && o.until ? o.until : later(t0, dur + 0.8 + (k - 1) * 1.3);
        anims.push(
          { id: xid(k - 1), from: { opacity: 1, y: 0 }, to: { opacity: 0, y: -em(0.4) }, at: sAt, dur: r3(0.35 * slow), ease: "power2.in" },
          { id: xid(k), from: { opacity: 0, y: em(0.4) }, to: { opacity: 1, y: 0 }, at: later(sAt, 0.1), dur: r3(0.45 * slow), ease: "power3.out" },
          // từ cũ đã ẩn về lại chỗ (chữ ẩn lệch lên dòng trên bị QA tính là chồng chữ)
          { id: xid(k - 1), from: { y: -em(0.4) }, to: { y: 0 }, at: later(sAt, r3(0.35 * slow + 0.05)), dur: 0.01, ease: "none" },
        );
      }
      const center = /text-align:\s*center/.test(o.style);
      const cell = `<span class="kt-sw">${items.map((h, k) => `<span id="${xid(k)}" class="kt-sx">${h}</span>`).join("")}</span>`;
      const base = wordHtml;
      wordHtml = (w, i) => (i === swapFrom ? cell : i > swapFrom && i < swapTo ? "" : base(w, i));
      css.push(`#${id} .kt-sw{display:inline-grid;justify-items:${center ? "center" : "start"};}`, `#${id} .kt-sx{grid-area:1/1;white-space:nowrap;}`);
      reveal = Math.max(reveal, r3(K * 1.3 + dur + 0.8));
    }
  }

  /** odometer: mỗi chữ số là ô cao một dòng (clip-path, không đổi đường cơ sở); dải 0–9 vẽ bằng ::before (không phải nút chữ). */
  function odoHtml(w: KineticWord, i: number): string {
    const H = r3(lh * o.size);
    const at = wordTime(i).at;
    const digits = [...w.text].filter((c) => /\d/.test(c)).length;
    let r = digits;
    return w.runs
      .map((run) => {
        const inner = [...run.t]
          .map((c) => {
            if (!/\d/.test(c)) return rich(c);
            r--;
            const did = `${id}-d${odo++}`;
            const d = Number(c);
            // phải → trái: chữ số hàng đơn vị lăn trước
            if (d > 0) anims.push({ id: did, from: { y: 0 }, to: { y: -r3(d * H) }, at: later(at, 0.1 + r * 0.06), dur: r3(1.2 * slow), ease: "power3.out" });
            return `<span class="kt-dg"><span class="kt-dp">${c}</span><span id="${did}" class="kt-ds"></span></span>`;
          })
          .join("");
        return run.mark ? `<mark>${inner}</mark>` : inner;
      })
      .join("");
  }
  if (p === "odometer") {
    const H = r3(lh * o.size);
    css.push(
      `#${id} .kt-dg{display:inline-block;position:relative;height:${H}px;line-height:${H}px;clip-path:inset(${r3(Math.max(0, (lh - 0.95) / 2))}em -0.1em);font-variant-numeric:tabular-nums;}`,
      `#${id} .kt-dp{color:transparent;-webkit-text-stroke:0;}`,
      `#${id} .kt-ds{position:absolute;left:0;top:0;width:0;height:0;}`,
      `#${id} .kt-ds::before{content:"0\\A 1\\A 2\\A 3\\A 4\\A 5\\A 6\\A 7\\A 8\\A 9";position:absolute;left:0;top:0;white-space:pre;}`,
      `#${id} .kt-w{font-variant-numeric:tabular-nums;}`,
    );
    reveal = r3(reveal + 1.2 * slow);
  }

  /** Markup các từ [from, to): từ thường cách nhau bằng khoảng trắng thật; cụm nhấn là inline-block không ngắt (kèm vạch nhấn). */
  function partsOf(from: number, to: number): string[] {
    const parts: string[] = [];
    for (let i = from; i < to; ) {
      const w = words[i];
      if (w.group < 0 || !mark || (p === "word-swap" && w.phrase === words.find((x) => x.phrase >= 0)?.phrase)) {
        const h = wordHtml(w, i);
        if (h) parts.push(h);
        i++;
        continue;
      }
      let j = i;
      while (j < to && words[j].group === w.group) j++;
      const inner = words
        .slice(i, j)
        .map((ww, k) => wordHtml(ww, i + k))
        .join(" ");
      const gid = `${id}-m${w.group}`;
      // bắt đầu khi từ nhấn cuối đã lộ gần hết; mốc giây cứng bị chặn < 1 s → kéo dài tween từ mốc chặn (ease inOut nên
      // vạch vẫn đi sau chữ) để vẫn kết thúc đúng lúc dự kiến
      const last = wordTime(j - 1);
      const want = shift(last.at, r3(last.dur * 0.45));
      const at = capT(want);
      const late = "t" in want && "t" in at ? r3(Math.max(0, want.t - at.t)) : 0;
      const mDur = (d: number) => r3(d * slow + late);
      const mEase = late > 0 ? "power3.inOut" : "power2.inOut";
      if (mark === "highlight-sweep") {
        // vạch là <mark> rỗng → mang đúng nền/bo góc của mark theo theme; chữ bên trong bỏ nền
        parts.push(`<span class="kt-mk"><mark id="${gid}" class="kt-hl"></mark>${inner}</span>`);
        anims.push({ id: gid, from: { scaleX: 0 }, to: { scaleX: 1 }, at, dur: mDur(0.55), ease: mEase });
      } else if (mark === "underline-draw") {
        // gạch chân là vạch nở scaleX từ trái (không dùng dash: pathLength + non-scaling-stroke vẽ đứt đoạn trong Chromium)
        parts.push(`<span class="kt-mk">${inner}<span id="${gid}" class="kt-ul"></span></span>`);
        anims.push({ id: gid, from: { scaleX: 0 }, to: { scaleX: 1 }, at, dur: mDur(0.6), ease: late > 0 ? mEase : "power2.out" });
      } else {
        // khoanh tròn: <ellipse> theo % hộp cụm, nét px thật (không viewBox/preserveAspectRatio/non-scaling-stroke → Chromium
        // vẽ đủ nét dash); vòng thứ hai hơi lớn hơn vẽ tiếp 1/7 vòng như nét bút vượt điểm đầu
        // (pathLength 7 + dash 1 → 0: GSAP làm tròn giá trị đầu lẻ như 0,14 về 0 khi immediateRender)
        parts.push(
          `<span class="kt-mk kt-ci">${inner}<svg class="kt-cs" aria-hidden="true"><ellipse id="${gid}" class="draw" pathLength="1" cx="50%" cy="50%" rx="48.5%" ry="47%"/><ellipse id="${gid}t" class="kt-ct" pathLength="7" cx="50%" cy="50%" rx="49.5%" ry="49.5%"/></svg></span>`,
        );
        const d = mDur(0.6);
        anims.push(
          { id: gid, from: { dash: 1 }, to: { dash: 0 }, at, dur: d, ease: mEase },
          { id: `${gid}t`, from: { dash: 1 }, to: { dash: 0 }, at: later(at, d), dur: 0.2, ease: "power1.out" },
        );
      }
      i = j;
    }
    return parts;
  }

  function finish(inner: string): KineticResult {
    let body = inner;
    if (p === "focus-pull" || p === "wipe-reveal") body = `<span id="${id}-in" class="kt-in">${inner}</span>`;
    else if (p === "block-reveal") body = `<span class="kt-br"><span id="${id}-in" class="kt-in">${inner}</span><span id="${id}-ba" class="kt-bar"></span><span id="${id}-bb" class="kt-bar"></span></span>`;
    else if (p === "typewriter") body = `${inner}<span id="${id}-caret" aria-hidden="true"></span>`;
    const sw = Math.max(3, Math.round(o.size * 0.045));
    // vòng khoanh: chừa phần dấu chồng tầng của phông ở trên; đầu nét vuông (đầu tròn để lại chấm khi nét còn ẩn)
    const ciTop = r3(Math.max(0.24, viPad(b.ctx.theme.fonts.display) + 0.06));
    b.css.push(
      [
        ...css,
        // vạch nằm gọn trong hộp cụm (không tràn ngang → QA "clipped"); lề quanh chữ là padding của cụm
        `#${id} .kt-mk{display:inline-block;position:relative;isolation:isolate;${mark === "highlight-sweep" ? "padding:0 0.1em;" : mark === "circle-annotate" ? "padding:0 0.3em;" : ""}}`,
        `#${id} .kt-mk mark.kt-hl{position:absolute;inset:0;padding:0;z-index:-1;transform-origin:0% 50%;}`,
        mark === "highlight-sweep" ? `#${id} .kt-mk mark:not(.kt-hl){background:none;padding:0;}` : "",
        // nằm dưới dấu nặng (ộ, ự…) và trên dấu của dòng sau
        mark === "underline-draw"
          ? `#${id} .kt-ul{position:absolute;left:0;right:0;bottom:-${r3(0.15 - (lh - 1.12) / 2)}em;height:${Math.max(4, Math.round(o.size * 0.065))}px;border-radius:999px;background:var(--tone, var(--accent));transform-origin:0% 50%;}`
          : "",
        // vòng khoanh: trên chừa phần dấu chồng tầng của phông; xoay 180° để nét bắt đầu bên trái
        mark === "circle-annotate"
          ? `#${id} .kt-cs{position:absolute;left:0;width:100%;top:-${ciTop}em;height:calc(100% + ${r3(ciTop + 0.16)}em);overflow:visible;transform:rotate(180deg);pointer-events:none;}\n#${id} .kt-cs ellipse{fill:none;stroke:var(--tone, var(--accent));stroke-width:${sw}px;}\n#${id} .kt-ct{stroke-dasharray:1 14;}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    b.add(`<div id="${id}" class="${o.cls}" style="${o.style}${lh !== 1.12 ? `line-height:${lh};` : ""}">${body}</div>`);
    b.text(o.text);
    for (const a of alts) if (p === "word-swap") b.text(a);
    b.anim(...anims);
    return { id, wordIds: unitIds, anims, reveal };
  }

  return finish(partsOf(0, n).join(" "));
}
