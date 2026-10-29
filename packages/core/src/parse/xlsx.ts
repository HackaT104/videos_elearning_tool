// Bóc Excel (.xlsx) – mục 3.3. Mẫu cột:
// Mã video | Tiêu đề | Cảnh | Bắt đầu | Kết thúc | Mô tả hình | Chữ trên màn hình | Lời thoại | Ghi chú
// Tiêu đề cột khác → người dùng ghép cột trên giao diện (columnMap).

import ExcelJS from "exceljs";
import { parseClock } from "../codes";
import { buildVideo, type ProjectDefaults, type RawVideo } from "../factory";
import type { ParseResult } from "../types";

export const XLSX_FIELDS = ["code", "title", "scene", "start", "end", "visual", "onscreen", "vo", "notes"] as const;
export type XlsxField = (typeof XLSX_FIELDS)[number];
export type ColumnMap = Partial<Record<XlsxField, number>>; // chỉ số cột (1-based)

export const XLSX_FIELD_LABELS: Record<XlsxField, string> = {
  code: "Mã video",
  title: "Tiêu đề",
  scene: "Cảnh",
  start: "Bắt đầu",
  end: "Kết thúc",
  visual: "Mô tả hình",
  onscreen: "Chữ trên màn hình",
  vo: "Lời thoại",
  notes: "Ghi chú",
};

const SYNONYMS: Record<XlsxField, RegExp> = {
  code: /^video$|m[ãa]\s*video|t[êe]n\s*file|file|video\s*(id|code)|^m[ãa]$/i,
  title: /ti[êe]u\s*đ[ềe]|title|t[êe]n\s*video/i,
  scene: /^c[ảa]nh|scene|t[êe]n\s*c[ảa]nh/i,
  start: /b[ắa]t\s*đ[ầa]u|start|t[ừu]$/i,
  end: /k[ếe]t\s*th[úu]c|end|đ[ếe]n$/i,
  visual: /m[ôo]\s*t[ảa]\s*h[ìi]nh|h[ìi]nh\s*[ảa]nh|visual/i,
  onscreen: /ch[ữu].*m[àa]n\s*h[ìi]nh|on[\s-]*screen|^text$|ch[ữu]\s*hi[ểe]n/i,
  vo: /l[ờo]i\s*tho[ạa]i|gi[ọo]ng\s*đ[ọo]c|voice|^vo$|l[ờo]i\s*b[ìi]nh/i,
  notes: /ghi\s*ch[úu]|note/i,
};

export type SheetHeaders = { sheet: string; headerRow: number; headers: string[]; auto: ColumnMap; missing: XlsxField[] };

function cellString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return cellString(v.result as ExcelJS.CellValue);
  }
  return String(v);
}

/** Thời gian trong ô: "0:30", 30, 0.000347 (phân số ngày) hoặc Date (Excel hiểu "0:30" là 0 giờ 30 phút). */
export function cellSeconds(v: ExcelJS.CellValue): number {
  if (v == null || v === "") return NaN;
  if (v instanceof Date) {
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    const s = v.getUTCSeconds();
    // Người viết kịch bản gõ "m:ss" nhưng Excel lưu thành "h:mm" → đổi lại khi giây = 0.
    return s === 0 ? h * 60 + m : h * 3600 + m * 60 + s;
  }
  if (typeof v === "number") {
    if (v > 0 && v < 1) {
      const total = Math.round(v * 86400);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return s === 0 ? h * 60 + m : total;
    }
    return v;
  }
  const s = cellString(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return parseClock(s.replace(/[[\]]/g, ""));
}

function autoMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  // thứ tự ưu tiên: các cột dễ nhầm (onscreen trước visual, vo trước title)
  for (const f of ["onscreen", "vo", "code", "title", "scene", "start", "end", "visual", "notes"] as XlsxField[]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && h && SYNONYMS[f].test(h.trim()));
    if (i >= 0) {
      map[f] = i + 1;
      used.add(i);
    }
  }
  return map;
}

async function loadWorkbook(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

function findHeaderRow(ws: ExcelJS.Worksheet): { row: number; headers: string[] } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const row = ws.getRow(r);
    const headers: string[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) headers.push(cellString(row.getCell(c).value).trim());
    const hits = Object.keys(autoMap(headers)).length;
    if (hits >= 3) return { row: r, headers };
  }
  return null;
}

/** Đọc tiêu đề cột từng sheet và gợi ý ghép cột (cho màn hình ghép cột). */
export async function readXlsxHeaders(buf: Buffer): Promise<SheetHeaders[]> {
  const wb = await loadWorkbook(buf);
  const out: SheetHeaders[] = [];
  wb.eachSheet((ws) => {
    const h = findHeaderRow(ws);
    const headers = h?.headers ?? [];
    const auto = autoMap(headers);
    const missing = (["vo", "start"] as XlsxField[]).filter((f) => !auto[f]);
    out.push({ sheet: ws.name, headerRow: h?.row ?? 1, headers, auto, missing });
  });
  return out;
}

export type XlsxParseOptions = ProjectDefaults & {
  fileName?: string;
  /** Ghép cột theo sheet (tên sheet → map); mặc định tự nhận diện. */
  columnMaps?: Record<string, ColumnMap>;
};

export async function parseXlsx(buf: Buffer, opts: XlsxParseOptions): Promise<ParseResult> {
  const wb = await loadWorkbook(buf);
  const warnings: string[] = [];
  const raws: RawVideo[] = [];
  wb.eachSheet((ws) => {
    const h = findHeaderRow(ws);
    if (!h) {
      warnings.push(`Sheet "${ws.name}": không tìm thấy hàng tiêu đề cột.`);
      return;
    }
    const map = { ...autoMap(h.headers), ...(opts.columnMaps?.[ws.name] ?? {}) };
    if (!map.vo) {
      warnings.push(`Sheet "${ws.name}": thiếu cột Lời thoại – hãy ghép cột.`);
      return;
    }
    const sheetModule = /^M[O0]?\d+$/i.test(ws.name.trim()) ? ws.name.trim().toUpperCase().replace(/^M0/, "MO") : "";
    const byCode = new Map<string, RawVideo>();
    let lastCode = "";
    let lastTitle = "";
    for (let r = h.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (f: XlsxField) => (map[f] ? row.getCell(map[f]!).value : null);
      const vo = cellString(get("vo")).trim();
      const visual = cellString(get("visual")).trim();
      const code = cellString(get("code")).trim() || lastCode;
      const title = cellString(get("title")).trim() || (code === lastCode ? lastTitle : "");
      if (!vo && !visual) continue;
      if (!code) {
        warnings.push(`Sheet "${ws.name}" hàng ${r}: thiếu mã video.`);
        continue;
      }
      lastCode = code;
      lastTitle = title;
      if (!byCode.has(code)) {
        const v: RawVideo = { fileName: code, code, title, scenes: [], module: sheetModule };
        byCode.set(code, v);
        raws.push(v);
      }
      const v = byCode.get(code)!;
      if (!v.title && title) v.title = title;
      const start = cellSeconds(get("start"));
      const end = cellSeconds(get("end"));
      const prevEnd = v.scenes.at(-1)?.scriptEnd ?? 0;
      const notes = cellString(get("notes")).trim();
      if (/^ngu[ồo]n\s*[:：]/i.test(notes)) v.sources = notes.replace(/^ngu[ồo]n\s*[:：]\s*/i, "");
      else if (notes) v.context = [v.context, notes].filter(Boolean).join("\n");
      v.scenes.push({
        scriptStart: Number.isFinite(start) ? start : prevEnd,
        scriptEnd: Number.isFinite(end) ? end : Number.isFinite(start) ? start : prevEnd,
        title: cellString(get("scene")).trim() || `Cảnh ${v.scenes.length + 1}`,
        visual,
        onscreen: cellString(get("onscreen"))
          .split(/\n|;/)
          .map((x) => x.replace(/^Text\s*[:：]\s*/i, "").replace(/^["“]|["”]$/g, "").trim())
          .filter(Boolean),
        vo: vo.replace(/^["“]|["”]$/g, ""),
      });
    }
  });
  const videos = raws.map((r, i) => buildVideo(r, opts, i));
  return { kind: videos.length ? "script" : "topic", fileName: opts.fileName ?? "", videos, warnings };
}
