// Bóc Word (.docx) – mục 3.2. mammoth (docx → HTML) giữ tiêu đề, danh sách, bảng.

import mammoth from "mammoth";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { parseClock } from "../codes";
import { buildVideo, type ProjectDefaults, type RawScene, type RawVideo } from "../factory";
import type { OutlineDoc, ParseResult } from "../types";

export type Block =
  | { kind: "p" | "li"; text: string; level?: number }
  | { kind: "h"; text: string; level: number }
  | { kind: "table"; rows: string[][] };

export async function docxToBlocks(buf: Buffer): Promise<Block[]> {
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  return htmlToBlocks(value);
}

export function htmlToBlocks(html: string): Block[] {
  const root = parseHtml(html);
  const out: Block[] = [];
  const walk = (el: HTMLElement, depth: number) => {
    for (const c of el.childNodes as HTMLElement[]) {
      const tag = c.rawTagName?.toLowerCase();
      if (!tag) continue;
      if (/^h[1-6]$/.test(tag)) out.push({ kind: "h", text: clean(c.text), level: Number(tag[1]) });
      else if (tag === "p") pushLines(out, "p", c);
      else if (tag === "ul" || tag === "ol") walkList(c, depth + 1);
      else if (tag === "table") {
        const rows = c.querySelectorAll("tr").map((tr) => tr.querySelectorAll("td,th").map((td) => cellText(td)));
        out.push({ kind: "table", rows });
      } else walk(c, depth);
    }
  };
  const walkList = (list: HTMLElement, depth: number) => {
    for (const li of list.childNodes as HTMLElement[]) {
      if (li.rawTagName?.toLowerCase() !== "li") continue;
      const own = (li.childNodes as HTMLElement[])
        .filter((n) => !["ul", "ol"].includes(n.rawTagName?.toLowerCase() ?? ""))
        .map((n) => n.text)
        .join("");
      const t = clean(own);
      if (t) out.push({ kind: "li", text: t, level: depth });
      for (const sub of li.childNodes as HTMLElement[]) {
        const st = sub.rawTagName?.toLowerCase();
        if (st === "ul" || st === "ol") walkList(sub, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out.filter((b) => b.kind === "table" || b.text.length > 0);
}

function pushLines(out: Block[], kind: "p", el: HTMLElement) {
  // <br> trong đoạn → nhiều dòng
  const html = el.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  for (const line of parseHtml(html).text.split("\n")) {
    const t = clean(line);
    if (t) out.push({ kind, text: t });
  }
}

function cellText(td: HTMLElement): string {
  const html = td.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n").replace(/<\/li>\s*<li>/gi, "\n");
  return parseHtml(html)
    .text.split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n");
}

function clean(s: string): string {
  return decodeEntities(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// ---------- Nhận diện kịch bản ----------

const RE_SCENE = /^\[?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*[:.\-–]?\s*(.*)$/;
const RE_FILENAME = /^T[êe]n\s*file\s*[:：]\s*(.+)$/i;
const RE_SCRIPT = /^SCRIPT\s+VIDEO\s*(\d+)?\s*[:.\-–]?\s*(.*)$/i;
const RE_TYPE_VIDEO = /^Lo[ạa]i\s*[:：]\s*Video\b/i;
const RE_TITLE = /^(Ti[êe]u\s*đ[ềe]|T[êe]n\s*video|Title)\s*[:：]\s*(.+)$/i;
const RE_VO = /^(Gi[ọo]ng\s*đ[ọo]c|L[ờo]i\s*tho[ạa]i|L[ờo]i\s*b[ìi]nh|Voice[\s-]*over|VO(?![A-Za-z]))\s*(\((?:Voice[\s-]*over|VO)\))?\s*[:：]?\s*(.*)$/i;
const RE_VISUAL = /^(H[ìi]nh\s*[ảa]nh|Visual|M[ôo]\s*t[ảa]\s*h[ìi]nh)\s*[:：]\s*(.*)$/i;
const RE_SOURCE = /^(Ngu[ồo]n(?:\s*tham\s*kh[ảa]o)?|Sources?)\s*[:：]\s*(.*)$/i;
const RE_TEXT = /\bText\s*[:：]\s*["“]([^"”]+)["”]/gi;
const RE_TEXT_NOQUOTE = /^Text\s*[:：]\s*([^"“].*)$/i;

type SceneAcc = RawScene & { voMode: boolean; voOpen: boolean };

export type DocxParseOptions = ProjectDefaults & { fileName?: string };

/** Bóc danh sách khối thành kết quả (script / outline / topic). */
export function parseBlocks(blocks: Block[], opts: DocxParseOptions): ParseResult {
  const warnings: string[] = [];
  const raws: RawVideo[] = [];
  let cur: RawVideo | null = null;
  let scene: SceneAcc | null = null;
  let contextLines: string[] = [];
  let pendingHeading = "";
  let afterSources = false;

  const closeScene = () => {
    if (scene && cur) {
      const { voMode: _a, voOpen: _b, ...s } = scene;
      cur.scenes.push({ ...s, vo: s.vo.trim() });
    }
    scene = null;
  };
  const closeVideo = () => {
    closeScene();
    if (cur) {
      cur.context = [cur.context, ...contextLines].filter(Boolean).join("\n");
      if (cur.scenes.length > 0) raws.push(cur);
      else if (cur.fileName) warnings.push(`Video "${cur.fileName}" không có cảnh nào có mốc thời gian.`);
    }
    contextLines = [];
    cur = null;
    afterSources = false;
  };
  const ensureVideo = () => {
    if (!cur) cur = { title: pendingHeading, scenes: [] };
    return cur;
  };
  const startsNewVideo = (field: "fileName" | "title" | "type") => {
    if (!cur) return true;
    if (cur.scenes.length > 0 || scene) return true;
    if (field === "fileName" && cur.fileName) return true;
    return false;
  };

  const handleLine = (line: string, kind: Block["kind"] = "p") => {
    let m: RegExpMatchArray | null;
    if (RE_TYPE_VIDEO.test(line)) {
      if (startsNewVideo("type")) {
        closeVideo();
        ensureVideo();
      }
      return;
    }
    if ((m = line.match(RE_FILENAME))) {
      if (startsNewVideo("fileName")) closeVideo();
      ensureVideo().fileName = m[1].trim();
      return;
    }
    if ((m = line.match(RE_SCRIPT))) {
      if (cur && (cur.scenes.length > 0 || scene)) closeVideo();
      const v = ensureVideo();
      if (m[2]) v.title = m[2].trim();
      return;
    }
    if ((m = line.match(RE_TITLE)) && cur && !scene) {
      cur.title = m[2].trim();
      return;
    }
    if ((m = line.match(RE_SCENE))) {
      closeScene();
      ensureVideo();
      afterSources = false;
      const rest = m[3].trim();
      const ci = rest.search(/[:：]/);
      const title = ci > 0 ? rest.slice(0, ci).trim() : rest;
      const visual = ci > 0 ? rest.slice(ci + 1).trim() : "";
      scene = {
        scriptStart: parseClock(m[1]),
        scriptEnd: parseClock(m[2]),
        title,
        visual: stripText(visual),
        onscreen: extractText(visual),
        vo: "",
        voMode: false,
        voOpen: false,
      };
      return;
    }
    if ((m = line.match(RE_SOURCE))) {
      closeScene();
      const v = ensureVideo();
      v.sources = [v.sources, m[2].trim()].filter(Boolean).join("; ");
      afterSources = true;
      return;
    }
    if (afterSources && cur && !scene) {
      // dòng nối tiếp phần "Nguồn:" (danh sách nguồn)
      if (kind === "li" || /^([-•*]|\d+[.)]|\[\d+\])\s/.test(line)) {
        cur.sources = [cur.sources, line.replace(/^[-•*]\s*/, "")].filter(Boolean).join("; ");
        return;
      }
    }
    if (!scene) {
      if (cur) contextLines.push(line);
      return;
    }
    const sc: SceneAcc = scene;
    if ((m = line.match(RE_VO))) {
      sc.voMode = true;
      takeVo(sc, m[3]);
      return;
    }
    if ((m = line.match(RE_VISUAL))) {
      sc.voMode = false;
      sc.visual = [sc.visual, stripText(m[2])].filter(Boolean).join(" ");
      sc.onscreen.push(...extractText(m[2]));
      return;
    }
    if ((m = line.match(RE_TEXT_NOQUOTE))) {
      sc.onscreen.push(m[1].trim());
      return;
    }
    if (sc.voMode && (sc.voOpen || !/[:：]$/.test(line))) {
      takeVo(sc, line);
      return;
    }
    const texts = extractText(line);
    if (texts.length) sc.onscreen.push(...texts);
    const rest = stripText(line);
    if (rest) sc.visual = [sc.visual, rest].filter(Boolean).join(" ");
  };

  for (const b of blocks) {
    if (b.kind === "table") {
      const handled = handleTable(b.rows, (s) => {
        closeScene();
        ensureVideo().scenes.push(s);
      });
      if (!handled && cur) contextLines.push(b.rows.map((r) => r.join(" | ")).join("\n"));
      else if (!handled) pendingHeading = pendingHeading || "";
      continue;
    }
    if (b.kind === "h" && !scene && !cur) pendingHeading = b.text;
    if (b.kind === "h" && scene && !RE_SCENE.test(b.text) && !(scene as SceneAcc).voOpen) {
      // tiêu đề mới kết thúc cảnh hiện tại
      closeScene();
      if (cur) contextLines.push(b.text);
      continue;
    }
    handleLine(b.text, b.kind);
  }
  closeVideo();

  const videos = raws.map((r, i) => buildVideo(r, opts, i));
  for (const v of videos) {
    v.scenes.forEach((s) => {
      if (s.sentences.length === 0) warnings.push(`${v.key} · ${s.id} (${s.title}): không tìm thấy lời thoại.`);
    });
  }
  if (videos.length > 0 && videos.some((v) => v.scenes.some((s) => s.sentences.length > 0))) {
    return { kind: "script", fileName: opts.fileName ?? "", videos, warnings };
  }
  const textBlocks = blocks.filter((b): b is Exclude<Block, { kind: "table" }> => b.kind !== "table");
  const structured = textBlocks.filter((b) => b.kind === "h" || b.kind === "li").length;
  const raw = blocks.map((b) => (b.kind === "table" ? b.rows.map((r) => r.join(" | ")).join("\n") : b.text)).join("\n");
  if (structured >= 3) {
    return { kind: "outline", fileName: opts.fileName ?? "", videos: [], outline: blocksToOutline(textBlocks, raw), warnings };
  }
  return { kind: "topic", fileName: opts.fileName ?? "", videos: [], topic: raw.trim(), warnings };
}

function takeVo(sc: SceneAcc, chunk: string) {
  let s = chunk.trim();
  if (!s) return;
  if (!sc.voOpen && /^["“]/.test(s)) {
    sc.voOpen = true;
    s = s.slice(1);
  }
  if (sc.voOpen) {
    const close = s.search(/["”]\s*$/);
    if (close >= 0) {
      s = s.slice(0, close);
      sc.voOpen = false;
      sc.voMode = false;
    }
  }
  sc.vo = [sc.vo, s.trim()].filter(Boolean).join(" ");
}

function extractText(s: string): string[] {
  return [...s.matchAll(RE_TEXT)].map((m) => m[1].trim());
}
function stripText(s: string): string {
  return s.replace(RE_TEXT, "").replace(/\s+/g, " ").trim();
}

const COLS = {
  time: /th[ờo]i\s*gian|time|m[ốo]c/i,
  scene: /^c[ảa]nh|scene|t[êe]n\s*c[ảa]nh/i,
  visual: /h[ìi]nh|visual|m[ôo]\s*t[ảa]/i,
  onscreen: /text|ch[ữu]\s*tr[êe]n|on[\s-]*screen/i,
  vo: /gi[ọo]ng|l[ờo]i|tho[ạa]i|voice|vo\b/i,
};

/** Bảng kịch bản dạng cột: Thời gian | Cảnh | Hình ảnh | Text | Giọng đọc. */
function handleTable(rows: string[][], emit: (s: RawScene) => void): boolean {
  const timeRow = (r: string[]) => r.findIndex((c) => RE_SCENE.test(c.split("\n")[0]));
  const dataRows = rows.filter((r) => timeRow(r) >= 0);
  if (dataRows.length === 0) return false;
  const header = rows.find((r) => timeRow(r) < 0 && r.some((c) => COLS.vo.test(c)));
  const idx = (re: RegExp, fallback: number) => {
    const i = header ? header.findIndex((c) => re.test(c)) : -1;
    return i >= 0 ? i : fallback;
  };
  const ncol = Math.max(...dataRows.map((r) => r.length));
  const iTime = header ? idx(COLS.time, 0) : 0;
  const iVo = idx(COLS.vo, ncol - 1);
  const iOn = header ? header.findIndex((c) => COLS.onscreen.test(c) && !COLS.vo.test(c)) : -1;
  const iScene = header ? header.findIndex((c) => COLS.scene.test(c)) : -1;
  const iVis = header ? header.findIndex((c, i) => COLS.visual.test(c) && i !== iOn) : ncol > 2 ? 1 : -1;
  for (const r of dataRows) {
    const ti = timeRow(r);
    const m = r[ti >= 0 ? ti : iTime].split("\n")[0].match(RE_SCENE)!;
    const rest = m[3].trim();
    const ci = rest.search(/[:：]/);
    const visualCell = iVis >= 0 ? r[iVis] ?? "" : "";
    const onCell = iOn >= 0 ? r[iOn] ?? "" : "";
    const voCell = (r[iVo] ?? "").replace(/^["“]|["”]$/g, "");
    emit({
      scriptStart: parseClock(m[1]),
      scriptEnd: parseClock(m[2]),
      title: (iScene >= 0 ? r[iScene] : ci > 0 ? rest.slice(0, ci) : rest).trim(),
      visual: stripText([ci > 0 ? rest.slice(ci + 1) : "", visualCell].filter(Boolean).join(" ")),
      onscreen: [
        ...extractText(visualCell),
        ...onCell
          .split(/\n|;/)
          .map((x) => x.replace(/^Text\s*[:：]\s*/i, "").replace(/^["“]|["”]$/g, "").trim())
          .filter(Boolean),
      ],
      vo: voCell.replace(RE_VO, "$3").replace(/["“”]/g, "").replace(/\n/g, " ").trim(),
    });
  }
  return true;
}

function blocksToOutline(blocks: Exclude<Block, { kind: "table" }>[], raw: string): OutlineDoc {
  const title = blocks.find((b) => b.kind === "h")?.text ?? blocks[0]?.text ?? "Khóa học";
  const items: OutlineDoc["items"] = [];
  const objectives: string[] = [];
  let curItem: OutlineDoc["items"][number] | null = null;
  let inObjectives = false;
  for (const b of blocks) {
    if (b.text === title && b.kind === "h") continue;
    const isHead = b.kind === "h" || (b.kind === "p" && /[:：]$/.test(b.text) && b.text.length < 120);
    if (isHead) {
      inObjectives = /m[ụu]c\s*ti[êe]u/i.test(b.text);
      if (!inObjectives) {
        curItem = { heading: b.text.replace(/[:：]$/, ""), points: [], level: b.kind === "h" ? b.level : 3 };
        items.push(curItem);
      }
      continue;
    }
    if (inObjectives) objectives.push(b.text);
    else if (curItem) curItem.points.push(b.text);
    else {
      curItem = { heading: b.text, points: [], level: 3 };
      items.push(curItem);
    }
  }
  return { title, objectives, items, raw };
}

export async function parseDocx(buf: Buffer, opts: DocxParseOptions): Promise<ParseResult> {
  const blocks = await docxToBlocks(buf);
  return parseBlocks(blocks, opts);
}
