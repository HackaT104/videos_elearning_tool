// Luồng sản xuất một video: Giọng → Cắt/giãn → Timing → Dựng cảnh → QA → Render.
// Mỗi bước chạy lại được: giọng bỏ qua cảnh đã có hash đúng; build tất định từ JSON.

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { computeTiming, type Timing, type Video } from "@cvs/core";
import { aiAvailable, designScene, reviseScene, visionReview, writeCustomScene } from "@cvs/ai";
import { getVideo, paths, setVideoFlags, setVideoQa, upsertVideo, type ProjectSettings } from "@cvs/db";
import { autoDesign, qaTimes, type BuildInput, type PreviewResult, type RenderEngine } from "@cvs/engine";
import { contactSheet, createHyperFramesEngine, launchBrowser, lintErrors, lintScene } from "@cvs/engine-hf";
import { createRemotionEngine, lintRemotionScene } from "@cvs/engine-rmt";
import { audioQa, contentQa, layoutItems, makeReport, type QaItem, type QaReport } from "@cvs/qa";
import { CitClient, loadManifest, mockGenerate, synthesizeVideo } from "@cvs/tts";

export type StepName = "voice" | "timing" | "design" | "build" | "qa" | "render" | "final-qa";
export const STEP_LABELS: Record<StepName, string> = {
  voice: "Giọng & cắt/giãn",
  timing: "Timing",
  design: "Dựng cảnh",
  build: "Build",
  qa: "QA",
  render: "Render",
  "final-qa": "QA video",
};

export type Ctx = {
  projectId: string;
  key: string;
  settings: ProjectSettings;
  progress: (step: StepName, pct: number, message?: string) => void;
  /** true → dừng giữa chừng (tạm dừng/hủy). */
  shouldStop: () => boolean;
  log: (s: string) => void;
};

export class Stopped extends Error {}

export function engineFor(video: Video, settings: ProjectSettings, log?: (s: string) => void): RenderEngine {
  return video.engine === "remotion" ? createRemotionEngine({ log }) : createHyperFramesEngine({ renderer: settings.hfRenderer, log });
}

function load(ctx: Ctx): Video {
  const row = getVideo(ctx.projectId, ctx.key);
  if (!row) throw new Error(`Không có video ${ctx.key}`);
  return row.data;
}

function input(ctx: Ctx, video: Video, timing: Timing): BuildInput {
  const voDir = paths.vo(ctx.projectId, video.key);
  return { video, timing, manifest: existsSync(join(voDir, "manifest.json")) ? loadManifest(voDir) : null, voDir, workDir: paths.work(ctx.projectId, video.key, video.engine) };
}

export function currentTiming(projectId: string, video: Video): Timing {
  const voDir = paths.vo(projectId, video.key);
  return computeTiming(video, existsSync(join(voDir, "manifest.json")) ? loadManifest(voDir) : null);
}

// ---------- các bước ----------

export async function stepVoice(ctx: Ctx, force = false) {
  const video = load(ctx);
  const voDir = paths.vo(ctx.projectId, video.key);
  mkdirSync(voDir, { recursive: true });
  const useMock = process.env.CVS_TTS_MOCK === "1";
  const cit = new CitClient();
  if (video.voice.provider === "cit" && !useMock) {
    const st = await cit.status();
    if (!st.ok) throw new Error("Không kết nối được CIT Voice Studio. Hãy mở CIT Voice Studio rồi bấm Thử lại.");
  }
  await synthesizeVideo(video, voDir, {
    cit,
    force,
    generator: useMock ? mockGenerate : undefined,
    onProgress: (p) => {
      if (ctx.shouldStop()) throw new Stopped();
      ctx.progress("voice", Math.round(((p.index + (p.status === "tts" ? 0.3 : 1)) / p.total) * 100), `${p.scene}: ${p.status === "skip" ? "đã có (hash khớp)" : p.status === "tts" ? "đang đọc…" : "xong"}`);
    },
  });
  setVideoFlags(ctx.projectId, video.key, { status: "voiced" });
}

export async function stepDesign(ctx: Ctx, o: { redesign?: boolean } = {}) {
  const video = load(ctx);
  const timing = currentTiming(ctx.projectId, video);
  const useAi = ctx.settings.aiDesign && aiAvailable();
  for (const [i, scene] of video.scenes.entries()) {
    if (ctx.shouldStop()) throw new Stopped();
    const keep = scene.design && (scene.design.by === "user" || (scene.design.by === "ai" && !o.redesign) || scene.design.template === "custom");
    if (keep) continue;
    ctx.progress("design", Math.round((i / video.scenes.length) * 100), `${scene.id}: ${useAi ? "AI chọn template" : "thiết kế tự động"}`);
    if (useAi) {
      try {
        const r = await designScene(video, scene, timing.scenes[i]);
        scene.design = r.design;
        scene.assumptions = [...new Set([...(scene.assumptions ?? []).filter((a) => !a.startsWith("AI:")), ...r.assumptions.map((a) => `AI: ${a}`)])];
        continue;
      } catch (e) {
        ctx.log(`AI thiết kế ${scene.id} lỗi: ${(e as Error).message} → dùng thiết kế tự động\n`);
      }
    }
    scene.design = autoDesign(video, scene, i);
  }
  upsertVideo(ctx.projectId, video, { status: "designed" });
  ctx.progress("design", 100);
}

/** Cảnh tùy biến (AI viết mã) khi không template nào phù hợp. */
export async function makeCustomScene(ctx: Ctx, sceneId: string) {
  const video = load(ctx);
  const timing = currentTiming(ctx.projectId, video);
  const i = video.scenes.findIndex((s) => s.id === sceneId);
  const scene = video.scenes[i];
  const eng = engineFor(video, ctx.settings);
  const inp = input(ctx, video, timing);
  await eng.build(inp);
  const examples = video.scenes
    .filter((s) => s.id !== sceneId && s.design && s.design.template !== "draft")
    .slice(0, 2)
    .map((s) => (video.engine === "hyperframes" ? readFileSync(join(inp.workDir, "compositions", `${s.id}.html`), "utf8") : JSON.stringify(s.design)));
  const contract = video.engine === "hyperframes" ? HF_CONTRACT(sceneId) : RMT_CONTRACT;
  const r = await writeCustomScene(video, scene, {
    engine: video.engine,
    T: timing.scenes[i],
    contract,
    examples,
    lint: (code) => (video.engine === "hyperframes" ? lintErrors(lintScene(code, sceneId)).map((x) => `${x.rule}: ${x.message}${x.line ? ` (dòng ${x.line})` : ""}`) : lintRemotionScene(code)),
  });
  scene.design = { template: "custom", params: {}, by: "ai", customCode: { ...(scene.design?.customCode ?? {}), [video.engine]: r.code } };
  scene.assumptions = r.assumptions;
  upsertVideo(ctx.projectId, video);
}

export async function stepBuild(ctx: Ctx) {
  const video = load(ctx);
  const timing = currentTiming(ctx.projectId, video);
  const eng = engineFor(video, ctx.settings, ctx.log);
  const r = await eng.build(input(ctx, video, timing));
  for (const w of r.warnings) ctx.log(`build: ${w}\n`);
  ctx.progress("build", 100);
  return { video, timing, build: r, engine: eng };
}

/** QA trước render: chụp khung (mỗi mốc câu + 1,5 s, cuối cảnh), đo bố cục, đối chiếu nội dung, soát bằng hình (≤ 2 vòng tự sửa). */
export async function stepQa(ctx: Ctx): Promise<QaReport> {
  let { video, timing, build, engine } = await stepBuild(ctx);
  const framesDir = paths.frames(ctx.projectId, video.key);
  let preview: PreviewResult | null = null;
  const items: QaItem[] = [];
  const useVision = ctx.settings.aiVision && aiAvailable();
  for (let round = 0; round < (useVision ? 3 : 1); round++) {
    if (ctx.shouldStop()) throw new Stopped();
    ctx.progress("qa", 10 + round * 30, round ? `Vòng sửa ${round}` : "Chụp khung xem trước");
    rmSync(framesDir, { recursive: true, force: true });
    preview = await engine.preview(input(ctx, video, timing), qaTimes(timing), framesDir);
    if (!useVision || round === 2) break;
    let issues: Awaited<ReturnType<typeof visionReview>> = [];
    try {
      issues = await visionReview(video, preview.frames);
    } catch (e) {
      items.push({ kind: "vision", severity: "warning", message: `Không soát được bằng hình: ${(e as Error).message}` });
      break;
    }
    const fixable = issues.filter((x) => x.severity !== "P2" && video.scenes.some((s) => s.id === x.scene));
    if (round === 1 || fixable.length === 0) {
      for (const x of issues) items.push({ kind: "vision", severity: x.severity === "P0" ? "error" : "warning", scene: x.scene, message: `${x.problem} → ${x.fix}` });
      break;
    }
    // tự sửa đúng cảnh lỗi
    for (const sid of [...new Set(fixable.map((x) => x.scene))]) {
      const scene = video.scenes.find((s) => s.id === sid)!;
      if (scene.design?.by === "user" || scene.design?.template === "custom") continue;
      const note = fixable.filter((x) => x.scene === sid).map((x) => `${x.problem} → ${x.fix}`).join("; ");
      try {
        const r = await reviseScene(video, scene, note, timing.scenes[video.scenes.indexOf(scene)]);
        scene.design = r.design;
      } catch (e) {
        ctx.log(`Tự sửa ${sid} lỗi: ${(e as Error).message}\n`);
      }
    }
    upsertVideo(ctx.projectId, video);
    ({ video, timing, build, engine } = await stepBuild(ctx));
  }
  items.push(...layoutItems(preview!.layout));
  for (const e of preview!.errors) items.push({ kind: "render", severity: "error", message: `Lỗi trang: ${e}` });
  items.push(...contentQa(video));
  for (const w of build.warnings) items.push({ kind: "render", severity: /lint/.test(w) ? "error" : "warning", message: w });
  const sheet = join(framesDir, "sheet.png");
  const browser = await launchBrowser();
  try {
    await contactSheet(preview!.frames.filter((f) => /cuối cảnh/.test(f.label ?? "")).map((f) => ({ file: f.file, label: f.label })), sheet, browser);
  } finally {
    await browser.close();
  }
  const report = makeReport(video.key, items, build.assumptions, { sheet, frames: preview!.frames });
  setVideoQa(ctx.projectId, video.key, report);
  ctx.progress("qa", 100, report.ok ? "Đạt" : `${items.filter((i) => i.severity === "error").length} lỗi`);
  return report;
}

export async function stepRender(ctx: Ctx) {
  const { video, timing, engine } = await stepBuild(ctx);
  if (timing.estimated && process.env.CVS_ALLOW_ESTIMATED !== "1") throw new Error("Chưa có giọng thật cho mọi cảnh – chạy bước Giọng trước khi render");
  const out = paths.render(ctx.projectId, video.key);
  const r = await engine.render(input(ctx, video, timing), out, (p) => {
    if (ctx.shouldStop()) throw new Stopped();
    ctx.progress("render", p.pct, p.phase + (p.frame ? ` ${p.frame}/${p.total}` : ""));
  });
  ctx.log(`render: ${r.renderer} ${r.duration.toFixed(2)} s\n`);
  // QA âm thanh/thời lượng
  const row = getVideo(ctx.projectId, video.key)!;
  const prev = (row.qa as QaReport | null) ?? makeReport(video.key, [], {});
  const audio = await audioQa(out, timing);
  const items = [...prev.items.filter((i) => i.kind !== "audio" && !(i.kind === "render" && /Thời lượng|H\.264/.test(i.message))), ...audio];
  const report = makeReport(video.key, items, prev.assumptions, { sheet: prev.sheet, frames: prev.frames });
  setVideoQa(ctx.projectId, video.key, { ...report, renderer: r.renderer, rendered: out, renderedAt: new Date().toISOString() });
  setVideoFlags(ctx.projectId, video.key, { status: "rendered", approved: false });
  ctx.progress("render", 100);
}

export const JOB_STEPS: Record<string, StepName[]> = {
  produce: ["voice", "design", "qa", "render"],
  voice: ["voice"],
  visual: ["design", "qa", "render"],
  render: ["qa", "render"],
  design: ["design", "qa"],
};

export async function runSteps(ctx: Ctx, steps: StepName[], payload: { forceVoice?: boolean; redesign?: boolean } = {}) {
  for (const s of steps) {
    if (ctx.shouldStop()) throw new Stopped();
    ctx.progress(s, 0);
    if (s === "voice") await stepVoice(ctx, payload.forceVoice);
    else if (s === "design") await stepDesign(ctx, { redesign: payload.redesign });
    else if (s === "build") await stepBuild(ctx);
    else if (s === "qa") await stepQa(ctx);
    else if (s === "render") await stepRender(ctx);
  }
}

const HF_CONTRACT = (sid: string) => `- Mở đầu: <!-- ${sid} · <tên cảnh> (kịch bản m:ss–m:ss) … tóm tắt hình -->, rồi <template> bọc toàn bộ style, markup, script.
- Gốc cảnh: <div id="root" data-composition-id="${sid}" data-width="1920" data-height="1080">; bên trong một <div id="${sid}-stage" class="cvs-scene">.
- Giữ nguyên dòng: const T = /*TIMING*/{"dur":…,"cues":[…],"ends":[…]}/*/TIMING*/;
- const at = (i, f) => T.cues[i] + f * (T.ends[i] - T.cues[i]); – mọi mốc tween dùng at(), cấm giây cứng (trừ tiêu đề < 1 s).
- Một timeline: const tl = gsap.timeline({ paused: true }); … cuối file window.__timelines = window.__timelines || {}; window.__timelines["${sid}"] = tl; Bọc script trong (function(){ … })();
- Mọi id có tiền tố ${sid}- (kể cả <symbol>, <filter>, gradient).
- Chỉ dùng tl.fromTo. Không đặt CSS transform trên phần tử được tween x/y/scale.
- Cấm: Math.random, Date.now, timer, requestAnimationFrame, repeat: -1, tween display/visibility/autoAlpha, class="clip", tải mạng/CDN.
- Ra cảnh: blur 8 px + mờ 0,3 s power3.in tại T.dur - 0.45 trên #${sid}-stage.
- Ease: vào expo.out/power4.out 0,6–0,8 s (nhịp chậm: power2.out/sine.inOut 0,9–1,3 s); dời bố cục power2.inOut 0,7–1,2 s; nét vẽ bằng stroke-dashoffset.
- Dùng biến theme: var(--bg) var(--ink) var(--ink-soft) var(--accent) var(--alt) var(--money) var(--warn) var(--card) var(--font-display) var(--font-body); lớp chung: .card .d (chữ tiêu đề) .b (chữ thân) .kicker .icon .line .draw .abs .tone-accent/.tone-warn…; chữ hiển thị đặt lớp "t". Chữ ≥ 28 px, vùng an toàn x 96–1824, y 54–1026, box-sizing: border-box.`;

const RMT_CONTRACT = `- File TSX: export default function Scene({ T }: { T: T }) { … }
- Chỉ import từ "remotion", "react" và "../lib" (at, enter, dim, count, wobble, interpolate, Easing).
- const t = useCurrentFrame() / useVideoConfig().fps; mọi mốc dùng at(T, i, f) (cấm giây cứng trừ tiêu đề < 1 s).
- Tất định: không Math.random/Date.now/timer/fetch/delayRender. Chuyển động "sống" dùng wobble(t) (sin).
- Ra cảnh: blur 8 px + mờ trong 0,45 s cuối (T.dur).
- Dùng lớp/biến theme như cảnh HTML: className "card", "d", "b", "kicker", "icon", style var(--accent)…; chữ ≥ 28 px; vùng an toàn x 96–1824, y 54–1026.`;
