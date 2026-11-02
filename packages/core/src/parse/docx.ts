// Bóc Word (.docx) – mục 3.2. mammoth (docx → HTML) giữ tiêu đề, danh sách, bảng.

import mammoth from "mammoth";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { parseClock } from "../codes";
import { buildVideo, type ProjectDefaults, type RawScene, type RawVideo } from "../factory";
import type { DocUnit, OutlineDoc, ParseResult } from "../types";

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
const RE_TYPE = /^Lo[ạa]i\s*[:：]\s*(.+)$/i;
const RE_UNIT = /^unit_number\s*[:：]\s*(.+)$/i;
const RE_UNIT_META = /^(duration|section_\d+_type)\s*[:：]\s*(.*)$/i;
const RE_TITLE = /^(Ti[êe]u\s*đ[ềe]|T[êe]n\s*video|Title)\s*[:：]\s*(.+)$/i;
const RE_VO = /^(Gi[ọo]ng\s*đ[ọo]c|L[ờo]i\s*tho[ạa]i|L[ờo]i\s*b[ìi]nh|Voice[\s-]*over|VO(?![A-Za-z]))\s*(\((?:Voice[\s-]*over|VO)\))?\s*[:：]?\s*(.*)$/i;
const RE_VISUAL = /^(H[ìi]nh\s*[ảa]nh|Visual|M[ôo]\s*t[ảa]\s*h[ìi]nh)\s*[:：]\s*(.*)$/i;
const RE_SOURCE = /^(Ngu[ồo]n(?:\s*tham\s*kh[ảa]o)?|Sources?)\s*[:：]\s*(.*)$/i;
// Text: "a" / "b" → hai mục chữ trên màn hình; "Text lớn:", "Text nhỏ:" cũng nhận
const RE_TEXT = /\bText(?:\s+[^\s:："“]{1,8})?\s*[:：]\s*((?:["“][^"”]+["”](?:\s*\/\s*)?)+)/gi;
const RE_TEXT_NOQUOTE = /^Text\s*[:：]\s*([^"“].*)$/i;
const RE_OBJECTIVES = /^m[ụu]c\s*ti[êe]u/i;
// khối không phải nội dung đọc (câu hỏi, danh mục tài liệu) – không đưa vào ngữ cảnh
const RE_SKIP_TYPE = /quiz|tr[ắa]c\s*nghi[ệe]m|ch[ọo]n\s*nhi[ềe]u|đ[úu]ng\s*[-–]?\s*sai|đi[ềe]n\s*ch[ỗo]|t[àa]i\s*li[ệe]u\s*tham\s*kh[ảa]o/i;
const RE_IMAGE_TYPE = /[ảa]nh|h[ìi]nh|infographic/i;
const SOURCES_CAP = 500;
const CONTEXT_CAP = 6000;

type SceneAcc = RawScene & { voMode: boolean; voOpen: boolean };

export type DocxParseOptions = ProjectDefaults & { fileName?: string };

const stripNum = (s: string) => s.replace(/^\d+(?:\.\d+)*[.)]\s+/, "").trim();
export const blockText = (b: Block) => (b.kind === "table" ? b.rows.map((r) => r.join(" | ")).join("\n") : b.text);
/** Tiêu đề mục lớn (h1/h2) – ranh giới mục và kết thúc khối video. */
const isSection = (b: Block) => b.kind === "h" && b.level <= 2;

/** Bóc danh sách khối thành kết quả (script / outline / topic). */
export function parseBlocks(blocks: Block[], opts: DocxParseOptions): ParseResult {
  const warnings: string[] = [];
  const raws: (RawVideo & { start: number; unit: number })[] = [];
  const units: DocUnit[] = [];
  const n = blocks.length;
  // nhãn từng khối: bài (unit), mục, đã thuộc video, bỏ khỏi ngữ cảnh, mục tiêu học tập
  const unitOf = new Array<number>(n).fill(-1);
  const sectionOf = new Array<number>(n).fill(0);
  const used = new Array<boolean>(n).fill(false);
  const skip = new Array<boolean>(n).fill(false);
  const objective = new Array<boolean>(n).fill(false);
  const imageNote = new Array<boolean>(n).fill(false);
  const unitTitleIdx = new Set<number>();
  let cur: (RawVideo & { start: number; unit: number }) | null = null;
  let scene: SceneAcc | null = null;
  let bi = 0;
  let unit = -1;
  let section = 0;
  let lastHeading = -1;
  let firstHeading = "";
  let curType = "";
  let inObjectives = false;
  let sourceList = false;

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
      if (cur.scenes.length > 0) raws.push(cur);
      else if (cur.fileName) warnings.push(`Video "${cur.fileName}" không có cảnh nào có mốc thời gian.`);
    }
    cur = null;
    sourceList = false;
  };
  const ensureVideo = () => {
    if (!cur) cur = { title: "", scenes: [], start: bi, unit };
    return cur;
  };
  const startsNewVideo = (field: "fileName" | "title" | "type") => {
    if (!cur) return true;
    if (cur.scenes.length > 0 || scene) return true;
    if (field === "fileName" && cur.fileName) return true;
    return false;
  };

  /** Trả true khi dòng thuộc video (đánh dấu để không lặp vào ngữ cảnh). */
  const handleLine = (line: string, kind: Block["kind"] = "p"): boolean => {
    let m: RegExpMatchArray | null;
    if (RE_TYPE_VIDEO.test(line)) {
      if (startsNewVideo("type")) {
        closeVideo();
        ensureVideo();
      }
      return true;
    }
    if ((m = line.match(RE_FILENAME))) {
      if (startsNewVideo("fileName")) closeVideo();
      ensureVideo().fileName = m[1].trim();
      return true;
    }
    if ((m = line.match(RE_SCRIPT))) {
      if (cur && (cur.scenes.length > 0 || scene)) closeVideo();
      const v = ensureVideo();
      if (m[2]) v.title = m[2].trim();
      return true;
    }
    if (RE_TYPE.test(line)) {
      // khối nội dung khác (Ảnh, Quiz, Lưu ý…) → hết video
      closeVideo();
      return false;
    }
    if ((m = line.match(RE_TITLE)) && cur && !scene) {
      cur.title = m[2].trim();
      return true;
    }
    if ((m = line.match(RE_SCENE))) {
      closeScene();
      ensureVideo();
      sourceList = false;
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
      return true;
    }
    if (!cur) return false;
    if ((m = line.match(RE_SOURCE)) && (cur.scenes.length > 0 || scene)) {
      // "Nguồn:" chỉ là đoạn của nó (trống → nhận danh sách ngay sau)
      closeScene();
      cur.sources = [cur.sources, m[2].trim()].filter(Boolean).join("; ").slice(0, SOURCES_CAP);
      sourceList = !m[2].trim();
      return true;
    }
    if (sourceList && !scene && (kind === "li" || /^([-•*]|\d+[.)]|\[\d+\])\s/.test(line))) {
      cur.sources = [cur.sources, line.replace(/^[-•*]\s*/, "")].filter(Boolean).join("; ").slice(0, SOURCES_CAP);
      return true;
    }
    sourceList = false;
    if (!scene) return false;
    const sc: SceneAcc = scene;
    if ((m = line.match(RE_VO))) {
      sc.voMode = true;
      takeVo(sc, m[3]);
      return true;
    }
    if ((m = line.match(RE_VISUAL))) {
      sc.voMode = false;
      sc.visual = [sc.visual, stripText(m[2])].filter(Boolean).join(" ");
      sc.onscreen.push(...extractText(m[2]));
      return true;
    }
    if ((m = line.match(RE_TEXT_NOQUOTE))) {
      sc.onscreen.push(m[1].trim());
      return true;
    }
    // đoạn trong ngoặc kép ngay sau mốc cảnh = lời thoại (kể cả khi không có nhãn "Giọng đọc")
    if ((sc.voMode && (sc.voOpen || !/[:：]$/.test(line))) || (!sc.voOpen && /^["“]/.test(line))) {
      sc.voMode = true;
      takeVo(sc, line);
      return true;
    }
    const texts = extractText(line);
    if (texts.length) sc.onscreen.push(...texts);
    const rest = stripText(line);
    if (rest) sc.visual = [sc.visual, rest].filter(Boolean).join(" ");
    return true;
  };

  for (bi = 0; bi < n; bi++) {
    const b = blocks[bi];
    if (b.kind === "table") {
      unitOf[bi] = unit;
      sectionOf[bi] = section;
      skip[bi] = RE_SKIP_TYPE.test(curType);
      imageNote[bi] = RE_IMAGE_TYPE.test(curType);
      used[bi] = handleTable(b.rows, (s) => {
        closeScene();
        ensureVideo().scenes.push(s);
      });
      continue;
    }
    const um = b.text.match(RE_UNIT);
    if (um) {
      // đầu bài: tiêu đề bài là tiêu đề ngay trước "unit_number"
      closeVideo();
      const first = lastHeading >= 0 && unitOf[lastHeading] === unit && !unitTitleIdx.has(lastHeading) ? lastHeading : bi;
      unit = units.length;
      section++;
      units.push({ number: um[1].trim(), title: first < bi ? stripNum(blockText(blocks[first])) : "" });
      if (first < bi) unitTitleIdx.add(first);
      for (let k = first; k <= bi; k++) (unitOf[k] = unit), (sectionOf[k] = section), (skip[k] = true);
      curType = "";
      inObjectives = false;
      continue;
    }
    const meta = b.text.match(RE_UNIT_META);
    if (meta && unit >= 0 && !cur) {
      if (/^duration/i.test(meta[1])) units[unit].duration = meta[2].trim();
      else units[unit].sectionType = [units[unit].sectionType, meta[2].trim()].filter(Boolean).join("; ");
      unitOf[bi] = unit;
      sectionOf[bi] = section;
      skip[bi] = true;
      continue;
    }
    // tiêu đề mang nội dung kịch bản (mốc cảnh, "SCRIPT VIDEO", "Nguồn:"…) hoặc nằm giữa lời thoại đang mở → xử lý như đoạn văn
    const t = b.text;
    const special =
      [RE_SCENE, RE_SCRIPT, RE_FILENAME, RE_TYPE].some((re) => re.test(t)) ||
      (!!cur && [RE_TITLE, RE_SOURCE, RE_VO, RE_VISUAL].some((re) => re.test(t))) ||
      !!(scene as SceneAcc | null)?.voOpen;
    if (b.kind === "h" && !special) {
      if (scene) {
        // mục mới kết thúc video; tiêu đề phụ chỉ kết thúc cảnh
        if (isSection(b) || /^\d+(?:\.\d+)*[.)]\s/.test(b.text)) closeVideo();
        else closeScene();
      } else if ((cur as RawVideo | null)?.scenes.length && isSection(b)) closeVideo();
      if (isSection(b)) {
        section++;
        curType = "";
      }
      firstHeading ||= b.text;
      lastHeading = bi;
      inObjectives = RE_OBJECTIVES.test(b.text);
      unitOf[bi] = unit;
      sectionOf[bi] = section;
      skip[bi] = isSection(b) || RE_SKIP_TYPE.test(curType); // tiêu đề mục được thêm lại theo mục khi dựng ngữ cảnh
      imageNote[bi] = RE_IMAGE_TYPE.test(curType);
      continue;
    }
    unitOf[bi] = unit;
    sectionOf[bi] = section;
    const tm = b.text.match(RE_TYPE);
    if (tm) {
      curType = tm[1];
      inObjectives = false;
    }
    if (RE_OBJECTIVES.test(b.text)) inObjectives = true;
    else if (/^T[ừu]\s*kh[óo]a/i.test(b.text)) inObjectives = false;
    else objective[bi] = inObjectives;
    used[bi] = handleLine(b.text, b.kind);
    skip[bi] = !!tm || RE_SKIP_TYPE.test(curType) || /^T[êe]n\s*file\s*[ảa]nh/i.test(b.text);
    imageNote[bi] = RE_IMAGE_TYPE.test(curType);
  }
  closeVideo();

  /** Tiêu đề video khi kịch bản không ghi: tiêu đề ngay trước khối video → mục đánh số gần nhất cùng bài → tên bài. */
  const titleFor = (r: { start: number; unit: number }) => {
    const prev = blocks[r.start - 1];
    if (prev?.kind === "h" && unitOf[r.start - 1] === r.unit && !unitTitleIdx.has(r.start - 1)) return stripNum(prev.text);
    for (let k = r.start - 1; k >= 0 && unitOf[k] === r.unit; k--) {
      const h = blocks[k];
      if (h.kind === "h" && !unitTitleIdx.has(k) && (isSection(h) || /^\d+(?:\.\d+)*[.)]\s/.test(h.text))) return stripNum(h.text);
    }
    return units[r.unit]?.title || firstHeading;
  };

  /** Ngữ cảnh ≤ CONTEXT_CAP: mục tiêu của bài + nội dung cùng mục (gần video trước) + phần còn lại của bài. Không bao giờ cả tài liệu. */
  const contextFor = (r: { start: number; unit: number }) => {
    const sec = sectionOf[r.start];
    const ok = (k: number) => unitOf[k] === r.unit && !used[k] && !skip[k];
    const byDist = (a: number, b: number) => Math.abs(a - r.start) - Math.abs(b - r.start);
    const idx = [...Array(n).keys()].filter(ok);
    // ưu tiên: mục tiêu → bài đọc cùng mục → bài đọc mục khác (gần trước) → ghi chú dựng ảnh
    const rank = (k: number) => (objective[k] ? 0 : imageNote[k] ? (sectionOf[k] === sec ? 3 : 4) : sectionOf[k] === sec ? 1 : 2);
    const order = idx.sort((a, b) => rank(a) - rank(b) || byDist(a, b));
    const pick: number[] = [];
    let len = 0;
    for (const k of order) {
      const t = blockText(blocks[k]);
      if (len + Math.min(t.length, 1500) > CONTEXT_CAP - 400) continue;
      pick.push(k);
      len += Math.min(t.length, 1500) + 1;
    }
    pick.sort((a, b) => a - b);
    const out: string[] = [];
    let lastSec = -1;
    for (const k of pick) {
      if (sectionOf[k] !== lastSec) {
        lastSec = sectionOf[k];
        let h = k;
        while (h >= 0 && sectionOf[h] === lastSec && !(isSection(blocks[h]) && !unitTitleIdx.has(h))) h--;
        if (h >= 0 && sectionOf[h] === lastSec) out.push(`## ${blockText(blocks[h])}`);
      }
      const t = blockText(blocks[k]);
      out.push(t.length > 1500 ? `${t.slice(0, 1500)}…` : t);
    }
    return out.join("\n").slice(0, CONTEXT_CAP);
  };

  /** Video không ghi "Nguồn:" riêng → dòng "Nguồn:" đầu tiên sau nó trong cùng mục (trước video kế tiếp). */
  const sourceAfter = (r: { start: number }, next?: { start: number }) => {
    for (let k = r.start + 1; k < (next?.start ?? n) && sectionOf[k] === sectionOf[r.start]; k++) {
      const b = blocks[k];
      const m = !used[k] && b.kind !== "table" ? b.text.match(RE_SOURCE) : null;
      if (m?.[2].trim()) return m[2].trim().slice(0, SOURCES_CAP);
    }
    return undefined;
  };

  raws.forEach((r, i) => {
    r.title ||= titleFor(r);
    r.context = contextFor(r);
    r.sources ||= sourceAfter(r, raws[i + 1]);
  });
  const videos = raws.map((r, i) => buildVideo(r, opts, i));
  raws.forEach((r, i) => r.unit >= 0 && (units[r.unit].videos ??= []).push(videos[i].key));
  for (const v of videos) {
    v.scenes.forEach((s) => {
      if (s.sentences.length === 0) warnings.push(`${v.key} · ${s.id} (${s.title}): không tìm thấy lời thoại.`);
    });
  }
  if (videos.length > 0 && videos.some((v) => v.scenes.some((s) => s.sentences.length > 0))) {
    return { kind: "script", fileName: opts.fileName ?? "", videos, warnings, ...(units.length ? { units } : {}) };
  }
  const textBlocks = blocks.filter((b): b is Exclude<Block, { kind: "table" }> => b.kind !== "table");
  const structured = textBlocks.filter((b) => b.kind === "h" || b.kind === "li").length;
  const raw = blocks.map(blockText).join("\n");
  if (structured >= 3) {
    return { kind: "outline", fileName: opts.fileName ?? "", videos: [], outline: blocksToOutline(textBlocks, raw), warnings, ...(units.length ? { units } : {}) };
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
  return [...s.matchAll(RE_TEXT)].flatMap((m) => [...m[1].matchAll(/["“]([^"”]+)["”]/g)].map((q) => q[1].trim()));
}
function stripText(s: string): string {
  // bỏ "Text: …" rồi dọn dấu câu còn sót (". ." → ".")
  return s.replace(RE_TEXT, "").replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").replace(/([.;])[.\s]*\./g, "$1").trim();
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

/**
 * Bản rút gọn tài liệu cho Claude đọc và phân tích (giữ dưới `budget` ký tự): tiêu đề, đầu bài (unit_number…), dòng "Loại:",
 * khối video in ĐẦY ĐỦ (mốc cảnh, lời thoại, Nguồn), đoạn khác chỉ in đoạn đầu sau mỗi tiêu đề/"Loại:" (cắt ngắn) kèm số đoạn bỏ qua.
 */
export function docDigest(blocks: Block[], budget = 60000): string {
  const build = (excerpt: number) => {
    const out: string[] = [];
    let inVideo = false;
    let firstAfterHead = true;
    let skipped = 0;
    let quiz = false;
    let obj = false;
    const flush = () => {
      if (skipped) out.push(`  … (+${skipped} đoạn)`);
      skipped = 0;
    };
    for (const b of blocks) {
      const t = blockText(b);
      if (b.kind === "h") {
        flush();
        if (isSection(b)) inVideo = false;
        out.push(`${"#".repeat(Math.min(b.level, 4))} ${t}`);
        firstAfterHead = true;
        quiz = false;
        obj = RE_OBJECTIVES.test(t);
        continue;
      }
      const tm = b.kind !== "table" ? b.text.match(RE_TYPE) : null;
      if (tm || (b.kind !== "table" && (RE_UNIT.test(b.text) || RE_UNIT_META.test(b.text)))) {
        flush();
        if (tm) {
          inVideo = RE_TYPE_VIDEO.test(t);
          quiz = RE_SKIP_TYPE.test(tm[1]);
          firstAfterHead = true;
        }
        out.push(t);
        continue;
      }
      if (b.kind !== "table" && [RE_FILENAME, RE_SCRIPT, RE_SCENE].some((re) => re.test(b.text))) inVideo = true;
      if (b.kind !== "table" && RE_OBJECTIVES.test(b.text)) obj = true;
      else if (b.kind !== "table" && /^T[ừu]\s*kh[óo]a/i.test(b.text)) obj = false;
      if (inVideo || obj) {
        // khối video và mục tiêu học tập: in đầy đủ
        flush();
        out.push(t);
        continue;
      }
      if (quiz || !firstAfterHead || !excerpt) {
        skipped++;
        continue;
      }
      firstAfterHead = false;
      const one = b.kind === "table" ? `[Bảng ${b.rows.length} hàng] ${b.rows.slice(0, 2).map((r) => r.join(" | ")).join(" / ")}` : t;
      out.push(one.length > excerpt ? `${one.slice(0, excerpt)}…` : one);
    }
    flush();
    return out.join("\n");
  };
  for (const ex of [240, 120, 0]) {
    const d = build(ex);
    if (d.length <= budget) return d;
  }
  return `${build(0).slice(0, budget)}\n… (tài liệu dài – đã cắt bớt)`;
}
