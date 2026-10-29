import type { RenderEngine } from "@cvs/engine";
import { hfBuild } from "./build";
import { hfPreview } from "./preview";
import { hfRender, type HfRenderOptions } from "./render";

export * from "./build";
export * from "./compile";
export * from "./lint";
export * from "./preview";
export * from "./render";
export * from "./server";
export * from "./harness";

export function createHyperFramesEngine(opts: HfRenderOptions = {}): RenderEngine {
  return {
    id: "hyperframes",
    build: (input) => hfBuild(input),
    preview: (input, times, outDir) => hfPreview(input.workDir, times, outDir),
    render: (input, out, onProgress) => hfRender(input.workDir, input.timing, out, { ...opts, onProgress }),
  };
}
