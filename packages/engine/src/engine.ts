// Giao diện chung cho hai bộ dựng (mục 2): RenderEngine { build, preview, render }.

import type { EngineId, Timing, Video, VoiceManifest } from "@cvs/core";

export type BuildInput = {
  video: Video;
  timing: Timing;
  manifest: VoiceManifest | null;
  /** Thư mục chứa giọng đọc (sN-hash.mp3 + manifest.json). */
  voDir: string;
  /** Thư mục làm việc của bộ dựng cho video này. */
  workDir: string;
};

export type BuildResult = { workDir: string; files: string[]; warnings: string[]; assumptions: Record<string, string[]> };

export type PreviewFrame = { t: number; file: string; scene?: string; label?: string };
export type LayoutIssue = { scene: string; t: number; kind: "overflow-safe" | "overlap" | "small-text" | "card-overflow" | "clipped"; id: string; detail: string };
export type PreviewResult = { frames: PreviewFrame[]; errors: string[]; layout: LayoutIssue[] };

export type RenderProgress = { phase: string; frame?: number; total?: number; pct: number };
export type RenderResult = { file: string; duration: number; renderer: string };

export interface RenderEngine {
  id: EngineId;
  build(input: BuildInput): Promise<BuildResult>;
  preview(input: BuildInput, times: { t: number; scene?: string; label?: string }[], outDir: string): Promise<PreviewResult>;
  render(input: BuildInput, outFile: string, onProgress?: (p: RenderProgress) => void): Promise<RenderResult>;
}

/** Các thời điểm chụp QA: mỗi mốc câu + 1,5 s và dur − 0,6 của mọi cảnh (mục 7.1). */
export function qaTimes(timing: Timing): { t: number; scene: string; label: string }[] {
  const out: { t: number; scene: string; label: string }[] = [];
  for (const s of timing.scenes) {
    s.cues.forEach((c, i) => {
      const t = Math.min(s.start + c + 1.5, s.start + s.dur - 0.6);
      out.push({ t: r3(t), scene: s.id, label: `${s.id} · câu ${i + 1} + 1,5 s` });
    });
    out.push({ t: r3(s.start + s.dur - 0.6), scene: s.id, label: `${s.id} · cuối cảnh` });
  }
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
