import { barCompare, flowChain, iconGrid, splitCompare, statHero, titleCard } from "./basic";
import type { TemplateDef } from "./common";
import { causeEffect, checklist, documentTransform, draft, processSteps, quoteBanner, timelineRun } from "./more";
import { cycleLoop } from "./cycle-loop";
import { decisionTree } from "./decision-tree";
import { donutShare } from "./donut-share";
import { hubSpoke } from "./hub-spoke";
import { illustration } from "./illustration";
import { imageFocus } from "./image-focus";
import { kineticStatement } from "./kinetic-statement";
import { moduleDivider } from "./module-divider";
import { mythFact } from "./myth-fact";
import { quizCheck } from "./quiz-check";
import { rankReorder } from "./rank-reorder";
import { termDefine } from "./term-define";
import { trendLine } from "./trend-line";
import { uiWalkthrough } from "./ui-walkthrough";

export * from "./common";
export * from "./basic";
export * from "./more";
export { illustration, illustrationStyleHints } from "./illustration";
export { imageFocus } from "./image-focus";
export { cycleLoop, decisionTree, donutShare, hubSpoke, kineticStatement, moduleDivider, mythFact, quizCheck, rankReorder, termDefine, trendLine, uiWalkthrough };

/** Thư viện template cảnh có tham số (mục 6.2). */
export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  [
    titleCard, splitCompare, statHero, iconGrid, flowChain, barCompare, processSteps, timelineRun, documentTransform, causeEffect, checklist, quoteBanner,
    mythFact, termDefine, kineticStatement, moduleDivider, hubSpoke, cycleLoop, decisionTree, quizCheck, donutShare, trendLine, rankReorder, uiWalkthrough,
    illustration, imageFocus,
    draft,
  ].map((t) => [t.id, t]),
);

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
/** Template chọn được (trừ cảnh nháp). */
export const DESIGN_TEMPLATE_IDS = TEMPLATE_IDS.filter((t) => t !== "draft");
