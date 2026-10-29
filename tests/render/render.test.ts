// Render một video mẫu ~20 giây ở cả 5 theme, bằng cả HyperFrames và Remotion; so sánh thời lượng và tiếng.
// Chạy: pnpm test:render   (lâu: ~10 phút; cần Chromium + ffmpeg)
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StyleId } from "@cvs/core";
import { hfBuild, hfRender } from "@cvs/engine-hf";
import { rmtBuild, rmtRender } from "@cvs/engine-rmt";
import { THEME_IDS } from "@cvs/themes";
import { decodeToPcm, probe, rmsEnvelope, silenceDetect } from "@cvs/tts";
import { loadFixtureVideo, ROOT, voice } from "../../scripts/lib/demo-pipeline";

const run = process.env.CVS_RENDER_TESTS === "1";
const OUT = join(ROOT, "tests", ".out", "render-test");

/** Tương quan đường bao âm lượng 10 ms (bỏ qua lệch pha do mã hóa AAC/MP3), lấy giá trị tốt nhất trong ±20 ms. */
function envCorr(a: Float32Array, b: Float32Array, sr: number) {
  const lin = (e: Float32Array) => Float32Array.from(e, (x) => Math.pow(10, x / 20));
  const A = lin(rmsEnvelope(a, sr));
  const B = lin(rmsEnvelope(b, sr));
  let best = -1;
  for (let lag = -2; lag <= 2; lag++) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 3; i < Math.min(A.length, B.length) - 3; i++) { const x = A[i], y = B[i + lag]; ab += x * y; aa += x * x; bb += y * y; }
    best = Math.max(best, ab / Math.sqrt(aa * bb));
  }
  return best;
}

describe.runIf(run)("render 20 s × 5 theme × 2 bộ dựng", async () => {
  const base = await loadFixtureVideo(1);
  const voDir = join(OUT, "vo");
  mkdirSync(voDir, { recursive: true });
  const { manifest, timing } = await voice(base, voDir);
  it("video mẫu dài ~20 s", () => expect(timing.total).toBeGreaterThan(15));

  for (const style of THEME_IDS) {
    it(`${style}: HyperFrames và Remotion cùng thời lượng & tiếng`, async () => {
      const video = { ...base, style: style as StyleId };
      const hfDir = join(OUT, style, "hf");
      const rmDir = join(OUT, style, "rmt");
      await hfBuild({ video, timing, manifest, voDir, workDir: hfDir });
      await rmtBuild({ video: { ...video, engine: "remotion" }, timing, manifest, voDir, workDir: rmDir });
      const a = await hfRender(hfDir, timing, join(OUT, `${style}-hyperframes.mp4`), { concurrency: 3 });
      const b = await rmtRender({ video: { ...video, engine: "remotion" }, timing, manifest, voDir, workDir: rmDir }, join(OUT, `${style}-remotion.mp4`));
      for (const r of [a, b]) {
        expect(Math.abs(r.duration - timing.total)).toBeLessThanOrEqual(0.2);
        const info = await probe(r.file);
        expect(info.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac")).toBe(true);
        expect(info.streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1920, height: 1080 });
        expect(await silenceDetect(r.file, -45, 2.5)).toEqual([]);
      }
      expect(Math.abs(a.duration - b.duration)).toBeLessThanOrEqual(0.1);
      const pa = await decodeToPcm(a.file, 8000);
      const pb = await decodeToPcm(b.file, 8000);
      expect(envCorr(pa, pb, 8000)).toBeGreaterThan(0.95);
    }, 600_000);
  }
});
