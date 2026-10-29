import type { Anim, CountAnim, SceneTimingLike } from "@cvs/engine/browser";

export type RmtFont = { family: string; weight: number; unicodeRange: string; base64: string };

export type RmtScene = {
  id: string;
  start: number;
  dur: number;
  T: SceneTimingLike;
  audio?: { src: string; from: number; dur: number };
  spec: { html: string; css: string; anims: Anim[]; counts: CountAnim[]; template: string };
  /** Khóa cảnh tùy biến (TSX) trong custom/registry. */
  custom?: string;
};

export type RmtProps = {
  videoKey: string;
  fps: number;
  width: number;
  height: number;
  total: number;
  css: string;
  ground: string;
  sketch: string;
  fonts: RmtFont[];
  scenes: RmtScene[];
  /** Bật đo bố cục (renderStill cho QA). */
  probe?: boolean;
};
