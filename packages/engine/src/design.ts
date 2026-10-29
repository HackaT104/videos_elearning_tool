// Thiết kế cảnh tự động (không cần LLM): chọn template theo mô tả hình + chữ trên màn hình, chỉ dùng chữ có trong kịch bản.
// LLM (packages/ai) thay thế bước này bằng thiết kế chi tiết hơn; người dùng duyệt.

import type { Scene, SceneDesign, Video } from "@cvs/core";
import { guessIcon } from "./icons";
import { parseViNumber } from "./text";

const splitItems = (s: string) =>
  s
    .split(/\s*(?:→|->|⇒|➜|;|\|)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

function items(scene: Scene): string[] {
  const out: string[] = [];
  for (const o of scene.onscreen) out.push(...splitItems(o));
  return out;
}

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

export function autoDesign(video: Video, scene: Scene, index: number): SceneDesign {
  const vis = `${scene.title} ${scene.visual}`;
  const its = items(scene);
  const n = scene.sentences.length;
  const isLast = index === video.scenes.length - 1 && index > 0;
  const d = (template: string, params: Record<string, unknown>): SceneDesign => ({ template, params, by: "auto" });
  const chain = scene.onscreen.some((o) => /→|->|⇒/.test(o));

  if (index === 0 && !has(vis, /so sánh|bước|quy trình|chuỗi/)) {
    const title = scene.onscreen[0] ?? video.title;
    const sub = scene.onscreen[1] ?? (scene.onscreen[0] && scene.onscreen[0] !== video.title ? undefined : undefined);
    return d("title-card", { title, subtitle: sub, icon: guessIcon(`${title} ${scene.visual}`) });
  }
  if (its.length >= 2 && has(vis, /so sánh|bên trái|bên phải|đối lập|khác nhau|\bvs\b|hai cột|trước.*sau/)) {
    return d("split-compare", {
      left: { label: its[0], icon: guessIcon(its[0]), tone: "alt" },
      right: { label: its[1], icon: guessIcon(its[1]), tone: "accent" },
    });
  }
  // số lớn
  const statSrc = scene.onscreen.find((o) => /^\s*[~≈]?\d[\d.,]*\s*\S{0,12}\s*$/.test(o) || /^\s*[~≈]?\d[\d.,]*\s*(%|°C|ppm|ha|tấn|triệu|tỷ|nghìn)/i.test(o));
  if (statSrc && (has(vis, /số|con số|đếm|thống kê/) || scene.onscreen.length === 1)) {
    const v = parseViNumber(statSrc);
    if (v !== null) {
      const m = statSrc.match(/^\s*[~≈]?\d[\d.,]*\s*(.*)$/)!;
      const rest = m[1].trim();
      const pct = rest.startsWith("%");
      const dec = /,(\d+)/.exec(statSrc)?.[1]?.length ?? 0;
      const caption = scene.onscreen.find((o) => o !== statSrc) ?? scene.title;
      return d("stat-hero", { value: v, decimals: dec, suffix: pct ? "%" : rest.startsWith("°") ? rest : undefined, unit: !pct && !rest.startsWith("°") && rest ? rest : undefined, caption });
    }
  }
  if (its.length >= 3 && has(vis, /bước|quy trình|trình tự|tiến trình/) && !chain) {
    return d("process-steps", { steps: its.slice(0, 6).map((t) => ({ title: t })) });
  }
  if (its.length >= 2 && (chain || has(vis, /chuỗi|mũi tên|luồng|chu trình|bước/))) {
    return d("flow-chain", { steps: its.slice(0, 5).map((t) => ({ label: t, icon: guessIcon(t) })) });
  }
  if (its.length >= 2 && its.every((t) => /\b(19|20)\d{2}\b/.test(t)) && has(vis, /mốc|năm|lịch sử|dòng thời gian|thời gian/)) {
    return d("timeline-run", { points: its.slice(0, 6).map((t) => ({ label: t.match(/\b(19|20)\d{2}\b/)![0], text: t.replace(/\b(19|20)\d{2}\b\s*[:\-–]?\s*/, "") || t })) });
  }
  if (its.length >= 2 && has(vis, /tài liệu|hồ sơ|biến thành|chuyển thành|báo cáo/)) {
    return d("document-transform", { from: { title: its[0], lines: [] }, to: { title: its[1], lines: [] } });
  }
  if (its.length >= 2 && has(vis, /điều kiện|yêu cầu|tiêu chí|danh sách|kiểm tra/)) {
    return d("checklist", { items: its.slice(0, 6).map((t) => ({ text: t })) });
  }
  if (its.length >= 2 && its.length <= 4) {
    return d("icon-grid", { items: its.map((t) => ({ title: t, icon: guessIcon(t) })) });
  }
  if (scene.onscreen.length === 1) {
    return d("quote-banner", { quote: scene.onscreen[0], kicker: isLast ? undefined : undefined });
  }
  if (isLast && n > 0) {
    return { template: "quote-banner", params: { quote: scene.sentences[n - 1].text }, by: "auto" };
  }
  return d("draft", {});
}
