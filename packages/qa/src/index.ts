// QA tự động (mục 7) – chặn xuất nếu không đạt.

import { DEFAULT_TERM_RULES, MAX_SILENCE, type TermRule, type Timing, type Video } from "@cvs/core";
import { buildSceneSpec, plain, type LayoutIssue } from "@cvs/engine";
import { probe, silenceDetect } from "@cvs/tts";

export type QaItem = { kind: "audio" | "layout" | "content" | "terms" | "vision" | "render" | "assumption"; severity: "error" | "warning" | "info"; scene?: string; message: string };

export type QaReport = {
  videoKey: string;
  ok: boolean;
  items: QaItem[];
  /** Mục "AI tự quyết" cần người duyệt (theo cảnh). */
  assumptions: Record<string, string[]>;
  sheet?: string;
  frames?: { file: string; label?: string; scene?: string }[];
  checkedAt: string;
};

/** Âm thanh: có luồng AAC, không có đoạn im lặng ≥ 2,5 s, thời lượng khớp timing (±0,2 s). */
export async function audioQa(file: string, timing: Timing): Promise<QaItem[]> {
  const items: QaItem[] = [];
  const info = await probe(file);
  if (!info.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac")) items.push({ kind: "audio", severity: "error", message: "Video không có luồng âm thanh AAC" });
  if (!info.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264" && s.width === 1920 && s.height === 1080)) items.push({ kind: "render", severity: "error", message: "Video không phải H.264 1920×1080" });
  if (Math.abs(info.duration - timing.total) > 0.2) items.push({ kind: "render", severity: "error", message: `Thời lượng ${info.duration.toFixed(2)} s lệch timing ${timing.total.toFixed(2)} s (> 0,2 s)` });
  const sil = await silenceDetect(file, -45, MAX_SILENCE);
  for (const s of sil) {
    const end = Number.isFinite(s.end) ? s.end : info.duration;
    const scene = timing.scenes.find((x) => s.start >= x.start && s.start < x.start + x.dur)?.id;
    items.push({ kind: "audio", severity: "error", scene, message: `Im lặng ${(end - s.start).toFixed(1)} s tại ${s.start.toFixed(1)} s (giới hạn ${MAX_SILENCE} s) – người nghe sẽ tưởng mất tiếng` });
  }
  if (timing.estimated) items.push({ kind: "audio", severity: "error", message: "Còn cảnh chưa có giọng thật (timing ước tính)" });
  return items;
}

const NUM_RE = /\d+(?:[.,]\d+)*/g;
const normNum = (s: string) => s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");

/** Nội dung: mọi con số/ngày/mã phiên bản trên màn hình phải có trong văn bản nguồn; thuật ngữ đúng glossary. */
export function contentQa(video: Video, termRules: TermRule[] = DEFAULT_TERM_RULES): QaItem[] {
  const items: QaItem[] = [];
  const source = [video.title, video.sources ?? "", video.context ?? "", ...video.scenes.flatMap((s) => [s.visual, ...s.onscreen, ...s.sentences.map((x) => x.text)])].join(" \n ");
  const srcNums = new Set((source.match(NUM_RE) ?? []).map(normNum));
  video.scenes.forEach((scene, i) => {
    const spec = buildSceneSpec(video, scene, { isLast: i === video.scenes.length - 1 });
    const texts = spec.texts.map(plain).join(" \n ");
    for (const n of new Set(texts.match(NUM_RE) ?? [])) {
      const nn = normNum(n);
      if (!srcNums.has(nn) && !/^\d$/.test(nn)) items.push({ kind: "content", severity: "error", scene: scene.id, message: `Số «${n}» trên màn hình không có trong tài liệu nguồn` });
    }
    for (const r of termRules)
      for (const w of r.wrong) {
        const re = new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u");
        if (re.test(texts)) items.push({ kind: "terms", severity: "warning", scene: scene.id, message: `Thuật ngữ «${w}» → dùng «${r.right}»${r.note ? ` (${r.note})` : ""}` });
      }
    if (spec.errors.length) for (const e of spec.errors) items.push({ kind: "content", severity: "error", scene: scene.id, message: e });
    if (spec.template === "draft") items.push({ kind: "content", severity: "warning", scene: scene.id, message: "Cảnh vẫn là BẢN NHÁP (chưa dựng hình)" });
  });
  return items;
}

export function layoutItems(layout: LayoutIssue[]): QaItem[] {
  const label: Record<LayoutIssue["kind"], string> = {
    "overflow-safe": "Tràn vùng an toàn",
    overlap: "Chữ chồng nhau",
    "small-text": "Chữ nhỏ hơn 28 px",
    "card-overflow": "Chữ tràn khỏi thẻ",
    clipped: "Chữ bị cắt",
  };
  return layout.map((l) => ({ kind: "layout" as const, severity: "error" as const, scene: l.scene, message: `${label[l.kind]} (${l.id}) lúc ${l.t.toFixed(1)} s – ${l.detail}` }));
}

export function makeReport(videoKey: string, items: QaItem[], assumptions: Record<string, string[]>, extra: Partial<QaReport> = {}): QaReport {
  return { videoKey, ok: !items.some((i) => i.severity === "error"), items, assumptions, checkedAt: new Date().toISOString(), ...extra };
}
