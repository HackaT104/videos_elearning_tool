// Cây quyết định: câu hỏi gốc ở trên, nhánh (Có/Không…) tới tối đa 4 kết quả lá (có thể qua một câu hỏi phụ).
// Đường nối vẽ dần theo lời thoại, nhãn nhánh bật lên, nút con hiện ra. Cuối cảnh: đường tới lá được chọn phủ màu nhấn,
// các nhánh khác lùi mờ. Cảm hứng: HyperFrames flowchart / decision-tree – viết lại theo SpecBuilder.

import type { Tone } from "@cvs/themes";
import { iconSvg } from "../icons";
import { dim, draw, enter, pop, shift } from "../motion";
import type { TimeRef } from "../spec";
import { blockHeight, esc, fitSize, plain, rich } from "../text";
import { beatOf, box, header, px, SAFE, SpecBuilder, toneClass, type Beat, type TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };
const toneSchema = { type: "string", enum: ["accent", "alt", "money", "warn", "neutral"] };
const iconSchema = { type: "string", description: "Tên biểu tượng trong thư viện" };

type Leaf = { text: string; sub?: string; icon?: string; tone?: Tone };
type SubBranch = { label?: string; outcome: Leaf; at?: Beat };
type Branch = { label?: string; outcome?: Leaf; question?: string; branches?: SubBranch[]; at?: Beat };

export type DecisionTreeParams = {
  kicker?: string;
  title?: string;
  question: string;
  icon?: string;
  branches: Branch[];
  /** Chỉ số lá được chọn (đếm từ 0, theo thứ tự trái → phải). */
  chosen?: number;
  at?: { question?: Beat; chosen?: Beat };
};

const leafSchema = { type: "object", properties: { text: { type: "string" }, sub: { type: "string" }, icon: iconSchema, tone: toneSchema }, required: ["text"] };

type Node = { kind: "root" | "q" | "leaf"; text: string; sub?: string; icon?: string; tone?: Tone; x: number; y: number; w: number; h: number; id: string };
type Edge = { from: Node; to: Node; label?: string; at?: Beat; key: string; labelY: number; midY: number };

function spread(beats: TimeRef[]): TimeRef[] {
  const seen = new Map<string, number>();
  return beats.map((r) => {
    const k = JSON.stringify(r);
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    return c ? shift(r, 0.1 * c) : r;
  });
}

export const decisionTree: TemplateDef<DecisionTreeParams> = {
  id: "decision-tree",
  label: "Cây quyết định",
  when: "Một câu hỏi dẫn tới các kết quả theo câu trả lời (Có/Không), có thể qua một câu hỏi phụ; tối đa 4 kết quả. Hợp cây quyết định CCP trong HACCP, phân loại sự cố, chọn biện pháp.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      question: { type: "string" },
      icon: iconSchema,
      branches: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          description: "Mỗi nhánh có outcome (lá) hoặc question + branches (câu hỏi phụ, 2 lá). Tổng số lá ≤ 4.",
          properties: {
            label: { type: "string", description: "Nhãn nhánh, vd Có / Không (2 nhánh không ghi nhãn → tự thêm Có/Không)" },
            outcome: leafSchema,
            question: { type: "string" },
            branches: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", properties: { label: { type: "string" }, outcome: leafSchema, at: beatSchema }, required: ["outcome"] } },
            at: beatSchema,
          },
        },
      },
      chosen: { type: "integer", minimum: 0, maximum: 3 },
      at: { type: "object", properties: { question: beatSchema, chosen: beatSchema } },
    },
    required: ["question", "branches"],
  },
  example: {
    kicker: "HACCP",
    title: "Công đoạn này có phải CCP?",
    question: "Có biện pháp kiểm soát tại công đoạn này?",
    branches: [
      { label: "Không", outcome: { text: "Không phải CCP", tone: "neutral" } },
      {
        label: "Có",
        question: "Công đoạn loại bỏ hoặc giảm mối nguy?",
        branches: [
          { label: "Có", outcome: { text: "Là điểm kiểm soát tới hạn (CCP)", icon: "target" } },
          { label: "Không", outcome: { text: "Xem xét công đoạn tiếp theo", tone: "neutral" } },
        ],
      },
    ],
    chosen: 1,
  },
  build(P, ctx) {
    const b = new SpecBuilder(ctx);
    const n = ctx.sentences.length;
    const y0 = header(b, { kicker: P.kicker, title: P.title });

    // ---- chuẩn hoá: ≤ 4 nhánh, tổng lá ≤ 4; nhãn mặc định Có/Không khi đúng 2 nhánh
    const yesNo = (list: { label?: string }[], i: number) => (list[i].label ?? (list.length === 2 ? (i === 0 ? "Có" : "Không") : undefined));
    let leafBudget = 4;
    const branches = P.branches.slice(0, 4).flatMap((br): Branch[] => {
      if (leafBudget <= 0) return [];
      if (br.question && br.branches?.length) {
        const subs = br.branches.slice(0, Math.min(3, leafBudget));
        if (subs.length >= 2 || (subs.length === 1 && !br.outcome)) {
          leafBudget -= subs.length;
          return [{ ...br, branches: subs, outcome: undefined }];
        }
      }
      if (!br.outcome) return [];
      leafBudget--;
      return [{ ...br, question: undefined, branches: undefined }];
    });
    if (P.branches.length === 2 && P.branches.some((x) => !x.label)) b.assume('Nhãn nhánh "Có"/"Không" do template tự thêm');
    if (branches.some((x) => x.branches?.length === 2 && x.branches.some((s) => !s.label))) b.assume('Nhãn nhánh phụ "Có"/"Không" do template tự thêm');

    const leaves: Leaf[] = branches.flatMap((br) => (br.branches ? br.branches.map((s) => s.outcome) : [br.outcome!]));
    const L = leaves.length;
    const hasSub = branches.some((br) => br.branches);

    // ---- kích thước
    const gapX = 40;
    const lw = Math.min(420, (SAFE.w - gapX * (L - 1)) / L);
    const pad = 28;
    const lIcon = 56;
    const ltwOf = (l: Leaf) => lw - pad * 2 - (l.icon ? lIcon + 16 : 0);
    const lSize = Math.min(...leaves.map((l) => fitSize(l.text, ltwOf(l), 38, { maxLines: 3, kind: "display", min: 28 })));
    const lsSize = Math.min(30, ...leaves.filter((l) => l.sub).map((l) => fitSize(l.sub!, ltwOf(l), 30, { maxLines: 2, min: 28 })));
    const leafH = Math.ceil(pad * 2 + Math.max(...leaves.map((l) => Math.max(l.icon ? lIcon : 0, blockHeight(l.text, lSize, ltwOf(l), "display") + (l.sub ? 8 + blockHeight(l.sub, lsSize, ltwOf(l)) : 0)))));
    // tâm cột lá: dàn đều, giãn rộng hơn khi ít lá
    const gapL = L * lw + (L - 1) * 160 <= SAFE.w ? 160 : gapX;
    const rowW = L * lw + (L - 1) * gapL;
    const lx = leaves.map((_, i) => SAFE.x0 + (SAFE.w - rowW) / 2 + i * (lw + gapL) + lw / 2);

    const rIcon = P.icon ? 64 : 0;
    // rộng theo độ dài câu hỏi (câu ngắn → thẻ gọn), tối đa 1100
    const rootW = Math.min(1100, Math.max(640, plain(P.question).length * 0.6 * 46 + pad * 2 + (rIcon ? rIcon + 20 : 0) + 24));
    const rtw = rootW - pad * 2 - (rIcon ? rIcon + 20 : 0);
    const rSize = fitSize(P.question, rtw, 46, { maxLines: 2, kind: "display", min: 32 });
    const rootH = Math.ceil(pad * 2 + Math.max(rIcon, blockHeight(P.question, rSize, rtw, "display")));

    // câu hỏi phụ: rộng theo các lá con
    let li = 0;
    const subSpec = branches.map((br) => {
      if (!br.branches) {
        const c = lx[li++];
        return { leafIdx: [li - 1], cx: c, w: 0 };
      }
      const idx = br.branches.map(() => li++);
      const x0 = lx[idx[0]] - lw / 2;
      const x1 = lx[idx[idx.length - 1]] + lw / 2;
      return { leafIdx: idx, cx: (x0 + x1) / 2, w: Math.min(640, x1 - x0) };
    });
    const qSize = Math.min(40, ...branches.map((br, i) => (br.question ? fitSize(br.question, subSpec[i].w - pad * 2, 40, { maxLines: 3, kind: "display", min: 28 }) : 40)));
    const qH = hasSub ? Math.ceil(pad * 2 + Math.max(...branches.map((br, i) => (br.question ? blockHeight(br.question, qSize, subSpec[i].w - pad * 2, "display") : 0)))) : 0;

    // ---- hàng dọc
    const rowsH = hasSub ? [rootH, qH, leafH] : [rootH, leafH];
    const H = 1000 - y0;
    const G = Math.max(110, Math.min(220, (H - rowsH.reduce((a, c) => a + c, 0)) / (rowsH.length - 1)));
    const used = rowsH.reduce((a, c) => a + c, 0) + G * (rowsH.length - 1);
    const yStart = y0 + Math.max(0, (H - used) / 2);
    const rowY = rowsH.map((_, i) => yStart + rowsH.slice(0, i).reduce((a, c) => a + c, 0) + G * i);

    const root: Node = { kind: "root", text: P.question, icon: P.icon, x: 960 - rootW / 2, y: rowY[0], w: rootW, h: rootH, id: b.id("root") };
    const leafNodes: Node[] = leaves.map((l, i) => ({ kind: "leaf", text: l.text, sub: l.sub, icon: l.icon, tone: l.tone, x: lx[i] - lw / 2, y: rowY[rowY.length - 1], w: lw, h: leafH, id: b.id(`leaf${i}`) }));
    const edges: Edge[] = [];
    const routeTo: number[][] = []; // lá → chỉ số các cạnh trên đường đi
    const qNodes: Node[] = [];
    branches.forEach((br, bi) => {
      const sp = subSpec[bi];
      const lab = yesNo(branches, bi);
      const midY = root.y + root.h + Math.min(48, G * 0.36);
      const labelY = (midY + rowY[1]) / 2;
      if (br.branches) {
        const q: Node = { kind: "q", text: br.question!, x: sp.cx - sp.w / 2, y: rowY[1], w: sp.w, h: qH, id: b.id(`q${bi}`) };
        qNodes.push(q);
        const e0 = edges.push({ from: root, to: q, label: lab, at: br.at, key: `e${edges.length}`, midY, labelY }) - 1;
        br.branches.forEach((s, si) => {
          const leaf = leafNodes[sp.leafIdx[si]];
          const m2 = q.y + q.h + Math.min(48, G * 0.36);
          const e1 = edges.push({ from: q, to: leaf, label: yesNo(br.branches!, si), at: s.at, key: `e${edges.length}`, midY: m2, labelY: (m2 + leaf.y) / 2 }) - 1;
          routeTo[sp.leafIdx[si]] = [e0, e1];
        });
      } else {
        const leaf = leafNodes[sp.leafIdx[0]];
        const e = edges.push({ from: root, to: leaf, label: lab, at: br.at, key: `e${edges.length}`, midY, labelY }) - 1;
        routeTo[sp.leafIdx[0]] = [e];
      }
    });

    // ---- mốc: gốc ở câu đầu, các cạnh trải trên các câu còn lại theo thứ tự đọc (DFS)
    const rootAt: TimeRef = P.at?.question ? beatOf(P.at.question, 0, 1, n) : { cue: 0, f: 0.04 };
    const beats = spread(edges.map((e, k) => beatOf(e.at, k + 1, edges.length + 1, n, 0.06)));

    // ---- đường nối (gấp khúc vuông góc, bo nhẹ)
    const pathOf = (e: Edge) => {
      const x0 = e.from.x + e.from.w / 2;
      const y0_ = e.from.y + e.from.h;
      const x1 = e.to.x + e.to.w / 2;
      const y1 = e.to.y - 4;
      if (Math.abs(x1 - x0) < 2) return `M${Math.round(x0)} ${Math.round(y0_)} V${Math.round(y1)}`;
      const r = Math.min(18, Math.abs(x1 - x0) / 2);
      const sx = Math.sign(x1 - x0);
      return `M${Math.round(x0)} ${Math.round(y0_)} V${Math.round(e.midY - r)} Q${Math.round(x0)} ${Math.round(e.midY)} ${Math.round(x0 + sx * r)} ${Math.round(e.midY)} H${Math.round(x1 - sx * r)} Q${Math.round(x1)} ${Math.round(e.midY)} ${Math.round(x1)} ${Math.round(e.midY + r)} V${Math.round(y1)}`;
    };
    const chosen = P.chosen !== undefined && P.chosen >= 0 && P.chosen < L ? P.chosen : undefined;
    const route = chosen !== undefined ? routeTo[chosen] : [];
    b.add(
      `<svg class="abs" style="${box(0, 0, 1920, 1080)}overflow:visible" viewBox="0 0 1920 1080">${edges
        .map((e) => `<path id="${b.id(e.key)}" class="line draw" pathLength="1" d="${pathOf(e)}" style="stroke:var(--ink-soft)"/>`)
        .join("")}${route.map((k) => `<path id="${b.id(`hl${k}`)}" class="line draw tone-accent" pathLength="1" d="${pathOf(edges[k])}" style="stroke:var(--tone);stroke-width:7px"/>`).join("")}</svg>`,
    );

    // ---- nút
    const card = (nd: Node, inner: string, extra = "") => b.add(`<div id="${nd.id}" class="card ${toneClass(nd.tone)}" style="${box(nd.x, nd.y, nd.w, nd.h)}padding:${pad}px;${extra}">${inner}</div>`);
    card(
      root,
      `<div style="display:flex;align-items:center;justify-content:center;gap:20px;height:100%;">${rIcon ? `<div class="icon" style="width:${rIcon}px;height:${rIcon}px;flex:none;">${iconSvg(P.icon)}</div>` : ""}<div class="d t" style="font-size:${rSize}px;text-align:center;text-wrap:balance;max-width:${px(rtw)};">${rich(b.text(P.question))}</div></div>`,
    );
    b.anim(enter(ctx, root.id, rootAt, { rise: 20 }));
    for (const q of qNodes)
      card(q, `<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="d t" style="font-size:${qSize}px;text-align:center;text-wrap:balance;">${rich(b.text(q.text))}</div></div>`);
    for (const lf of leafNodes)
      card(
        lf,
        `<div style="display:flex;align-items:center;gap:16px;height:100%;">${lf.icon ? `<div class="icon" style="width:${lIcon}px;height:${lIcon}px;flex:none;">${iconSvg(lf.icon)}</div>` : ""}<div style="width:${px(ltwOf(lf))};"><div class="d t" style="font-size:${lSize}px;text-wrap:balance;">${rich(b.text(lf.text))}</div>${
          lf.sub ? `<div class="b soft t" style="font-size:${lsSize}px;margin-top:8px;">${rich(b.text(lf.sub))}</div>` : ""
        }</div></div>`,
      );

    // ---- cạnh: vẽ nét → nhãn bật → nút con hiện
    const drawDur = ctx.slow ? 0.8 : 0.6;
    edges.forEach((e, k) => {
      const at = beats[k];
      b.anim(draw(ctx, b.id(e.key), at, drawDur, "power2.inOut"));
      if (e.label) {
        const lid = b.id(`lb${k}`);
        const x = e.to.x + e.to.w / 2;
        b.add(
          `<div id="${lid}" class="abs" style="${box(x - 150, e.labelY - 26, 300, 52)}display:flex;align-items:center;justify-content:center;transform-origin:50% 50%;"><span class="pill b t" style="font-size:30px;line-height:1.2;background-color:var(--card);">${esc(b.text(e.label))}</span></div>`,
        );
        b.anim(pop(ctx, lid, shift(at, drawDur * 0.55), 0.6));
      }
      b.anim(enter(ctx, e.to.id, shift(at, drawDur * 0.8), { rise: 18, scale: 0.96 }));
    });

    // ---- kết: nhánh được chọn giữ màu nhấn, nhánh khác mờ
    if (chosen !== undefined) {
      const lastB = beats[beats.length - 1];
      const cAt: TimeRef = P.at?.chosen ? beatOf(P.at.chosen, 0, 1, n) : "cue" in lastB && lastB.cue < n - 1 ? { cue: n - 1, f: 0.3 } : shift(lastB, ctx.slow ? 1.6 : 1.3);
      const onRoute = new Set(route);
      const keepNodes = new Set<string>([root.id, leafNodes[chosen].id, ...route.map((k) => edges[k].to.id)]);
      edges.forEach((e, k) => {
        if (onRoute.has(k)) return;
        b.anim(dim(ctx, b.id(e.key), cAt, 0.25));
        if (e.label) b.anim(dim(ctx, b.id(`lb${k}`), cAt, 0.3));
      });
      for (const nd of [...qNodes, ...leafNodes]) if (!keepNodes.has(nd.id)) b.anim(dim(ctx, nd.id, cAt, 0.3));
      route.forEach((k, j) => b.anim(draw(ctx, b.id(`hl${k}`), shift(cAt, 0.15 + j * 0.4), 0.45, "power2.inOut")));
      const lf = leafNodes[chosen];
      const ring = b.id("pick");
      b.add(`<div id="${ring}" class="abs tone-accent" style="${box(lf.x - 10, lf.y - 10, lf.w + 20, lf.h + 20)}border:6px solid var(--tone);border-radius:calc(var(--radius) + 10px);transform-origin:50% 50%;"></div>`);
      const pickAt = shift(cAt, 0.15 + route.length * 0.4);
      b.anim(pop(ctx, ring, pickAt, 0.9));
      b.anim({ id: lf.id, from: { scale: 1 }, to: { scale: 1.04 }, at: pickAt, dur: 0.3, ease: "power2.out" });
      b.anim({ id: lf.id, from: { scale: 1.04 }, to: { scale: 1 }, at: shift(pickAt, 0.3), dur: 0.45, ease: "power2.inOut" });
    }
    return b.done();
  },
};
