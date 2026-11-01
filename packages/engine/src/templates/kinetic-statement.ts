// Câu chốt chuyển động: một câu ngắn (≤ 12 từ) trên 2–3 dòng, cỡ chữ khác nhau theo dòng, từ khoá **…** màu nhấn;
// từng từ hiện theo mốc câu (mờ + blur + trồi, tách theo khoảng trắng), cuối cùng có thể có dòng nguồn nhỏ.
import type { Tone } from "@cvs/themes";
import { KINETIC_PRESETS, kineticText, type KineticPreset } from "../kinetic";
import { enter, grow, shift } from "../motion";
import type { TimeRef } from "../spec";
import { esc, fitSize, rich } from "../text";
import { beatOf, box, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };

type Line = { text: string; size?: "l" | "m" | "s"; at?: Beat; alt?: string[] };
export type KineticStatementParams = { kicker?: string; lines: Line[]; source?: string; align?: "left" | "center"; tone?: Tone; preset?: KineticPreset; at?: { source?: Beat } };

const SIZE = { l: 168, m: 112, s: 80 };

/** Mốc dòng i: đủ câu → beatOf; ít câu hơn số dòng → rải đều trong các câu. */
function lineBeat(at: Beat | undefined, i: number, L: number, n: number): TimeRef {
  if (at || n >= L) return beatOf(at, i, L, n, 0.05);
  const p = (i * Math.max(1, n)) / L;
  const cue = Math.floor(p);
  return { cue, f: Math.min(0.8, 0.05 + (p - cue) * 0.9) };
}

export const kineticStatement: TemplateDef<KineticStatementParams> = {
  id: "kinetic-statement",
  label: "Câu chốt chuyển động",
  when: "Một thông điệp chốt rất ngắn (≤ 12 từ) cần khắc sâu: chia 2–3 dòng, dòng chứa từ khoá **…** to nhất, từng từ hiện theo lời đọc. Không dùng cho đoạn dài. «preset» chọn kiểu chữ chuyển động (đổi giữa các cảnh; số → odometer, «không phải X mà là Y» → word-swap với alt, nhiều dòng đọc lần lượt → reading-focus).",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      lines: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            size: { type: "string", enum: ["l", "m", "s"] },
            at: beatSchema,
            alt: { type: "array", maxItems: 3, items: { type: "string" }, description: "Chỉ với preset word-swap: các từ hiện trước rồi bị thay bằng cụm **…** của dòng" },
          },
          required: ["text"],
        },
      },
      preset: { type: "string", enum: KINETIC_PRESETS.map((k) => k.id), description: `Kiểu chữ chuyển động (mặc định word-rise; đổi giữa các cảnh): ${KINETIC_PRESETS.map((k) => `${k.id} = ${k.label} (${k.when})`).join("; ")}` },
      source: { type: "string", description: "Dòng nguồn/ghi chú nhỏ ở cuối (tuỳ chọn)" },
      align: { type: "string", enum: ["left", "center"] },
      tone: toneSchema,
      at: { type: "object", properties: { source: beatSchema } },
    },
    required: ["lines"],
  },
  example: {
    lines: [{ text: "An toàn không phải" }, { text: "**thủ tục**," }, { text: "mà là thói quen mỗi ngày" }],
    source: "Tinh thần ISO 45001",
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const lines = P.lines.slice(0, 3);
    const L = lines.length;
    const center = (P.align ?? "center") === "center";
    const W = SAFE.w - 80;
    const x = SAFE.x0 + 40;
    // cỡ chữ: dòng có từ khoá to nhất, dòng còn lại vừa (3 dòng: dòng không nhấn cuối nhỏ hơn) – mỗi dòng một hàng
    const preset = P.preset ?? "word-rise";
    const sizes = lines.map((l, i) => {
      const k = l.size ?? (/\*\*.+?\*\*/.test(l.text) ? "l" : L === 3 && i === L - 1 ? "s" : "m");
      // word-swap: dòng phải vừa cả khi đang hiện từ thay thế dài nhất
      // circle-annotate: cụm nhấn có lề 0,3em hai bên ≈ thêm một ký tự
      const text = preset === "circle-annotate" ? l.text.replace(/\*\*(.+?)\*\*/g, "**$1x**") : l.text;
      const variants = [text, ...(preset === "word-swap" ? (l.alt ?? []).map((a) => (/\*\*.+?\*\*/.test(l.text) ? l.text.replace(/\*\*.+?\*\*/, a) : `${l.text} ${a}`)) : [])];
      return Math.min(...variants.map((v) => fitSize(v, W, SIZE[k], { maxLines: 1, kind: "display", min: 48 })));
    });
    const lh = 1.18;
    const gaps = sizes.map((s) => s * 0.2);
    const kickH = P.kicker ? 76 : 0;
    const srcH = P.source ? 110 : 0;
    const total = kickH + sizes.reduce((a, s, i) => a + s * lh + (i < L - 1 ? gaps[i] : 0), 0) + srcH;
    let y = Math.max(SAFE.y0 + 40, 530 - total / 2);
    const tone = toneClass(P.tone);
    const align = center ? "text-align:center;" : "";
    b.add(`<div class="abs ${tone}" style="${box(0, 0, 1920, 1080)}">`);
    if (P.kicker) {
      b.add(`<div id="${b.id("kicker")}" class="abs kicker t" style="${box(x, y, W)}${align}">${esc(b.text(P.kicker))}</div>`);
      b.anim(enter(ctx, b.id("kicker"), { t: 0.2 }, { rise: 14 }));
      y += kickH;
    }
    let lastAt: TimeRef = { cue: 0, f: 0 };
    const beats = lines.map((l, i) => lineBeat(l.at, i, L, n));
    lines.forEach((l, i) => {
      const at = beats[i];
      lastAt = at;
      const focus = preset === "reading-focus";
      const k = kineticText(b, {
        name: `l${i}`,
        text: l.text,
        cls: "abs d t",
        style: `${box(x, y, W)}font-size:${sizes[i]}px;line-height:${lh};white-space:nowrap;${align}`,
        size: sizes[i],
        lh,
        preset,
        at,
        total: preset === "typewriter" ? undefined : 0.9,
        alternates: l.alt,
        // reading-focus: mọi dòng hiện mờ cùng dòng đầu, dòng đang đọc sáng, dòng trước lùi 0,55
        dimFrom: focus && i > 0 ? beats[0] : undefined,
        next: focus ? beats[i + 1] : undefined,
      });
      // trồi 0,18em (< khoảng cách dòng 0,2em) để từ chưa hiện không đè sang dòng dưới khi đo bố cục
      if (preset === "word-rise") for (const a of k.anims) if (/-w\d+$/.test(a.id) && a.from.y !== undefined) a.from.y = Math.round(sizes[i] * 0.18);
      // dòng chưa tới lượt ẩn hẳn (từ ở trạng thái đầu bị lệch xuống không tính là chồng chữ)
      if (!focus) b.anim({ id: k.id, from: { opacity: 0 }, to: { opacity: 1 }, at, dur: 0.15, ease: "none" });
      // từ khoá: màu nhấn ở mọi theme (không dùng nền dạ quang của <mark>; trừ khi quét dạ quang)
      if (preset !== "highlight-sweep") b.css.push(`#${k.id} mark:not(.kt-hl){background:none;color:var(--tone);padding:0;}`);
      y += sizes[i] * lh + (i < L - 1 ? gaps[i] : 0);
    });
    if (P.source) {
      y += 48;
      const sAt = P.at?.source ? beatOf(P.at.source, 0, 1, n) : shift(lastAt, 1.1);
      const sSize = fitSize(P.source, W - 200, 32, { maxLines: 1, min: 28 });
      const rx = center ? x + W / 2 - 40 : x;
      b.add(`<div id="${b.id("rule")}" class="abs" style="${box(rx, y, 80, 5)}background:var(--tone);border-radius:3px;transform-origin:${center ? "50%" : "0%"} 50%;"></div>`);
      b.anim(grow(ctx, b.id("rule"), sAt, "x", 0.6));
      b.add(`<div id="${b.id("src")}" class="abs b soft t" style="${box(x, y + 22, W)}font-size:${sSize}px;${align}">${rich(b.text(P.source))}</div>`);
      b.anim(enter(ctx, b.id("src"), shift(sAt, 0.2), { rise: 10 }));
    }
    b.add(`</div>`);
    return b.done();
  },
};
