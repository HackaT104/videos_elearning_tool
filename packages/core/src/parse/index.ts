import { parseDocx, type DocxParseOptions } from "./docx";
import { parseXlsx, type XlsxParseOptions } from "./xlsx";
import type { ParseResult } from "../types";

/** Bóc một file đầu vào theo phần mở rộng (.docx / .xlsx). */
export async function parseInputFile(fileName: string, buf: Buffer, opts: DocxParseOptions & XlsxParseOptions): Promise<ParseResult> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) return parseDocx(buf, { ...opts, fileName });
  if (lower.endsWith(".xlsx")) return parseXlsx(buf, { ...opts, fileName });
  throw new Error(`Định dạng không hỗ trợ: ${fileName} (chỉ .docx, .xlsx)`);
}
