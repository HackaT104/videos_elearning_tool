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
  const guess = (f: Theme["fonts"]["display"]) => f.generic ?? (f.family === "Lora" ? "serif" : f.family === "Patrick Hand" ? "cursive" : "sans-serif");
  const generic = guess(theme.fonts.display);
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
    "--font-body": fontStack(theme.fonts.body, guess(theme.fonts.body)),
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
    case "bar":
      return `.card{background:${c.card};border:0;border-left:10px solid var(--tone);}`;
    case "riso":
      return `.card{background:${c.card};border:2.5px solid ${c.accent};box-shadow:8px 8px 0 ${hexA(c.accent, 0.2)};}`;
    case "tech":
      return `.card{background:${c.card};border:1.5px solid ${c.cardBorder};box-shadow:inset 0 4px 0 var(--tone);}`;
    case "block":
      return `.card{background:${c.card};border:3px solid ${c.ink};box-shadow:12px 12px 0 ${c.highlight};}`;
    default:
      return `.card{background:${c.card};border:${theme.stroke}px solid ${c.cardBorder};}`;
  }
}

const KT_PLAIN = `.kt-mk mark:not(.kt-hl){background:none;padding:0;color:var(--tone, var(--accent));}`;

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
    // mark có nền: trong tiêu đề chữ động kiểu gạch chân (.kt-mk) bỏ nền từng chữ để không chồng hai kiểu nhấn
    case "riso-coban":
      return `mark{background:${c.highlight};color:inherit;padding:0 .12em;}${KT_PLAIN}`;
    case "khoi-mau-tap-chi":
      // chữ mực đen trên mảng san hô (không dùng chữ trắng trên san hô)
      return `mark{background:${c.highlight};color:${c.ink};padding:0 .12em;}${KT_PLAIN}`;
    case "am-moc":
      return `mark{background:linear-gradient(transparent 58%, ${c.highlight} 58%, ${c.highlight} 92%, transparent 92%);color:inherit;padding:0 .06em;}${KT_PLAIN}`;
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
  if (theme.id === "canh-bao-an-toan") return `.pill{display:inline-block;padding:8px 22px;border-radius:3px;background:var(--tone);color:${c.bg3};font-weight:var(--w-bold);}`;
  if (theme.id === "khoi-mau-tap-chi" || theme.id === "riso-coban")
    return `.pill{display:inline-block;padding:6px 20px;border-radius:${theme.radius}px;border:3px solid var(--tone);color:var(--tone);font-weight:var(--w-bold);}`;
  return `.pill{display:inline-block;padding:8px 20px;border-radius:999px;background:${hexA(theme.dark ? "#ffffff" : c.ink, 0.06)};color:var(--tone);font-weight:var(--w-bold);border:1.5px solid ${hexA(theme.dark ? "#ffffff" : c.ink, 0.12)};}`;
}

/** Giãn chữ tiêu đề theo theme (mặc định −0,02em). */
const DISPLAY_LS: Partial<Record<Theme["id"], string>> = {
  "bien-tap-tap-chi": "-0.01em",
  "bang-trang": "0",
  "canh-bao-an-toan": "0.01em",
  "riso-coban": "-0.01em",
  "am-moc": "-0.01em",
  "khoi-mau-tap-chi": "-0.03em",
  "danh-muc-tinh": "-0.005em",
};
/** Phông tiêu đề hẹp, chữ hoa cao: dấu chồng tầng tiếng Việt (Ấ, Ệ…) cần line-height ≥ 1,2. */
const TALL_DISPLAY = new Set(["Oswald"]);
/** Phông tiêu đề mặc định số kiểu cũ (lên xuống dòng) → bật số thẳng hàng cho số liệu. */
const LINING_DISPLAY = new Set(["Playfair Display"]);
const ICON_STROKE: Partial<Record<Theme["id"], number>> = { "bang-trang": 1.9, "phang-tuoi-sang": 1.8, "canh-bao-an-toan": 2, "khoi-mau-tap-chi": 2 };

/** CSS thành phần dùng chung – mọi cảnh chỉ dùng các lớp/biến này. */
export function baseCss(theme: Theme): string {
  return [
    themeVarsCss(theme),
    `*,*::before,*::after{box-sizing:border-box;}`,
    `html,body{margin:0;padding:0;background:${theme.colors.bg};}`,
    `.cvs-scene{position:absolute;inset:0;overflow:hidden;font-family:var(--font-body);color:var(--ink);font-weight:var(--w-body);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}`,
    `.stage{position:absolute;inset:0;}`,
    `.abs{position:absolute;}`,
    `.d{font-family:var(--font-display);font-weight:var(--w-display);letter-spacing:${DISPLAY_LS[theme.id] ?? "-0.02em"};line-height:${TALL_DISPLAY.has(theme.fonts.display.family) ? 1.2 : 1.12};color:var(--ink);${LINING_DISPLAY.has(theme.fonts.display.family) ? `font-feature-settings:"lnum" 1;` : ""}}`,
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
    `.icon svg *{fill:none;stroke:currentColor;stroke-width:${ICON_STROKE[theme.id] ?? 1.6};stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;}`,
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
    case "plain":
      return theme.id === "toi-gian-thuy-si"
        ? `<div id="ground" data-layout-ignore style="${base}background:${c.bg};"><div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:${c.accent};"></div></div>`
        : `<div id="ground" data-layout-ignore style="${base}background:${c.bg};"><div style="position:absolute;left:0;right:0;bottom:0;height:14px;background:linear-gradient(90deg, ${c.accent}, ${c.alt});"></div><div style="position:absolute;right:-180px;top:-220px;width:620px;height:620px;border-radius:50%;background:${c.bg2};"></div></div>`;
    case "blueprint":
      return `<div id="ground" data-layout-ignore style="${base}background-color:${c.bg};background-image:linear-gradient(${c.grid} 1px,transparent 1px),linear-gradient(90deg,${c.grid} 1px,transparent 1px),linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px);background-size:120px 120px,120px 120px,24px 24px,24px 24px;"><div style="position:absolute;inset:28px;border:2px solid rgba(242,247,255,0.35);"></div></div>`;
    case "forest":
      return `<div id="ground" data-layout-ignore style="${base}background:radial-gradient(ellipse 85% 75% at 30% 30%, ${c.bg} 0%, ${c.bg2} 60%, ${c.bg3} 100%);overflow:hidden;"><svg width="1920" height="1080" style="position:absolute;inset:0;opacity:.35"><path d="M0 1080 L0 900 L120 760 L240 900 L360 720 L480 880 L600 780 L720 920 L720 1080 Z" fill="${c.bg3}"/><path d="M1200 1080 L1260 820 L1380 700 L1500 860 L1620 740 L1740 880 L1920 780 L1920 1080 Z" fill="${c.bg3}"/></svg></div>`;
    case "pastel":
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};overflow:hidden;"><div style="position:absolute;width:700px;height:700px;border-radius:50%;background:${c.bg2};left:-260px;top:-300px;"></div><div style="position:absolute;width:520px;height:520px;border-radius:50%;background:${c.highlight};right:-160px;bottom:-220px;"></div></div>`;
    case "hazard":
      // dải sọc cảnh báo chéo ở mép dưới + góc cam trên phải – đều ngoài vùng an toàn; nền phẳng (không gradient lớn trên nền tối)
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};overflow:hidden;"><svg width="1920" height="1080" style="position:absolute;inset:0"><defs><pattern id="cvs-hazard" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="28" height="56" fill="${c.accent}"/></pattern></defs><rect x="0" y="1052" width="1920" height="28" fill="${c.bg3}"/><rect x="0" y="1052" width="1920" height="28" fill="url(#cvs-hazard)"/><path d="M1800 0 H1920 V120 Z" fill="${c.accent}"/><rect x="0" y="0" width="1920" height="6" fill="${c.accent}"/></svg></div>`;
    case "riso":
      // giấy kẻ ô mực coban + hạt in tĩnh (feTurbulence seed cố định → tất định, như nền "paper")
      return `<div id="ground" data-layout-ignore style="${base}background-color:${c.bg};background-image:linear-gradient(${hexA(c.accent, 0.13)} 1.5px,transparent 1.5px),linear-gradient(90deg,${hexA(c.accent, 0.13)} 1.5px,transparent 1.5px),linear-gradient(${hexA(c.accent, 0.06)} 1px,transparent 1px),linear-gradient(90deg,${hexA(c.accent, 0.06)} 1px,transparent 1px);background-size:192px 192px,192px 192px,48px 48px,48px 48px;background-position:-1px -1px;"><svg width="1920" height="1080" style="position:absolute;inset:0;opacity:.5"><filter id="cvs-riso"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.17  0 0 0 0 0.88  0 0 0 0.16 -0.04"/></filter><rect width="1920" height="1080" filter="url(#cvs-riso)"/></svg></div>`;
    case "dots":
      // lưới chấm mờ dần ra mép bằng mặt nạ – nền vẫn phẳng một màu (tránh vệt dải màu H.264 trên nền tối)
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};overflow:hidden;"><div style="${base}background-image:radial-gradient(circle, ${hexA(c.ink, 0.2)} 1.6px, transparent 2.2px);background-size:36px 36px;background-position:18px 18px;-webkit-mask-image:radial-gradient(ellipse 70% 68% at 50% 46%, #000 30%, transparent 100%);mask-image:radial-gradient(ellipse 70% 68% at 50% 46%, #000 30%, transparent 100%);"></div><svg width="1920" height="1080" style="position:absolute;inset:0" fill="none" stroke="${c.accent}" stroke-width="3" opacity=".7"><path d="M36 64 V36 H64 M1856 36 H1884 V64 M1884 1016 V1044 H1856 M64 1044 H36 V1016"/></svg></div>`;
    case "grain":
      // giấy kem có hạt tĩnh (feTurbulence seed cố định) + hai mảng hữu cơ ngoài vùng nội dung; vàng đất chỉ làm mảng nền
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};overflow:hidden;"><div style="position:absolute;width:760px;height:640px;border-radius:58% 42% 55% 45% / 46% 56% 44% 54%;background:${c.bg2};right:-300px;top:-320px;"></div><div style="position:absolute;width:520px;height:440px;border-radius:44% 56% 40% 60% / 55% 45% 55% 45%;background:${hexA(c.highlight, 0.55)};left:-260px;bottom:-280px;"></div><svg width="1920" height="1080" style="position:absolute;inset:0;opacity:.45"><filter id="cvs-grain"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 0 0.18  0 0 0 0.2 -0.05"/></filter><rect width="1920" height="1080" filter="url(#cvs-grain)"/></svg></div>`;
    case "blocks":
      // mảng màu cắt cạnh sắc ở mép (ngoài vùng an toàn): cột san hô bên phải, thanh mực ở đáy
      return `<div id="ground" data-layout-ignore style="${base}background:${c.bg};overflow:hidden;"><div style="position:absolute;right:0;top:0;width:64px;height:1080px;background:${c.highlight};"></div><div style="position:absolute;left:0;bottom:0;width:1856px;height:16px;background:${c.ink};"></div><div style="position:absolute;right:64px;top:0;width:24px;height:200px;background:${c.ink};"></div></div>`;
    case "atlas": {
      // lưới kẻ mảnh + vòng la bàn ở góc dưới phải (tâm ngoài khung → chỉ thấy một phần tư)
      const ticks = Array.from({ length: 72 }, (_, i) => {
        const a = (i * 5 * Math.PI) / 180;
        const r0 = i % 18 === 0 ? 300 : i % 2 === 0 ? 318 : 326;
        const f = (r: number, k: (x: number) => number) => Math.round(k(a) * r * 10) / 10;
        return `M${f(r0, Math.cos)} ${f(r0, Math.sin)} L${f(336, Math.cos)} ${f(336, Math.sin)}`;
      }).join(" ");
      return `<div id="ground" data-layout-ignore style="${base}background-color:${c.bg};background-image:linear-gradient(${c.grid} 1px,transparent 1px),linear-gradient(90deg,${c.grid} 1px,transparent 1px);background-size:96px 96px;background-position:0 -42px;"><svg width="1920" height="1080" style="position:absolute;inset:0;opacity:.55"><g transform="translate(1880 1040)" fill="none" stroke="${c.inkSoft}" stroke-width="1.2"><circle r="336"/><circle r="300"/><circle r="214" stroke-dasharray="2 7"/><path d="${ticks}"/><path d="M0 -420 V420 M-420 0 H420" stroke-width="1"/></g></svg><div style="position:absolute;left:96px;right:96px;top:28px;height:0;border-top:1px solid ${c.inkSoft};opacity:.45"></div></div>`;
    }
  }
}
