// CSS dùng chung cho cả hai bộ dựng: biến theme (:root), lớp thành phần (thẻ, nhãn, chữ), nền.

import { fontStack } from "./fonts";
import type { Theme } from "./tokens";

const hexA = (hex: string, a: number) => {
  if (!hex.startsWith("#")) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function themeVars(theme: Theme): Record<string, string> {
  const c = theme.colors;
  const generic = theme.fonts.display.family === "Lora" ? "serif" : theme.fonts.display.family === "Patrick Hand" ? "cursive" : "sans-serif";
  return {
    "--bg": c.bg,
    "--bg2": c.bg2,
    "--bg3": c.bg3,
    "--grid": c.grid,
    "--ink": c.ink,
    "--ink-soft": c.inkSoft,
    "--accent": c.accent,
    "--alt": c.alt,
    "--money": c.money,
    "--warn": c.warn,
    "--card": c.card,
    "--card-border": c.cardBorder,
    "--line": c.line,
    "--hl": c.highlight,
    "--font-display": fontStack(theme.fonts.display, generic),
    "--font-body": fontStack(theme.fonts.body, theme.fonts.body.family === "Patrick Hand" ? "cursive" : "sans-serif"),
    "--w-display": String(theme.fonts.display.weight),
    "--w-body": String(theme.fonts.body.weight),
    "--w-bold": String(theme.fonts.bodyBold.weight),
    "--stroke": `${theme.stroke}px`,
    "--radius": `${theme.radius}px`,
    "--tone": c.accent,
  };
}

export function themeVarsCss(theme: Theme, selector = ":root"): string {
  return `${selector}{${Object.entries(themeVars(theme))
    .map(([k, v]) => `${k}:${v};`)
    .join("")}}`;
}

function cardCss(theme: Theme): string {
  const c = theme.colors;
  switch (theme.card) {
    case "glow":
      return `.card{background:${c.card};border:1.5px solid ${c.cardBorder};box-shadow:0 0 0 1px ${hexA(c.accent, 0.06)},0 18px 60px ${hexA("#000000", 0.35)},0 0 48px ${hexA(c.accent, 0.1)};}`;
    case "solid-shadow":
      return `.card{background:${c.card};border:4px solid ${c.ink};box-shadow:12px 12px 0 ${c.ink};}`;
    case "rule":
      return `.card{background:transparent;border:0;border-top:3px solid ${c.ink};border-radius:0 !important;padding-top:28px !important;}`;
    case "sketch":
      return `.card{background:${c.card};border:0;}.card::before{content:"";position:absolute;inset:0;border:4px solid ${c.ink};border-radius:var(--radius);filter:url(#cvs-sketch);pointer-events:none;}`;
    default:
      return `.card{background:${c.card};border:${theme.stroke}px solid ${c.cardBorder};}`;
  }
}

function markCss(theme: Theme): string {
  const c = theme.colors;
  switch (theme.id) {
    case "bang-trang":
      return `mark{background:linear-gradient(transparent 30%, ${c.highlight} 30%, ${c.highlight} 88%, transparent 88%);color:inherit;padding:0 .08em;}`;
    case "phang-tuoi-sang":
      return `mark{background:${c.highlight};color:${c.ink};padding:0 .18em;border-radius:.3em;}`;
    case "bien-tap-tap-chi":
      return `mark{background:none;color:${c.accent};}`;
    case "toi-dien-anh":
      return `mark{background:none;color:${c.accent};}`;
    default:
      return `mark{background:none;color:${c.accent};}`;
  }
}

function pillCss(theme: Theme): string {
  const c = theme.colors;
  if (theme.id === "phang-tuoi-sang")
    return `.pill{display:inline-block;padding:10px 26px;border-radius:999px;border:3px solid ${c.ink};background:var(--tone);color:#fff;font-weight:var(--w-bold);box-shadow:5px 5px 0 ${c.ink};}`;
  if (theme.id === "bien-tap-tap-chi") return `.pill{display:inline-block;padding:0;color:var(--tone);font-weight:var(--w-bold);letter-spacing:.12em;}`;
  if (theme.id === "bang-trang") return `.pill{display:inline-block;padding:4px 18px;color:var(--tone);border-bottom:4px solid var(--tone);}`;
  return `.pill{display:inline-block;padding:8px 20px;border-radius:999px;background:${hexA(theme.dark ? "#ffffff" : c.ink, 0.06)};color:var(--tone);font-weight:var(--w-bold);border:1.5px solid ${hexA(theme.dark ? "#ffffff" : c.ink, 0.12)};}`;
}

/** CSS thành phần dùng chung – mọi cảnh chỉ dùng các lớp/biến này. */
export function baseCss(theme: Theme): string {
  return [
    themeVarsCss(theme),
    `*,*::before,*::after{box-sizing:border-box;}`,
    `html,body{margin:0;padding:0;background:${theme.colors.bg};}`,
    `.cvs-scene{position:absolute;inset:0;overflow:hidden;font-family:var(--font-body);color:var(--ink);font-weight:var(--w-body);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}`,
    `.stage{position:absolute;inset:0;}`,
    `.abs{position:absolute;}`,
    `.d{font-family:var(--font-display);font-weight:var(--w-display);letter-spacing:${theme.id === "bien-tap-tap-chi" ? "-0.01em" : theme.id === "bang-trang" ? "0" : "-0.02em"};line-height:1.12;color:var(--ink);}`,
    `.b{font-family:var(--font-body);font-weight:var(--w-body);line-height:1.35;color:var(--ink);}`,
    `.bb{font-weight:var(--w-bold);}`,
    `.soft{color:var(--ink-soft);}`,
    `.tone{color:var(--tone);}`,
    `.kicker{font-family:var(--font-body);font-weight:var(--w-bold);font-size:30px;letter-spacing:${theme.kickerUpper ? ".14em" : ".02em"};${theme.kickerUpper ? "text-transform:uppercase;" : ""}color:var(--tone);}`,
    `.card{position:absolute;border-radius:var(--radius);padding:36px 40px;}`,
    cardCss(theme),
    pillCss(theme),
    markCss(theme),
    `sub{font-size:.62em;vertical-align:baseline;position:relative;top:.28em;line-height:0;}`,
    `sup{font-size:.62em;vertical-align:baseline;position:relative;top:-.5em;line-height:0;}`,
    `.icon{display:block;color:var(--tone);}`,
    `.icon svg{width:100%;height:100%;overflow:visible;}`,
    `.icon svg *{fill:none;stroke:currentColor;stroke-width:${theme.id === "bang-trang" ? 1.9 : theme.id === "phang-tuoi-sang" ? 1.8 : 1.6};stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;}`,
    theme.id === "bang-trang" ? `.icon svg,.sk{filter:url(#cvs-sketch);}.d{-webkit-text-stroke:.9px currentColor;}.b{-webkit-text-stroke:.45px currentColor;}` : "",
    `.line{stroke:var(--line);stroke-width:var(--stroke);fill:none;stroke-linecap:round;stroke-linejoin:round;}`,
    `.draw{stroke-dasharray:1;stroke-dashoffset:0;}`,
    `.src-line{position:absolute;left:96px;bottom:58px;max-width:1500px;font-family:var(--font-body);font-size:23px;line-height:1.3;color:var(--ink-soft);}`,
    `.draft-badge{position:absolute;right:96px;top:54px;padding:8px 18px;border:3px dashed var(--warn);color:var(--warn);font:700 28px var(--font-body);letter-spacing:.1em;}`,
    `.tone-accent{--tone:var(--accent);}.tone-alt{--tone:var(--alt);}.tone-money{--tone:var(--money);}.tone-warn{--tone:var(--warn);}.tone-neutral{--tone:var(--ink-soft);}`,
  ].join("\n");
}

/** Bộ lọc nét vẽ tay (feTurbulence + feDisplacementMap) – tất định (seed cố định). */
export const SKETCH_FILTER_SVG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="cvs-sketch" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>`;

/** Nền theo theme – phần tử trang trí, không kiểm tra bố cục. */
export function groundHtml(theme: Theme): string {
  const c = theme.colors;
  const base = `position:absolute;inset:0;`;
  switch (theme.ground) {
    case "grid":
      return `<div id="ground" data-layout-ignore style="${base}background-color:${c.bg};background-image:linear-gradient(${c.grid} 1.5px,transparent 1.5px),linear-gradient(90deg,${c.grid} 1.5px,transparent 1.5px);background-size:48px 48px;background-position:-1px -1px;"></div>`;
    case "radial":
      return `<div id="ground" data-layout-ignore style="${base}background:radial-gradient(ellipse 80% 75% at 50% 42%, ${c.bg} 0%, ${c.bg2} 58%, ${c.bg3} 100%);"><div style="${base}background:radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgba(0,0,0,0.42) 100%);"></div></div>`;
    case "cream":
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};overflow:hidden;"><div style="position:absolute;width:820px;height:820px;border-radius:50%;background:${c.bg2};right:-260px;top:-300px;"></div><div style="position:absolute;width:560px;height:560px;border-radius:50%;background:${c.bg2};left:-240px;bottom:-280px;"></div></div>`;
    case "paper":
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};"><svg width="1920" height="1080" style="position:absolute;inset:0;opacity:.35"><filter id="cvs-paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.36  0 0 0 0 0.3  0 0 0 0.09 0"/></filter><rect width="1920" height="1080" filter="url(#cvs-paper)"/></svg><div style="position:absolute;left:96px;right:96px;top:40px;height:0;border-top:1.5px solid ${c.ink};opacity:.5"></div></div>`;
    case "whiteboard":
      return `<div id="ground" data-layout-ignore style="${base}background:radial-gradient(ellipse 90% 85% at 50% 45%, ${c.bg} 70%, ${c.bg2} 100%);"></div>`;
  }
}
