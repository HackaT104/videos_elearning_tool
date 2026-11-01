// Bước 1–2: tải file lên, bóc, lưu video vào dự án; cảnh báo trùng tên giữa các cấp độ; video còn thiếu.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findCrossLevelDuplicates, parseInputFile, renormalizeVideo, sanitizeCode, type ColumnMap, type ParseResult } from "@cvs/core";
import { addFile, getProject, glossaryFor, listVideos, paths, upsertVideo, getVideo } from "@cvs/db";

export type IngestResult = { fileId: string; result: ParseResult };

export async function ingestFile(projectId: string, name: string, buf: Buffer, level: string, columnMaps?: Record<string, ColumnMap>): Promise<IngestResult> {
  const p = getProject(projectId);
  if (!p) throw new Error("Không tìm thấy dự án");
  const safe = `${Date.now()}_${sanitizeCode(name.replace(/\.(docx|xlsx)$/i, ""))}${name.match(/\.(docx|xlsx)$/i)?.[0].toLowerCase() ?? ""}`;
  writeFileSync(join(paths.source(projectId), safe), buf);
  const result = await parseInputFile(name, buf, {
    course: p.course,
    level,
    style: p.settings.style,
    engine: p.settings.engine,
    provider: p.settings.provider,
    normalize: { glossary: glossaryFor(projectId) },
    columnMaps,
  });
  const summary = { kind: result.kind, videos: result.videos.map((v) => v.key), warnings: result.warnings, outline: result.outline, topic: result.topic, stored: safe };
  const f = addFile(projectId, name, level, result.kind, summary);
  for (const v of result.videos) {
    if (p.settings.font) v.font = p.settings.font;
    const existing = getVideo(projectId, v.key);
    // giữ thiết kế/ghi chú cũ nếu cảnh có cùng lời thoại
    if (existing) {
      v.scenes.forEach((s) => {
        const old = existing.data.scenes.find((o) => o.id === s.id && o.sentences.map((x) => x.text).join() === s.sentences.map((x) => x.text).join());
        if (old) {
          s.design = old.design;
          s.notes = old.notes;
          s.sentences = old.sentences;
        }
      });
      v.voice = existing.data.voice;
      v.pace = existing.data.pace;
      v.style = existing.data.style;
      v.font = existing.data.font;
      v.engine = existing.data.engine;
    }
    upsertVideo(projectId, v, { file_id: f.id, status: existing?.status ?? "script" });
  }
  return { fileId: f.id, result };
}

export function crossLevelWarnings(projectId: string): string[] {
  return findCrossLevelDuplicates(listVideos(projectId).map((v) => ({ level: v.level, base: `${v.data.module}_${v.data.unit}_${v.data.seq}` })));
}

/** Chạy lại chuẩn hóa cách đọc cho mọi video (sau khi sửa glossary). */
export function renormalizeProject(projectId: string) {
  const g = glossaryFor(projectId);
  for (const v of listVideos(projectId)) upsertVideo(projectId, renormalizeVideo(v.data, { glossary: g }));
}
