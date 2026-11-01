// Lint hợp đồng file cảnh HyperFrames (mục 6A.3) bằng regex/parse nhẹ. Vi phạm → trả lại LLM sửa.

import { isKnownEase } from "@cvs/engine";

export type LintIssue = { rule: string; severity: "error" | "warning"; message: string; line?: number };

function lineOf(src: string, idx: number) {
  return src.slice(0, idx).split("\n").length;
}

/** Tách đối số cấp cao nhất của lời gọi bắt đầu tại vị trí '(' */
function callArgs(src: string, open: number): { args: string[]; end: number } | null {
  let depth = 0;
  let cur = "";
  const args: string[] = [];
  let str: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (str) {
      cur += c;
      if (c === "\\") {
        cur += src[++i] ?? "";
        continue;
      }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      cur += c;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") {
      depth++;
      if (depth === 1 && c === "(") continue;
    } else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0 && c === ")") {
        args.push(cur.trim());
        return { args, end: i };
      }
    } else if (c === "," && depth === 1) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  return null;
}

const FORBIDDEN: [RegExp, string, string][] = [
  [/Math\.random\s*\(/g, "no-random", "Cấm Math.random (không tất định)"],
  [/Date\.now\s*\(|new Date\s*\(/g, "no-date", "Cấm Date.now/new Date (không tất định)"],
  [/\bsetTimeout\s*\(|\bsetInterval\s*\(/g, "no-timer", "Cấm timer (setTimeout/setInterval)"],
  [/requestAnimationFrame\s*\(/g, "no-raf", "Cấm requestAnimationFrame"],
  [/repeat\s*:\s*-\s*1/g, "no-infinite-repeat", "Cấm repeat: -1"],
  [/autoAlpha\s*:/g, "no-autoalpha", "Cấm tween autoAlpha (chỉ dùng opacity)"],
  [/\bvisibility\s*:\s*["'`]/g, "no-visibility", "Cấm tween visibility"],
  [/\bdisplay\s*:\s*["'`]/g, "no-display", "Cấm tween display"],
  [/class\s*=\s*["'][^"']*\bclip\b/g, "no-clip-class", 'Cấm class="clip" bên trong cảnh'],
  [/\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(/g, "no-network", "Cấm tải mạng trong cảnh"],
  [/\.play\s*\(\s*\)/g, "no-play", "Không gọi play() – runtime tự tua timeline"],
  [/(?:src|href)\s*=\s*["']https?:\/\//g, "no-external-asset", "Không dùng tài nguyên từ Internet/CDN khi render"],
  [/@import\s+url\(\s*["']?https?:/g, "no-external-font", "Không tải phông từ Google Fonts/CDN"],
  [/\btl\.(?:to|from|set|staggerTo|staggerFrom)\s*\(|\bgsap\.(?:to|from|fromTo|set)\s*\(/g, "only-fromto", "Chỉ dùng tl.fromTo"],
];

export function lintScene(src: string, sceneId: string): LintIssue[] {
  const out: LintIssue[] = [];
  const err = (rule: string, message: string, idx?: number) => out.push({ rule, severity: "error", message, line: idx !== undefined ? lineOf(src, idx) : undefined });
  const warn = (rule: string, message: string, idx?: number) => out.push({ rule, severity: "warning", message, line: idx !== undefined ? lineOf(src, idx) : undefined });

  if (!new RegExp(`^\\s*<!--\\s*${sceneId}\\s*·`).test(src)) err("header-comment", `Thiếu chú thích mở đầu "<!-- ${sceneId} · <tên cảnh> (kịch bản m:ss–m:ss) … -->"`);
  const tOpen = src.indexOf("<template>");
  const tClose = src.lastIndexOf("</template>");
  if (tOpen < 0 || tClose < 0) err("template-wrap", "Toàn bộ style, markup, script phải nằm trong <template>");
  else {
    const outside = (src.slice(0, tOpen) + src.slice(tClose + 11)).replace(/<!--[\s\S]*?-->/g, "").trim();
    if (outside) err("template-wrap", "Có nội dung nằm ngoài <template>");
  }
  if (!new RegExp(`<div\\s+id="root"\\s+data-composition-id="${sceneId}"`).test(src)) err("scene-root", `Gốc cảnh phải là <div id="root" data-composition-id="${sceneId}" …>`);
  const tm = src.match(/const T = \/\*TIMING\*\/([\s\S]*?)\/\*\/TIMING\*\/;/);
  if (!tm) err("timing-block", "Thiếu dòng const T = /*TIMING*/{…}/*/TIMING*/;");
  else {
    try {
      const T = JSON.parse(tm[1]);
      if (typeof T.dur !== "number" || !Array.isArray(T.cues) || !Array.isArray(T.ends)) err("timing-block", "Khối TIMING phải có dur, cues, ends");
    } catch {
      err("timing-block", "Khối TIMING không phải JSON hợp lệ");
    }
  }
  if (!/const at = \(i, f\) =>/.test(src)) err("at-helper", "Thiếu hàm const at = (i, f) => …");
  if (!/gsap\.timeline\(\s*\{\s*paused:\s*true\s*\}\s*\)/.test(src)) err("paused-timeline", "Phải tạo đúng một timeline: gsap.timeline({ paused: true })");
  if ((src.match(/gsap\.timeline\(/g) ?? []).length > 1) err("single-timeline", "Chỉ được một timeline mỗi cảnh");
  const reg = src.lastIndexOf(`window.__timelines["${sceneId}"] = tl`);
  if (reg < 0) err("register-timeline", `Thiếu window.__timelines["${sceneId}"] = tl ở cuối`);
  else {
    const lastTween = src.lastIndexOf("tl.fromTo(");
    if (lastTween > reg) err("register-timeline", "Đăng ký timeline phải ở sau mọi tween");
  }
  for (const [re, rule, msg] of FORBIDDEN) for (const m of src.matchAll(re)) err(rule, msg, m.index);

  // vị trí tween: phải đi qua at() hoặc T.dur; giây cứng chỉ cho phép < 1 s (tiêu đề)
  const tweened = new Set<string>();
  for (const m of src.matchAll(/tl\.fromTo\s*\(/g)) {
    const open = m.index! + m[0].length - 1;
    const call = callArgs(src, open);
    if (!call) {
      err("syntax", "tl.fromTo không đóng ngoặc", m.index);
      continue;
    }
    const [target, , vars, pos] = call.args;
    const sel = target?.match(/^["'`]#([\w-]+)["'`]$/);
    if (sel) tweened.add(sel[1]);
    if (pos === undefined) err("hard-seconds", "Thiếu vị trí tween – dùng at(i, f)", m.index);
    else if (/^[\d.]+$/.test(pos)) {
      if (Number(pos) >= 1) err("hard-seconds", `Mốc cứng ${pos}s – dùng at(i, f) (chỉ tiêu đề < 1 s được giây cứng)`, m.index);
    } else if (!/\bat\(|T\.dur|T\.cues|T\.ends/.test(pos)) err("hard-seconds", `Vị trí "${pos}" không đi qua at()/T`, m.index);
    if (vars && /\brepeat\s*:\s*\d/.test(vars)) warn("repeat", "Có repeat hữu hạn – kiểm tra tất định", m.index);
    // ease lạ: GSAP vẫn chạy nhưng Remotion không có công thức → hai bộ dựng lệch hình
    const ease = vars?.match(/\bease\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
    if (ease && !isKnownEase(ease)) warn("unknown-ease", `Ease "${ease}" không có bản khớp GSAP cho Remotion – dùng power/sine/expo/circ/back/elastic/bounce`, m.index);
  }

  // id phải có tiền tố sN- (kể cả <symbol>, <filter>, gradient)
  const ids = [...src.matchAll(/(?<![\w-])id\s*=\s*"([^"]+)"/g)];
  const seen = new Map<string, number>();
  for (const m of ids) {
    const id = m[1];
    if (id === "root") continue;
    if (!id.startsWith(`${sceneId}-`)) err("id-prefix", `id "${id}" phải có tiền tố "${sceneId}-"`, m.index);
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) err("duplicate-id", `id "${id}" bị trùng`);
  for (const m of src.matchAll(/url\(#([\w-]+)\)/g)) if (!m[1].startsWith(`${sceneId}-`) && !m[1].startsWith("cvs-")) err("id-prefix", `Tham chiếu url(#${m[1]}) phải có tiền tố`, m.index);

  // CSS transform trên phần tử được GSAP tween
  for (const id of tweened) {
    const cssRule = new RegExp(`#${id}\\s*\\{[^}]*(?<![\\w-])transform\\s*:`, "m");
    const inline = new RegExp(`id="${id}"[^>]*style="[^"]*(?<![\\w-])transform\\s*:`, "m");
    if (cssRule.test(src) || inline.test(src)) err("css-transform-conflict", `Phần tử #${id} vừa có CSS transform vừa được GSAP tween`);
  }
  for (const m of src.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
    const size = Number(m[1]);
    const ctx = src.slice(Math.max(0, m.index! - 200), m.index!);
    if (size < 28 && !/src-line/.test(ctx)) warn("min-font", `Chữ ${size}px < 28px`, m.index);
  }
  return out;
}

export const lintErrors = (issues: LintIssue[]) => issues.filter((i) => i.severity === "error");
