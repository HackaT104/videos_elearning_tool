import { describe, expect, it } from "vitest";
import { buildVideo, computeTiming } from "@cvs/core";
import { buildSceneSpec } from "@cvs/engine";
import { compileScene, lintScene, readTimingBlock, replaceTimingBlock } from "../src";

const v = buildVideo({ title: "B", fileName: "MO1_U1_1", scenes: [
  { scriptStart: 0, scriptEnd: 10, title: "Mở đầu", visual: "Chuỗi bước", onscreen: ["A → B → C"], vo: "Câu một. Câu hai. Câu ba." },
] }, { course: "C", level: "L1" }, 0);
const timing = computeTiming(v);
const good = compileScene(buildSceneSpec(v, v.scenes[0]), timing.scenes[0], { scene: v.scenes[0], videoKey: v.key });
const rules = (src: string) => lintScene(src, "s1").filter((i) => i.severity === "error").map((i) => i.rule);
const mutate = (from: string | RegExp, to: string) => {
  const out = good.replace(from, to);
  if (out === good) throw new Error(`mẫu không đổi: ${from}`);
  return out;
};
const TL = `tl.fromTo("#s1-st0",`;

describe("lint hợp đồng cảnh HyperFrames", () => {
  it("cảnh sinh tự động không có lỗi", () => expect(rules(good)).toEqual([]));
  const cases: [string, string, string][] = [
    ["header-comment", "<!-- s1 ·", "<!-- cảnh 1 ·"],
    ["template-wrap", "<template>", "<div>"],
    ["scene-root", '<div id="root" data-composition-id="s1"', '<div id="main" data-composition-id="s1"'],
    ["timing-block", "/*TIMING*/", "/*TIME*/"],
    ["at-helper", "const at = (i, f) =>", "const pos = (i, f) =>"],
    ["paused-timeline", "gsap.timeline({ paused: true })", "gsap.timeline()"],
    ["register-timeline", 'window.__timelines["s1"] = tl', 'window.__timelines["x"] = tl'],
    ["no-random", TL, `const r = Math.random(); ${TL}`],
    ["no-date", TL, `const d = Date.now(); ${TL}`],
    ["no-timer", TL, `setTimeout(() => {}, 10); ${TL}`],
    ["no-raf", TL, `requestAnimationFrame(() => {}); ${TL}`],
    ["no-infinite-repeat", /ease: "expo\.out" \}/, 'ease: "expo.out", repeat: -1 }'],
    ["no-autoalpha", "{ opacity: 0,", "{ autoAlpha: 0, opacity: 0,"],
    ["no-visibility", "{ opacity: 0,", '{ visibility: "hidden", opacity: 0,'],
    ["no-display", "{ opacity: 0,", '{ display: "none", opacity: 0,'],
    ["no-clip-class", 'class="card', 'class="clip card'],
    ["only-fromto", TL, `tl.to("#s1-st0", { opacity: 1 }, at(0, 0)); ${TL}`],
    ["hard-seconds", /, at\(1, [\d.]+\)\);/, ", 2.5);"],
    ["id-prefix", 'id="s1-st0"', 'id="box0"'],
    ["duplicate-id", 'id="s1-st1"', 'id="s1-st0"'],
    ["css-transform-conflict", 'id="s1-st0" class="card tone-accent" style="', 'id="s1-st0" class="card tone-accent" style="transform:scale(1.1);'],
    ["no-network", TL, `fetch("x"); ${TL}`],
    ["no-external-asset", "</template>", '<img src="https://cdn.example.com/a.png"></template>'],
    ["no-play", TL, `tl.play(); ${TL}`],
  ];
  it.each(cases)("%s", (rule, from, to) => expect(rules(mutate(from, to))).toContain(rule));
  it("ảnh chỉ được trỏ tới assets/img/<mã ảnh dự án>", () => {
    const img = (src: string) => rules(mutate("</template>", `<img src="${src}" alt=""></template>`));
    expect(img("assets/img/0123456789abcdef-1600x900.png")).toEqual([]);
    for (const bad of ["/etc/passwd", "../../x.png", "file:///C:/a.png", "data:image/svg+xml,<svg onload=alert(1)>", "assets/vo/x.mp3", "assets/img/../x.png", "assets/img/a.png"])
      expect(img(bad), bad).toContain("local-img-only");
  });
  it("cảnh trong ngoài <template>", () => expect(rules(good + "\n<div>ngoài</div>")).toContain("template-wrap"));
  it("đăng ký timeline trước tween", () => {
    const bad = good.replace('window.__timelines["s1"] = tl;', "").replace("const tl = gsap.timeline({ paused: true });", 'const tl = gsap.timeline({ paused: true });\nwindow.__timelines["s1"] = tl;');
    expect(rules(bad)).toContain("register-timeline");
  });
  it("ease không có bản Remotion → cảnh báo; tên GSAP rút gọn hợp lệ", () => {
    const warns = (src: string) => lintScene(src, "s1").filter((i) => i.rule === "unknown-ease");
    expect(warns(good)).toEqual([]);
    expect(warns(mutate(/ease: "expo\.out"/, 'ease: "rough"'))).toHaveLength(1);
    expect(warns(mutate(/ease: "expo\.out"/, 'ease: "elastic"'))).toEqual([]);
  });
  it("chữ nhỏ hơn 28px → cảnh báo", () => {
    expect(lintScene(good.replace("font-size:42px", "font-size:20px"), "s1").some((i) => i.rule === "min-font")).toBe(true);
  });
});

describe("khối TIMING", () => {
  it("build thay khối TIMING, giữ nguyên phần còn lại", () => {
    const T2 = { dur: 20, cues: [1, 5, 9], ends: [4, 8, 18] };
    const out = replaceTimingBlock(good, T2);
    expect(readTimingBlock(out)).toEqual(T2);
    expect(out.replace(/\/\*TIMING\*\/.*?\/\*\/TIMING\*\//, "")).toBe(good.replace(/\/\*TIMING\*\/.*?\/\*\/TIMING\*\//, ""));
  });
  it("mọi mốc tween đi qua at() hoặc < 1 s", () => {
    for (const m of good.matchAll(/\}, ([^;]+)\);$/gm)) expect(/at\(|T\.dur|^0(\.\d+)?$/.test(m[1]), m[1]).toBe(true);
  });
});
