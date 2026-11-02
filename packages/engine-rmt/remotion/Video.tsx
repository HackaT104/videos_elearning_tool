import React from "react";
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import { CUSTOM_SCENES } from "./custom/registry";
import { loadFontsSync } from "./fonts";
import { SpecScene } from "./SpecScene";
import type { RmtProps } from "./types";

const CustomScene: React.FC<{ name: string; T: any }> = ({ name, T }) => {
  const C = CUSTOM_SCENES[name];
  return C ? <C T={T} /> : null;
};

export const CourseVideo: React.FC<RmtProps> = (props) => {
  loadFontsSync(props.fonts);
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ background: "var(--bg)" }}>
      <style>{props.css}</style>
      <div dangerouslySetInnerHTML={{ __html: props.sketch + props.ground }} style={{ position: "absolute", inset: 0 }} />
      {props.scenes.map((s) => (
        <Sequence key={s.id} from={f(s.start)} durationInFrames={Math.max(1, f(s.start + s.dur) - f(s.start))} name={`${s.id} · ${s.spec.template}`}>
          {s.custom ? (
            <div className="cvs-scene" id={s.id}>
              <CustomScene name={s.custom} T={s.T} />
            </div>
          ) : (
            <SpecScene scene={s} probe={props.probe} />
          )}
        </Sequence>
      ))}
      {props.overlay && (
        <Sequence from={0} durationInFrames={Math.max(1, f(props.total))} name="phụ đề và logo">
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <SpecScene scene={props.overlay} />
          </div>
        </Sequence>
      )}
      {props.scenes
        .filter((s) => s.audio)
        .map((s) => (
          <Sequence key={`vo-${s.id}`} from={f(s.start + s.audio!.from)} durationInFrames={Math.max(1, f(s.audio!.dur) + 1)} name={`giọng ${s.id}`}>
            <Audio src={s.audio!.src} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
