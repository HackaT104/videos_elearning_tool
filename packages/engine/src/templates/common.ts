import type { Theme, Tone } from "@cvs/themes";
import { enter, type MotionCtx } from "../motion";
import type { Anim, CountAnim, SceneSpec, TimeRef } from "../spec";
import { esc, fitSize, rich, blockHeight } from "../text";

export type Beat = { cue: number; f?: number };

export type TemplateCtx = MotionCtx & {
  /** Tiền tố id = id cảnh, ví dụ "s3". */
  p: string;
  sentences: string[];
  sceneTitle: string;
};

export type JsonSchema = Record<string, unknown>;

export type TemplateDef<P = any> = {
  id: string;
  label: string;
  /** Mô tả cho LLM: dùng khi nào. */
  when: string;
  schema: JsonSchema;
  example: P;
  build(params: P, ctx: TemplateCtx): Omit<SceneSpec, "template">;
};

/** Vùng an toàn: x 96–1824, y 54–1026. */
export const SAFE = { x0: 96, x1: 1824, y0: 54, y1: 1026, w: 1728, h: 972 };

export class SpecBuilder {
  html: string[] = [];
  css: string[] = [];
  anims: Anim[] = [];
  counts: CountAnim[] = [];
  texts: string[] = [];
  assumptions: string[] = [];
  constructor(public ctx: TemplateCtx) {}
  id(name: string) {
    return `${this.ctx.p}-${name}`;
  }
  add(html: string) {
    this.html.push(html);
    return this;
  }
  text(s: string | undefined) {
    if (s) this.texts.push(s);
    return s ?? "";
  }
  anim(...a: Anim[]) {
    this.anims.push(...a);
    return this;
  }
  count(...c: CountAnim[]) {
    this.counts.push(...c);
    return this;
  }
  assume(s: string) {
    this.assumptions.push(s);
  }
  done(): Omit<SceneSpec, "template"> {
    return { html: this.html.join("\n"), css: this.css.join("\n"), anims: this.anims, counts: this.counts, texts: this.texts, assumptions: this.assumptions };
  }
}

export const px = (n: number) => `${Math.round(n)}px`;

export function box(x: number, y: number, w: number, h?: number) {
  return `left:${px(x)};top:${px(y)};width:${px(w)};${h !== undefined ? `height:${px(h)};` : ""}`;
}

/** Mốc mặc định: phần tử thứ i trải đều trên các câu. */
export function beatOf(b: Beat | undefined, i: number, count: number, nSent: number, f = 0.05): TimeRef {
  if (b && Number.isFinite(b.cue)) return { cue: Math.max(0, Math.min(nSent - 1, Math.round(b.cue))), f: b.f ?? f };
  if (nSent <= 0) return { cue: 0, f: 0 };
  if (count <= 1) return { cue: 0, f };
  // trải i trên nSent câu: phần tử đầu ở câu đầu, phần tử cuối ở câu cuối
  const pos = (i * (nSent - 1)) / Math.max(1, count - 1);
  const cue = Math.floor(pos);
  return { cue, f: Math.min(0.85, f + (pos - cue) * 0.9) };
}

export function toneClass(t: Tone | undefined) {
  return `tone-${t ?? "accent"}`;
}

export type Header = { kicker?: string; title?: string };

/** Tiêu đề cảnh ở trên (kicker + title). Trả về y bắt đầu vùng nội dung. */
export function header(b: SpecBuilder, h: Header, at: TimeRef = { t: 0.25 }): number {
  let y = 92;
  if (h.kicker) {
    b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(SAFE.x0, y, SAFE.w)}">${esc(b.text(h.kicker))}</div>`);
    b.anim(enter(b.ctx, b.id("kicker"), at, { rise: 14, blur: 4 }));
    y += 52;
  }
  if (h.title) {
    const size = fitSize(h.title, SAFE.w, 64, { maxLines: 2, kind: "display", min: 40 });
    b.add(`<div id="${b.id("title")}" class="abs d t" style="${box(SAFE.x0, y, SAFE.w)}font-size:${size}px;">${rich(b.text(h.title))}</div>`);
    b.anim(enter(b.ctx, b.id("title"), "t" in at ? { t: at.t + 0.12 } : at, { rise: 20 }));
    y += blockHeight(h.title, size, SAFE.w, "display") + 48;
  }
  return y;
}

export type Theme_ = Theme;
