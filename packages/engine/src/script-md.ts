// SCRIPT.md – kịch bản dạng đọc được, có mốc câu thật (dùng chung cho cả hai bộ dựng).

import { formatClock, type Timing, type Video } from "@cvs/core";

const sec = (n: number) => `${n.toFixed(2)}s`;

export function scriptMarkdown(video: Video, timing: Timing, assumptions: Record<string, string[]> = {}): string {
  const lines: string[] = [];
  lines.push(`# ${video.key} – ${video.title}`, "");
  lines.push(`- Cấp độ: ${video.level} · Học phần: ${video.module} · Unit: ${video.unit}`);
  lines.push(`- Giọng: ${video.voice.provider.toUpperCase()} «${video.voice.voiceId}» × ${video.voice.speed} · Nhịp lead/gap/tail: ${video.pace.lead}/${video.pace.gap}/${video.pace.tail} s`);
  lines.push(`- Phong cách: ${video.style} · Bộ dựng: ${video.engine}`);
  lines.push(`- Tổng thời lượng: ${sec(timing.total)}${timing.estimated ? " (CÓ CẢNH ƯỚC TÍNH – chưa có giọng thật)" : ""}`);
  if (video.sources) lines.push(`- Nguồn: ${video.sources}`);
  lines.push("");
  video.scenes.forEach((s, i) => {
    const t = timing.scenes[i];
    lines.push(`## ${s.id} · ${s.title} (kịch bản ${formatClock(s.scriptStart)}–${formatClock(s.scriptEnd)}) · video ${sec(t.start)}–${sec(t.start + t.dur)}${t.estimated ? " · ước tính" : ""}`);
    lines.push("", `**Hình:** ${s.visual || "—"}`);
    if (s.onscreen.length) lines.push("", `**Chữ trên màn hình:** ${s.onscreen.map((o) => `«${o}»`).join(", ")}`);
    if (s.design) lines.push("", `**Thiết kế:** ${s.design.template} (${s.design.by})`);
    lines.push("", "| # | Mốc (trong cảnh) | Lời thoại | Cách đọc |", "|---|---|---|---|");
    s.sentences.forEach((x, k) => {
      lines.push(`| ${k + 1} | ${sec(t.cues[k] ?? 0)}–${sec(t.ends[k] ?? 0)} | ${x.text.replace(/\|/g, "\\|")} | ${x.tts === x.text ? "=" : x.tts.replace(/\|/g, "\\|")} |`);
    });
    const as = assumptions[s.id] ?? s.assumptions ?? [];
    if (as.length) lines.push("", "**Cần duyệt (AI/template tự quyết):**", ...as.map((a) => `- ⚠ ${a}`));
    lines.push("");
  });
  return lines.join("\n");
}
