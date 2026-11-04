// "Nguy cơ giống trình chiếu": soát sự đa dạng của thiết kế cảnh trước khi dựng (chỉ cảnh báo, không chặn).

import type { Timing, Video } from "@cvs/core";
import { buildSceneSpec } from "@cvs/engine";
import type { QaItem } from "./index";

/** Template chủ yếu là chữ (không sơ đồ / số liệu / hình). */
export const TEXT_TEMPLATES = new Set(["title-card", "quote-banner", "kinetic-statement", "term-define", "module-divider", "checklist", "draft"]);
export const VARIETY = { maxShare: 0.4, maxTextShare: 0.5, longScene: 20, minAnimated: 4, minScenes: 4 };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Template hiệu lực từng cảnh + số phần tử có chuyển động (trừ lớp quay/ra cảnh). */
export function sceneShapes(video: Video): { id: string; template: string; animated: number }[] {
  return video.scenes.map((s, i) => {
    const spec = buildSceneSpec(video, s, { isLast: i === video.scenes.length - 1 });
    const ids = new Set([...spec.anims.map((a) => a.id), ...spec.counts.map((c) => c.id)].filter((id) => !/-(stage|cam)$/.test(id)));
    return { id: s.id, template: s.design?.template === "custom" ? "custom" : spec.template, animated: ids.size };
  });
}

export function varietyQa(video: Video, timing?: Timing | null): QaItem[] {
  const shapes = sceneShapes(video);
  const items: QaItem[] = [];
  const n = shapes.length;
  const w = (message: string, scene?: string): QaItem => ({ kind: "variety", severity: "warning", scene, message });
  if (n >= VARIETY.minScenes) {
    const count = new Map<string, number>();
    for (const s of shapes) if (s.template !== "custom") count.set(s.template, (count.get(s.template) ?? 0) + 1);
    for (const [t, c] of count)
      if (c / n > VARIETY.maxShare) items.push(w(`Template «${t}» dùng cho ${c}/${n} cảnh (${pct(c / n)} > ${pct(VARIETY.maxShare)}) – video dễ giống trình chiếu, đổi vài cảnh sang kiểu khác`));
    const text = shapes.filter((s) => TEXT_TEMPLATES.has(s.template)).length;
    if (text / n > VARIETY.maxTextShare) items.push(w(`${text}/${n} cảnh chỉ có chữ (${pct(text / n)}) – thêm sơ đồ, số liệu, hình minh hoạ hoặc ảnh`));
  }
  for (let i = 1; i < n; i++)
    if (shapes[i].template === shapes[i - 1].template && shapes[i].template !== "custom")
      items.push(w(`Hai cảnh liền nhau ${shapes[i - 1].id} và ${shapes[i].id} cùng template «${shapes[i].template}» – đổi một cảnh để người xem thấy chuyển cảnh`, shapes[i].id));
  for (const [i, s] of shapes.entries()) {
    const dur = timing?.scenes[i]?.dur ?? 0;
    if (s.template !== "custom" && dur >= VARIETY.longScene && s.animated < VARIETY.minAnimated)
      items.push(w(`Cảnh dài ${Math.round(dur)} s nhưng chỉ có ${s.animated} phần tử chuyển động – hình sẽ đứng lâu, nên chia cảnh hoặc chọn template nhiều bước hơn`, s.id));
  }
  return items;
}
