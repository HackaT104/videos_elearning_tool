import React from "react";
import { Composition } from "remotion";
import { CourseVideo } from "./Video";
import type { RmtProps } from "./types";

const EMPTY: RmtProps = { videoKey: "trống", fps: 30, width: 1920, height: 1080, total: 2, css: "", ground: "", sketch: "", fonts: [], scenes: [] };

export const Root: React.FC = () => (
  <Composition
    id="CourseVideo"
    component={CourseVideo as unknown as React.FC<Record<string, unknown>>}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={60}
    defaultProps={EMPTY as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as RmtProps;
      return { durationInFrames: Math.max(1, Math.round(p.total * p.fps)), fps: p.fps, width: p.width, height: p.height };
    }}
  />
);
