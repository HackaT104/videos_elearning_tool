// Cảnh hoạt hình vẽ tay (template "cartoon"): Claude viết mã cảnh theo kit Claude Animation Base (khi thiết kế/dựng),
// rồi @cvs/engine-brush render trước thành clip MP4 lưu đệm theo nội dung (storage/projects/<pid>/cartoon/<mã>.mp4).
// Cài đặt ở dự án (settings.cartoon): bật cho AI chọn, chất lượng nhẹ/đầy đủ, cho dùng Clawd (mặc định tắt).

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Scene, SceneTiming, Timing, Video } from "@cvs/core";
import { aiAvailable, writeCartoon } from "@cvs/ai";
import { paths, type ProjectSettings } from "@cvs/db";
import { cartoonKey, checkCartoon, estimateSeconds, lintCartoon, renderCartoon, type CartoonInput } from "@cvs/engine-brush";
import { getTheme } from "@cvs/themes";

export type CartoonPolicy = { enabled: boolean; clawd: boolean; fast: boolean };
export const cartoonPolicy = (s: Pick<ProjectSettings, "cartoon"> | undefined): CartoonPolicy => ({
  enabled: !!s?.cartoon?.enabled,
  clawd: !!s?.cartoon?.clawd,
  fast: s?.cartoon?.quality !== "day-du",
});

/** Gắn chính sách của dự án vào video trước khi tạo prompt (template cartoon chỉ hiện khi dự án bật). */
export function withCartoonPolicy(video: Video, s: Pick<ProjectSettings, "cartoon"> | undefined): Video {
  const p = cartoonPolicy(s);
  if (p.enabled) video.cartoon = { clawd: p.clawd };
  else delete video.cartoon;
  return video;
}

const isCartoon = (s: Scene) => s.design?.template === "cartoon";
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function cartoonInput(video: Video, scene: Scene, T: SceneTiming, policy: CartoonPolicy, code = str(scene.design?.params.code)): CartoonInput {
  const th = getTheme(video.style, video.font);
  const c = th.colors as unknown as Record<string, string>;
  const theme = Object.fromEntries(["bg", "bg2", "ink", "inkSoft", "accent", "alt", "money", "warn", "card", "line", "highlight"].filter((k) => typeof c[k] === "string").map((k) => [k, c[k]]));
  // mốc tính từ đầu cảnh (đã cộng lead), như cảnh template
  return { code, dur: T.dur, cues: T.cues, ends: T.ends, fast: policy.fast, clawd: policy.clawd, theme };
}

/** Lint + vẽ thử vài khung; lưu ảnh khung vào thư mục tạm để người/Claude Code soát. */
export async function testCartoon(projectId: string, video: Video, scene: Scene, T: SceneTiming, policy: CartoonPolicy, code: string) {
  const r = await checkCartoon(cartoonInput(video, scene, T, policy, code));
  const dir = join(paths.cartoon(projectId), "check", `${video.key}-${scene.id}`);
  rmSync(dir, { recursive: true, force: true });
  const files: { t: number; file: string }[] = [];
  if (r.frames.length) mkdirSync(dir, { recursive: true });
  for (const f of r.frames) {
    const file = join(dir, `t${f.t.toFixed(2)}.jpg`);
    writeFileSync(file, f.jpg);
    files.push({ t: f.t, file });
  }
  const avg = r.ms.length ? Math.round(r.ms.reduce((a, b) => a + b, 0) / r.ms.length) : 0;
  return { errors: r.errors, frames: files, msPerFrame: avg, gpu: r.gpu, estimate: avg ? estimateSeconds(T.dur, avg) : null };
}

/**
 * Viết mã (cảnh cartoon có brief mà chưa có mã; cần Claude API – không có thì để Claude Code làm qua `pnpm cvs`)
 * và/hoặc render clip (theo mã + timing hiện tại; có sẵn thì dùng đệm). Ghi params.code/params.clip vào video (chưa lưu DB).
 * Trả về số cảnh đã đổi.
 */
export async function fillCartoons(projectId: string, video: Video, timing: Timing, settings: ProjectSettings, o: {
  render: boolean; log?: (s: string) => void; progress?: (pct: number, msg: string) => void; shouldStop?: () => boolean;
}): Promise<number> {
  const policy = cartoonPolicy(settings);
  const log = o.log ?? (() => {});
  const scenes = video.scenes.map((s, i) => ({ s, i })).filter(({ s }) => isCartoon(s));
  let changed = 0;
  for (const [k, { s, i }] of scenes.entries()) {
    const T = timing.scenes[i];
    const d = s.design!;
    const brief = str(d.params.brief).trim();
    let code = str(d.params.code);
    if (!code && brief) {
      if (!aiAvailable()) {
        log(`Cảnh hoạt hình ${s.id} chưa có mã – gửi Claude Code viết (pnpm cvs prompt cartoon …) hoặc bật Claude API\n`);
        continue;
      }
      o.progress?.(Math.round((k / scenes.length) * 100), `${s.id}: Claude viết cảnh hoạt hình`);
      try {
        const r = await writeCartoon(withCartoonPolicy(video, settings), s, T, { brief, clawd: policy.clawd, fast: policy.fast, layout: d.params.layout as never }, async (c) => (await testCartoon(projectId, video, s, T, policy, c)).errors);
        code = r.code;
        s.design = { ...d, params: { ...d.params, code, clip: undefined } };
        s.assumptions = [...new Set([...(s.assumptions ?? []).filter((a) => !a.startsWith("AI: Cảnh hoạt hình")), ...r.assumptions.map((a) => `AI: ${a}`)])];
        changed++;
      } catch (e) {
        log(`Viết cảnh hoạt hình ${s.id} lỗi: ${(e as Error).message}\n`);
        continue;
      }
    }
    if (!o.render || !code) continue;
    const errs = lintCartoon(code, { clawd: policy.clawd });
    if (errs.length) {
      log(`Mã cảnh hoạt hình ${s.id} không hợp lệ: ${errs.join("; ")}\n`);
      continue;
    }
    const inp = cartoonInput(video, s, T, policy, code);
    const clip = `${cartoonKey(inp)}.mp4`;
    const file = join(paths.cartoon(projectId), clip);
    if (!existsSync(file)) {
      try {
        const r = await renderCartoon(inp, file, {
          shouldStop: o.shouldStop,
          onProgress: (p) => o.progress?.(Math.round(((k + p.frame / p.total) / scenes.length) * 100), `${s.id}: vẽ hoạt hình khung ${p.frame}/${p.total} (${(p.msPerFrame / 1000).toFixed(1)} s/khung${/swiftshader/i.test(p.gpu) ? ", không có GPU – chậm" : ""})`),
        });
        log(`Đã vẽ hoạt hình ${s.id} → ${clip}${r.gpu ? ` (${r.gpu})` : ""}\n`);
      } catch (e) {
        if ((e as Error).message === "Đã dừng") throw e;
        log(`Vẽ hoạt hình ${s.id} lỗi: ${(e as Error).message}\n`);
        continue;
      }
    }
    if (d.params.clip !== clip) {
      s.design = { ...s.design!, params: { ...s.design!.params, clip } };
      changed++;
    }
  }
  return changed;
}

/** Clip hoạt hình không còn cảnh nào dùng (cho bước Dọn dẹp). */
export function unusedCartoonClips(projectId: string, videos: Video[]): string[] {
  const dir = paths.cartoon(projectId);
  if (!existsSync(dir)) return [];
  const used = new Set(videos.flatMap((v) => v.scenes.map((s) => str(s.design?.params.clip)).filter(Boolean)));
  return readdirSync(dir).filter((f) => f.endsWith(".mp4") && !used.has(f)).map((f) => join(dir, f));
}

/** Ghi chú sửa cho cảnh hoạt hình: Claude sửa mã cảnh hiện tại theo ghi chú (giữ brief); clip vẽ lại ở bước dựng. */
export async function reviseCartoon(projectId: string, video: Video, scene: Scene, T: SceneTiming, settings: ProjectSettings, note: string) {
  if (!aiAvailable()) throw new Error("Sửa cảnh hoạt hình bằng AI cần Claude API – hoặc nhờ Claude Code: pnpm cvs prompt cartoon <pid> <key> <sid> --note \"…\"");
  const policy = cartoonPolicy(settings);
  const d = scene.design!;
  const r = await writeCartoon(withCartoonPolicy(video, settings), scene, T, { brief: str(d.params.brief), clawd: policy.clawd, fast: policy.fast, layout: d.params.layout as never, note, current: str(d.params.code) || undefined },
    async (c) => (await testCartoon(projectId, video, scene, T, policy, c)).errors);
  scene.history = [...(scene.history ?? []), d].slice(-5);
  scene.design = { ...d, by: "ai", params: { ...d.params, code: r.code, clip: undefined } };
  scene.assumptions = [...new Set([...(scene.assumptions ?? []), ...r.assumptions.map((a) => `AI: ${a}`)])];
}

/** Cảnh mẫu cố định (nhân vật Kỹ sư phát hiện rủi ro) – để người dùng xem nhân vật + đo tốc độ vẽ trên máy này. */
export const CARTOON_SAMPLE = `function scene(t) {
  camBegin(960 + 18 * Math.sin(t * .5), 560, 1.03);
  boilSeed('wall'); paint(rectPts(-200, -200, 2320, 1500), { wash: '#E3ECF3', ink: null });
  boilSeed('floor'); paint(rectPts(-200, 840, 2320, 600), { wash: '#CDBEA4', ink: null });
  boilSeed('machine'); paint(rrPts(1180, 430, 460, 420, 28), { wash: '#8FA1AE', ink: PAL.ink, sw: 1.4 });
  boilSeed('panel'); paint(rrPts(1250, 500, 160, 110, 14), { wash: '#2F3C4A', ink: PAL.ink, sw: 1 });
  glow(1330, 555, 70, '#FF6B5A', .6 + .4 * pulse(t, 3));
  boilSeed('cable'); inkLine([[1180, 800], [1040, 830], [930, 815]], 3, '#3B3B3B', 'ink', .6);
  const mood = emotions(t, [[0, 'neutral'], [at(0, .55), 'surprised', { lookX: .9 }], [at(1, .2), 'determined']]);
  const w = stroll(t, at(0, .05), at(0, .45), 360, 700, 28);
  kysu(w.x, 850, 30, { ...mood, view: t < at(0, .45) ? 'side' : 'q', walk: w.walk, aR: t > at(1, .25) ? 1.3 : -.9 });
  camEnd();
}`;

/** Vẽ thử cảnh mẫu (3 khung) theo cài đặt hoạt hình của dự án: ảnh + tốc độ + GPU + ước tính 1 phút hoạt hình. */
export async function cartoonSample(projectId: string, settings: ProjectSettings) {
  const p = cartoonPolicy(settings);
  const r = await checkCartoon({ code: CARTOON_SAMPLE, dur: 6, cues: [0.3, 3.2], ends: [3, 5.8], fast: p.fast, clawd: p.clawd, theme: {} }, [1.2, 2.6, 4.6]);
  const dir = join(paths.cartoon(projectId), "check");
  mkdirSync(dir, { recursive: true });
  const frames = r.frames.map((f, k) => {
    const file = join(dir, `mau-${k}.jpg`);
    writeFileSync(file, f.jpg);
    return file;
  });
  const avg = r.ms.length ? Math.round(r.ms.reduce((a, b) => a + b, 0) / r.ms.length) : 0;
  return { errors: r.errors, frames, msPerFrame: avg, gpu: r.gpu, software: /swiftshader/i.test(r.gpu), perMinute: avg ? estimateSeconds(60, avg) : null };
}
