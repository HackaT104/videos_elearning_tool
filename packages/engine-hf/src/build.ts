// build(video): từ JSON + manifest tính timing.json, sinh lại index.html, SCRIPT.md, và cập nhật khối TIMING trong từng sN.html.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { sha1, writeFileAtomic, writeJsonAtomic, type Timing, type Video } from "@cvs/core";
import { assetExists, buildSceneSpec, dropMissingImages, OVERLAY_ID, overlaySpec, overlayWarnings, sceneClipRefs, sceneImageRefs, scriptMarkdown, syncSceneClips, syncSceneImages, type BuildInput, type BuildResult } from "@cvs/engine";
import { baseCss, fontFaceCss, getTheme, groundHtml, SKETCH_FILTER_SVG } from "@cvs/themes";
import { compileScene, replaceTimingBlock } from "./compile";
import { lintErrors, lintScene } from "./lint";

const require = createRequire(import.meta.url);

export function gsapPath(): string {
  return require.resolve("gsap/dist/gsap.min.js");
}

function writeIfChanged(path: string, content: string | Buffer): boolean {
  if (existsSync(path)) {
    const cur = readFileSync(path);
    if (sha1(cur) === sha1(typeof content === "string" ? Buffer.from(content) : content)) return false;
  }
  writeFileAtomic(path, content);
  return true;
}

/** overlay: lớp phủ toàn video (logo, phụ đề gắn cứng) – host sau mọi cảnh, z-index cao hơn; globalCss nâng dòng "Nguồn". */
export async function indexHtml(video: Video, timing: Timing, overlay?: { globalCss: string } | null): Promise<string> {
  const theme = getTheme(video.style, video.font);
  const hosts = timing.scenes
    .map(
      (s) =>
        `  <div id="${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`,
    )
    .join("\n");
  const over = overlay
    ? `\n  <div id="${OVERLAY_ID}" class="clip" data-composition-id="${OVERLAY_ID}" data-composition-src="compositions/${OVERLAY_ID}.html" data-start="0" data-duration="${timing.total}" data-track-index="3" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`
    : "";
  const audios = timing.scenes
    .filter((s) => s.audioFile)
    .map((s) => `  <audio id="vo-${s.id}" class="clip" data-start="${round(s.start + s.lead)}" data-duration="${s.audioDur}" data-track-index="2" data-volume="1" src="assets/vo/${s.audioFile}"></audio>`)
    .join("\n");
  return `<!doctype html>
<!-- TỰ SINH – không sửa tay. ${video.key} · ${video.title} · build từ JSON kịch bản + vo/manifest.json -->
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(video.key)} – ${escapeHtml(video.title)}</title>
<style>
${await fontFaceCss(theme)}
${baseCss(theme)}
#root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: ${theme.colors.bg}; }
${overlay ? `#${OVERLAY_ID} { z-index: 10; pointer-events: none; }\n${overlay.globalCss}` : ""}
</style>
<script src="assets/lib/gsap.min.js"></script>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${timing.total}" data-width="1920" data-height="1080" data-fps="${timing.fps}">
  ${SKETCH_FILTER_SVG}
  ${groundHtml(theme)}
${hosts}${over}
${audios}
</div>
<script>
window.__timelines = window.__timelines || {};
window.__timelines["main"] = gsap.timeline({ paused: true });
</script>
</body>
</html>
`;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const round = (n: number) => Math.round(n * 1000) / 1000;

export async function hfBuild(input: BuildInput): Promise<BuildResult> {
  const { video, timing, workDir, voDir } = input;
  const comp = join(workDir, "compositions");
  const voOut = join(workDir, "assets", "vo");
  const lib = join(workDir, "assets", "lib");
  for (const d of [comp, voOut, lib]) mkdirSync(d, { recursive: true });
  writeIfChanged(join(lib, "gsap.min.js"), readFileSync(gsapPath()));

  // giọng: chép file có hash trong tên; xóa bản cũ không còn dùng
  const used = new Set<string>();
  for (const s of timing.scenes) {
    if (!s.audioFile) continue;
    used.add(s.audioFile);
    const src = join(voDir, s.audioFile);
    const dst = join(voOut, s.audioFile);
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
  }
  for (const f of readdirSync(voOut)) if (f.endsWith(".mp3") && !used.has(f)) rmSync(join(voOut, f), { force: true });
  if (existsSync(join(voDir, "manifest.json"))) copyFileSync(join(voDir, "manifest.json"), join(voOut, "manifest.json"));

  const warnings: string[] = [];
  const assumptions: Record<string, string[]> = {};
  const files: string[] = [];
  const images = new Set<string>();
  const clips = new Set<string>();
  video.scenes.forEach((scene, i) => {
    const T = timing.scenes[i];
    const file = join(comp, `${scene.id}.html`);
    let html: string;
    const custom = scene.design?.template === "custom" ? scene.design.customCode?.hyperframes : undefined;
    const spec = buildSceneSpec(video, scene, { isLast: i === video.scenes.length - 1 });
    if (custom) {
      html = replaceTimingBlock(custom, T);
      assumptions[scene.id] = [...(scene.assumptions ?? []), "Cảnh tùy biến do AI viết mã – cần duyệt hình"];
    } else {
      spec.html = dropMissingImages(spec.html, (id) => assetExists(input.assetsDir, id));
      html = compileScene(spec, T, { scene, videoKey: video.key });
      assumptions[scene.id] = spec.assumptions;
      for (const e of spec.errors) warnings.push(`${scene.id}: ${e}`);
    }
    for (const issue of lintErrors(lintScene(html, scene.id))) warnings.push(`${scene.id} lint ${issue.rule}: ${issue.message}`);
    for (const id of sceneImageRefs(html)) images.add(id);
    for (const id of sceneClipRefs(html)) clips.add(id);
    writeIfChanged(file, html);
    files.push(file);
  });
  // lớp phủ (logo + phụ đề gắn cứng): biên dịch như một cảnh phủ cả video, cùng lint
  const ov = input.overlay ? overlaySpec(video, timing, input.overlay, (id) => assetExists(input.assetsDir, id)) : null;
  if (ov) {
    warnings.push(...ov.warnings);
    const html = compileScene(ov.spec, ov.T, { scene: ov.scene, videoKey: video.key });
    for (const issue of lintErrors(lintScene(html, OVERLAY_ID))) warnings.push(`${OVERLAY_ID} lint ${issue.rule}: ${issue.message}`);
    for (const id of sceneImageRefs(html)) images.add(id);
    writeIfChanged(join(comp, `${OVERLAY_ID}.html`), html);
    files.push(join(comp, `${OVERLAY_ID}.html`));
  }
  warnings.push(...overlayWarnings(input.overlay, (id) => assetExists(input.assetsDir, id)));
  // ảnh của dự án mà cảnh dùng → assets/img (đường dẫn tương đối, như giọng đọc ở assets/vo)
  for (const id of syncSceneImages(images, input.assetsDir, workDir).missing) warnings.push(`Thiếu ảnh ${id} trong thư mục ảnh của dự án`);
  for (const id of syncSceneClips(clips, input.clipsDir, workDir).missing) warnings.push(`Thiếu clip hoạt hình ${id} – dựng lại cảnh để vẽ lại`);
  // xóa cảnh thừa
  for (const f of readdirSync(comp)) if (!video.scenes.some((s) => `${s.id}.html` === f) && !(ov && f === `${OVERLAY_ID}.html`)) rmSync(join(comp, f), { force: true });

  writeIfChanged(join(workDir, "index.html"), await indexHtml(video, timing, ov));
  writeJsonAtomic(join(workDir, "timing.json"), timing);
  writeIfChanged(join(workDir, "SCRIPT.md"), scriptMarkdown(video, timing, assumptions));
  files.push(join(workDir, "index.html"), join(workDir, "timing.json"), join(workDir, "SCRIPT.md"));
  return { workDir, files, warnings, assumptions };
}
