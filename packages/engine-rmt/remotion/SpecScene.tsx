// Cảnh từ SceneSpec: markup chung (html-react-parser) + style theo khung hình tính bằng interpolate/ease.

import parse, { attributesToProps, domToReact, Element, type DOMNode, type HTMLReactParserOptions } from "html-react-parser";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EXIT, LAYOUT_PROBE_JS, type Anim } from "@cvs/engine/browser";
import { countText, propsAt, resolveAnims, styleOf } from "./anim";
import type { RmtScene } from "./types";

export const SpecScene: React.FC<{ scene: RmtScene; probe?: boolean }> = ({ scene, probe }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const stageId = `${scene.id}-stage`;
  const resolved = useMemo(() => {
    const exit: Anim = { id: stageId, from: { opacity: 1, blur: 0 }, to: EXIT.to, at: EXIT.at, dur: EXIT.dur, ease: EXIT.ease };
    return resolveAnims([...scene.spec.anims, exit], scene.T);
  }, [scene, stageId]);
  const counts = useMemo(() => new Map(scene.spec.counts.map((c) => [c.id, c])), [scene]);

  const options: HTMLReactParserOptions = {
    replace(node) {
      if (!(node instanceof Element)) return undefined;
      const id = node.attribs.id;
      if (!id || (!resolved.has(id) && !counts.has(id))) return undefined;
      const props = attributesToProps(node.attribs) as Record<string, any>;
      const anim = resolved.get(id);
      if (anim) props.style = { ...(props.style ?? {}), ...styleOf(propsAt(anim, t)) };
      const c = counts.get(id);
      const children = c ? countText(c, scene.T, t) : domToReact(node.children as DOMNode[], options);
      return React.createElement(node.name, props, children);
    },
  };
  const content = parse(scene.spec.html, options);
  const stageStyle = styleOf(propsAt(resolved.get(stageId)!, t));
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!probe || !ref.current) return;
    if (!(window as any).__cvsLayout) new Function(LAYOUT_PROBE_JS)();
    const issues = (window as any).__cvsLayout(ref.current);
    console.log("CVS_LAYOUT " + JSON.stringify({ scene: scene.id, t, issues }));
  });
  return (
    <div id={scene.id} ref={ref} style={{ position: "absolute", inset: 0 }}>
      <style>{scene.spec.css}</style>
      <div id={stageId} className="cvs-scene" style={stageStyle}>
        {content}
      </div>
    </div>
  );
};
