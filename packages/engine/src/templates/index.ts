import { barCompare, flowChain, iconGrid, splitCompare, statHero, titleCard } from "./basic";
import type { TemplateDef } from "./common";
import { causeEffect, checklist, documentTransform, draft, processSteps, quoteBanner, timelineRun } from "./more";

export * from "./common";
export * from "./basic";
export * from "./more";

/** Thư viện template cảnh có tham số (mục 6.2). */
export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  [titleCard, splitCompare, statHero, iconGrid, flowChain, barCompare, processSteps, timelineRun, documentTransform, causeEffect, checklist, quoteBanner, draft].map((t) => [t.id, t]),
);

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
/** Template chọn được (trừ cảnh nháp). */
export const DESIGN_TEMPLATE_IDS = TEMPLATE_IDS.filter((t) => t !== "draft");
