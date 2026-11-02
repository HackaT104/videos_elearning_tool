// Bộ dựng Remotion: cùng JSON kịch bản + timing + giọng + theme; dùng chung SceneSpec với HyperFrames.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic, type OverlaySettings, type Timing, type Video } from "@cvs/core";
import { assetExists, buildSceneSpec, dropMissingImages, IMG_DIR, overlaySpec, overlayWarnings, sceneImageRefs, scriptMarkdown, syncSceneImages, type BuildInput, type BuildResult, type LayoutIssue, type PreviewResult, type RenderEngine, type RenderProgress, type RenderResult } from "@cvs/engine";
import { baseCss, fontFaces, getTheme, groundHtml, SKETCH_FILTER_SVG } from "@cvs/themes";
import { probe } from "@cvs/tts";
import type { RmtProps } from "../remotion/types";
import { serveStatic } from "./serve";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REMOTION_DIR = join(HERE, "..", "remotion");
const BUNDLE_ROOT = join(HERE, "..", ".bundle");

/** assetsDir: thư mục ảnh của dự án – <img> trỏ tới ảnh không có bị bỏ (Img của Remotion sẽ treo chờ ảnh lỗi). */
export async function buildProps(video: Video, timing: Timing, assetsDir?: string, overlay?: OverlaySettings): Promise<RmtProps> {
  const theme = getTheme(video.style, video.font);
  const ov = overlay ? overlaySpec(video, timing, overlay, (id) => assetExists(assetsDir, id)) : null;
  const fonts = (await fontFaces(theme)).map((f) => ({ family: f.family, weight: f.weight, unicodeRange: f.unicodeRange, base64: f.base64, ascentOverride: f.ascentOverride, descentOverride: f.descentOverride }));
  return {
    videoKey: video.key,
    fps: timing.fps,
    width: timing.width,
    height: timing.height,
    total: timing.total,
    css: baseCss(theme) + (ov?.globalCss ?? ""),
    ground: groundHtml(theme),
    sketch: SKETCH_FILTER_SVG,
    fonts,
    scenes: video.scenes.map((scene, i) => {
      const T = timing.scenes[i];
      const spec = buildSceneSpec(video, scene, { isLast: i === video.scenes.length - 1 });
      const custom = scene.design?.template === "custom" && scene.design.customCode?.remotion ? customKey(video.key, scene.id) : undefined;
      return {
        id: scene.id,
        start: T.start,
        dur: T.dur,
        T: { dur: T.dur, cues: T.cues, ends: T.ends },
        audio: T.audioFile ? { src: `assets/vo/${T.audioFile}`, from: T.lead, dur: T.audioDur } : undefined,
        spec: { html: dropMissingImages(spec.html, (id) => assetExists(assetsDir, id)), css: spec.css, anims: spec.anims, counts: spec.counts, template: custom ? "custom" : spec.template },
        custom,
      };
    }),
    overlay: ov ? { id: ov.scene.id, start: 0, dur: timing.total, T: ov.T, spec: { html: ov.spec.html, css: ov.spec.css, anims: ov.spec.anims, counts: [], template: ov.spec.template } } : undefined,
  };
}

export const customKey = (videoKey: string, sceneId: string) => `${videoKey.replace(/[^A-Za-z0-9]/g, "_")}__${sceneId}`;

/** Lint cảnh TSX tùy biến: chỉ import remotion/react/../lib, dùng at(), tất định. */
export function lintRemotionScene(src: string): string[] {
  const errs: string[] = [];
  for (const m of src.matchAll(/import\s[^;]*?from\s+["']([^"']+)["']/g)) if (!["remotion", "react", "../lib"].includes(m[1])) errs.push(`Không được import "${m[1]}" (chỉ remotion, react, ../lib)`);
  if (/Math\.random|Date\.now|new Date\(|setTimeout|setInterval|requestAnimationFrame|fetch\(/.test(src)) errs.push("Cấm Math.random/Date.now/timer/fetch");
  if (/delayRender/.test(src)) errs.push("Cấm delayRender");
  if (!/\bat\(\s*T\s*,/.test(src)) errs.push("Phải đặt mốc bằng at(T, i, f)");
  if (!/export\s+default\s+/.test(src)) errs.push("Thiếu export default component");
  for (const m of src.matchAll(/fontSize\s*:\s*(\d+)/g)) if (Number(m[1]) < 28) errs.push(`Chữ ${m[1]}px < 28px`);
  return errs;
}

/** Ghi cảnh TSX tùy biến + registry (trước khi bundle). */
export function writeCustomScenes(videos: Video[]) {
  const dir = join(REMOTION_DIR, "custom");
  for (const f of readdirSync(dir)) if (f.endsWith(".tsx")) rmSync(join(dir, f));
  const entries: string[] = [];
  for (const v of videos)
    for (const s of v.scenes) {
      const code = s.design?.template === "custom" ? s.design.customCode?.remotion : undefined;
      if (!code) continue;
      const key = customKey(v.key, s.id);
      writeFileSync(join(dir, `${key}.tsx`), code);
      entries.push(key);
    }
  writeFileSync(
    join(dir, "registry.ts"),
    `// TỰ SINH – danh sách cảnh TSX tùy biến (packages/engine-rmt cập nhật trước khi bundle).\nimport type React from "react";\nimport type { T } from "../lib";\n${entries.map((k, i) => `import C${i} from "./${k}";`).join("\n")}\n\nexport const CUSTOM_SCENES: Record<string, React.FC<{ T: T }>> = {${entries.map((k, i) => ` "${k}": C${i},`).join("")} };\n`,
  );
}

function hashDir(dir: string, h: ReturnType<typeof createHash>): void {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) hashDir(p, h);
    else if (/\.(tsx?|css)$/.test(f)) h.update(f).update(readFileSync(p));
  }
}

let bundling: Promise<string> | null = null;
/** Bundle một lần, lưu đệm theo hash mã nguồn remotion/ (gồm cảnh tùy biến). */
export async function ensureBundle(log?: (s: string) => void): Promise<string> {
  const h = createHash("sha1");
  hashDir(REMOTION_DIR, h);
  for (const f of ["spec.ts", "ease.ts", "text.ts", "layout-probe.ts", "browser.ts"]) h.update(readFileSync(join(HERE, "..", "..", "engine", "src", f)));
  const key = h.digest("hex").slice(0, 12);
  const out = join(BUNDLE_ROOT, key);
  if (existsSync(join(out, "index.html"))) return out;
  if (bundling) return bundling;
  bundling = (async () => {
    log?.("Đang đóng gói Remotion (lần đầu mất ~20 s)…\n");
    const { bundle } = await import("@remotion/bundler");
    mkdirSync(BUNDLE_ROOT, { recursive: true });
    const dir = await bundle({ entryPoint: join(REMOTION_DIR, "index.ts"), outDir: out, onProgress: (p) => (p % 25 === 0 ? log?.(`bundle ${p}%\n`) : undefined) });
    return dir;
  })();
  try {
    return await bundling;
  } finally {
    bundling = null;
  }
}

function copyVoice(input: BuildInput) {
  const voOut = join(input.workDir, "assets", "vo");
  mkdirSync(voOut, { recursive: true });
  const used = new Set<string>();
  for (const s of input.timing.scenes) {
    if (!s.audioFile) continue;
    used.add(s.audioFile);
    const dst = join(voOut, s.audioFile);
    if (!existsSync(dst)) copyFileSync(join(input.voDir, s.audioFile), dst);
  }
  for (const f of readdirSync(voOut)) if (f.endsWith(".mp3") && !used.has(f)) rmSync(join(voOut, f), { force: true });
}

export async function rmtBuild(input: BuildInput): Promise<BuildResult> {
  mkdirSync(input.workDir, { recursive: true });
  copyVoice(input);
  const props = await buildProps(input.video, input.timing, input.assetsDir, input.overlay);
  const warnings: string[] = [...overlayWarnings(input.overlay, (id) => assetExists(input.assetsDir, id))];
  if (input.overlay) warnings.push(...(overlaySpec(input.video, input.timing, input.overlay, (id) => assetExists(input.assetsDir, id))?.warnings ?? []));
  // ảnh của dự án → assets/img (như giọng ở assets/vo); khi render, withBase đổi thành URL máy chủ tĩnh
  const refs = [...props.scenes, ...(props.overlay ? [props.overlay] : [])].flatMap((s) => sceneImageRefs(s.spec.html));
  for (const id of syncSceneImages(refs, input.assetsDir, input.workDir).missing) warnings.push(`Thiếu ảnh ${id} trong thư mục ảnh của dự án`);
  const assumptions: Record<string, string[]> = {};
  input.video.scenes.forEach((s, i) => {
    const spec = buildSceneSpec(input.video, s, { isLast: i === input.video.scenes.length - 1 });
    assumptions[s.id] = spec.assumptions;
    spec.errors.forEach((e) => warnings.push(`${s.id}: ${e}`));
    const code = s.design?.template === "custom" ? s.design.customCode?.remotion : undefined;
    if (code) for (const e of lintRemotionScene(code)) warnings.push(`${s.id} lint TSX: ${e}`);
  });
  const propsFile = join(input.workDir, "props.json");
  writeJsonAtomic(propsFile, props);
  writeJsonAtomic(join(input.workDir, "timing.json"), input.timing);
  writeFileSync(join(input.workDir, "SCRIPT.md"), scriptMarkdown(input.video, input.timing, assumptions));
  return { workDir: input.workDir, files: [propsFile], warnings, assumptions };
}

function withBase(props: RmtProps, base: string): RmtProps {
  const img = (s: RmtProps["scenes"][number]) => ({ ...s, spec: { ...s.spec, html: s.spec.html.replaceAll(` src="${IMG_DIR}`, ` src="${base}/${IMG_DIR}`) } });
  return {
    ...props,
    scenes: props.scenes.map((s) => ({ ...img(s), audio: s.audio ? { ...s.audio, src: `${base}/${s.audio.src}` } : undefined })),
    overlay: props.overlay ? img(props.overlay) : undefined,
  };
}

function browserExecutable(): string | undefined {
  return process.env.CVS_REMOTION_BROWSER || undefined;
}

export async function rmtRender(input: BuildInput, outFile: string, onProgress?: (p: RenderProgress) => void, log?: (s: string) => void): Promise<RenderResult> {
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  writeCustomScenes([input.video]);
  const serveUrl = await ensureBundle(log);
  const props = JSON.parse(readFileSync(join(input.workDir, "props.json"), "utf8")) as RmtProps;
  const server = await serveStatic(input.workDir);
  try {
    const inputProps = withBase(props, server.url) as unknown as Record<string, unknown>;
    const composition = await selectComposition({ serveUrl, id: "CourseVideo", inputProps, browserExecutable: browserExecutable(), timeoutInMilliseconds: 120_000 });
    mkdirSync(dirname(outFile), { recursive: true });
    const part = outFile + ".part.mp4";
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: part,
      inputProps,
      concurrency: Number(process.env.CVS_REMOTION_CONCURRENCY ?? 2),
      timeoutInMilliseconds: 120_000,
      imageFormat: "jpeg",
      jpegQuality: 92,
      crf: 18,
      audioCodec: "aac",
      audioBitrate: "192k",
      pixelFormat: "yuv420p",
      browserExecutable: browserExecutable(),
      onProgress: ({ progress, renderedFrames }) => onProgress?.({ phase: "Remotion render", frame: renderedFrames, total: composition.durationInFrames, pct: Math.round(progress * 100) }),
    });
    rmSync(outFile, { force: true });
    (await import("node:fs")).renameSync(part, outFile);
  } finally {
    await server.close();
  }
  const info = await probe(outFile);
  return { file: outFile, duration: info.duration, renderer: "remotion" };
}

/** Xem trước: renderStill tại các mốc + đo bố cục bằng LayoutProbe (console → onBrowserLog). */
export async function rmtPreview(input: BuildInput, times: { t: number; scene?: string; label?: string }[], outDir: string): Promise<PreviewResult> {
  const { renderStill, selectComposition, openBrowser } = await import("@remotion/renderer");
  writeCustomScenes([input.video]);
  const serveUrl = await ensureBundle();
  const props = JSON.parse(readFileSync(join(input.workDir, "props.json"), "utf8")) as RmtProps;
  mkdirSync(outDir, { recursive: true });
  const server = await serveStatic(input.workDir);
  const browser = await openBrowser("chrome", { browserExecutable: browserExecutable() });
  const frames: PreviewResult["frames"] = [];
  const layout: LayoutIssue[] = [];
  const errors: string[] = [];
  try {
    const inputProps = { ...withBase(props, server.url), probe: true } as unknown as Record<string, unknown>;
    const composition = await selectComposition({ serveUrl, id: "CourseVideo", inputProps, puppeteerInstance: browser });
    for (const [i, x] of times.entries()) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round(x.t * composition.fps));
      const file = join(outDir, `f${String(i).padStart(3, "0")}_${x.t.toFixed(2)}s.png`);
      await renderStill({
        composition,
        serveUrl,
        output: file,
        frame,
        inputProps,
        imageFormat: "png",
        puppeteerInstance: browser,
        onBrowserLog: (l) => {
          if (l.text.startsWith("CVS_LAYOUT ")) {
            const j = JSON.parse(l.text.slice(11)) as { scene: string; issues: Omit<LayoutIssue, "scene" | "t">[] };
            if (!x.scene || j.scene === x.scene) for (const is of j.issues) layout.push({ ...is, scene: j.scene, t: x.t });
          } else if (l.type === "error") errors.push(l.text);
        },
      });
      frames.push({ t: x.t, file, scene: x.scene, label: x.label });
    }
  } finally {
    await browser.close({ silent: true });
    await server.close();
  }
  const seen = new Set<string>();
  return { frames, errors: [...new Set(errors)], layout: layout.filter((l) => (seen.has(`${l.scene}|${l.kind}|${l.id}`) ? false : (seen.add(`${l.scene}|${l.kind}|${l.id}`), true))) };
}

export function createRemotionEngine(opts: { log?: (s: string) => void } = {}): RenderEngine {
  return {
    id: "remotion",
    build: rmtBuild,
    preview: rmtPreview,
    render: (input, out, onProgress) => rmtRender(input, out, onProgress, opts.log),
  };
}
