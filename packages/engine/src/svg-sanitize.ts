// Lọc SVG theo danh sách cho phép (allow-list) – dùng cho hình minh hoạ do Claude vẽ và ảnh SVG người dùng tải lên.
// Không sửa chuỗi đầu vào bằng regex: tách thẻ → dựng cây chỉ gồm thẻ/thuộc tính hợp lệ (giá trị kiểm bằng mẫu chặt) → in lại
// từ đầu (mọi giá trị được escape). Thuộc tính trình bày (fill, stroke…) và khai báo style="" được kiểm từng giá trị rồi gom vào
// style="" của đầu ra. Cấu trúc hỏng, DOCTYPE có khai báo thực thể (XXE/billion laughs), quá lớn → từ chối cả file.
//   mode "illustration": chỉ hình cơ bản + nhóm, màu CHỈ qua biến theme var(--accent|…) hoặc none, lớp chỉ "draw", không chữ.
//   mode "asset": thêm defs/gradient/clipPath/mask/use(#id)/text/style (CSS đã lọc), màu tự do (hex/rgb/tên/url(#id)).

export type SvgMode = "illustration" | "asset";
export type SvgEl = { tag: string; attrs: Record<string, string>; style: Record<string, string>; children: (SvgEl | string)[] };
export type SvgParse = { root: SvgEl | null; warnings: string[]; error?: string };

export const THEME_COLOR_VARS = ["accent", "alt", "money", "warn", "ink", "ink-soft", "card", "bg2", "line"] as const;

const MAX_LEN = { illustration: 400_000, asset: 2_000_000 };
const MAX_ELEMENTS = { illustration: 600, asset: 20_000 };
const MAX_DEPTH = 32;

const SHAPES = ["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"];
const TAGS: Record<SvgMode, Set<string>> = {
  illustration: new Set(["svg", "g", ...SHAPES]),
  asset: new Set(["svg", "g", ...SHAPES, "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "symbol", "use", "text", "tspan", "title", "desc", "style"]),
};
/** Thẻ được giữ nội dung chữ (chỉ mode asset). */
const TEXT_TAGS = new Set(["text", "tspan", "title", "desc", "style"]);
/** Nội dung thô (không tách thẻ bên trong) – bỏ thẳng tới thẻ đóng. */
const RAW_TAGS = new Set(["script", "style"]);

// ---- kiểm giá trị ----
const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:%|px|em)?$/;
const NUMS = /^[-+\d.eE\s,%]*$/;
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz\d\s,.+\-eE]*$/;
const TRANSFORM = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+\d.eE\s,]*\)\s*,?)*\s*$/;
const ID = /^[A-Za-z][\w-]{0,63}$/;
const THEME_VAR = new RegExp(`^var\\(--(?:${THEME_COLOR_VARS.join("|")})\\)$`);
const COLOR = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\(\s*[-+\d.%\s,/]*\)|[a-zA-Z]{3,20})$/;
const URL_REF = /^url\(\s*#[A-Za-z][\w-]{0,63}\s*\)$/;
const enumOf = (...v: string[]) => (s: string) => v.includes(s);
const num = (s: string) => NUM.test(s);

type Check = (v: string, mode: SvgMode) => boolean;

const paint: Check = (v, mode) => v === "none" || (mode === "illustration" ? THEME_VAR.test(v) : COLOR.test(v) || URL_REF.test(v) || THEME_VAR.test(v));

/** Thuộc tính trình bày (đi vào style="" của đầu ra). */
const PRESENT: Record<string, Check> = {
  fill: paint,
  stroke: paint,
  "stroke-width": (v) => num(v),
  "stroke-linecap": enumOf("butt", "round", "square"),
  "stroke-linejoin": enumOf("miter", "round", "bevel", "arcs", "miter-clip"),
  "stroke-miterlimit": (v) => num(v),
  "stroke-dasharray": (v) => v === "none" || (NUMS.test(v) && v.length < 200),
  "stroke-dashoffset": (v) => num(v),
  "fill-rule": enumOf("nonzero", "evenodd"),
  "clip-rule": enumOf("nonzero", "evenodd"),
  opacity: (v) => num(v),
  "fill-opacity": (v) => num(v),
  "stroke-opacity": (v) => num(v),
  "vector-effect": enumOf("none", "non-scaling-stroke"),
};
const PRESENT_ASSET: Record<string, Check> = {
  "clip-path": (v) => v === "none" || URL_REF.test(v),
  mask: (v) => v === "none" || URL_REF.test(v),
  "stop-color": (v) => COLOR.test(v),
  "stop-opacity": (v) => num(v),
  color: (v) => COLOR.test(v),
  "font-family": (v) => /^[\w\s,'"-]{1,120}$/.test(v),
  "font-size": (v) => num(v),
  "font-weight": (v) => /^(?:normal|bold|bolder|lighter|[1-9]00)$/.test(v),
  "font-style": enumOf("normal", "italic", "oblique"),
  "text-anchor": enumOf("start", "middle", "end"),
  "dominant-baseline": enumOf("auto", "middle", "central", "hanging", "alphabetic", "text-top", "text-bottom", "mathematical", "ideographic"),
  "letter-spacing": (v) => num(v) || v === "normal",
};

/** Thuộc tính hình học (giữ là thuộc tính). Tên chuẩn theo hoa/thường SVG. */
const GEOM: Record<string, Check> = {
  d: (v) => PATH_D.test(v) && v.length <= 60_000,
  pathLength: (v) => num(v),
  cx: num, cy: num, r: num, rx: num, ry: num, x: num, y: num, x1: num, y1: num, x2: num, y2: num, width: num, height: num, dx: num, dy: num,
  fx: num, fy: num, offset: num,
  points: (v) => NUMS.test(v) && v.length <= 60_000,
  transform: (v) => TRANSFORM.test(v) && v.length <= 500,
  viewBox: (v) => /^\s*[-+\d.eE]+(?:[\s,]+[-+\d.eE]+){3}\s*$/.test(v) && v.split(/[\s,]+/).filter(Boolean).every(num),
  preserveAspectRatio: (v) => /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(?:meet|slice))?$/.test(v),
  gradientUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
  gradientTransform: (v) => TRANSFORM.test(v) && v.length <= 500,
  spreadMethod: enumOf("pad", "reflect", "repeat"),
  clipPathUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
  maskUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
  maskContentUnits: enumOf("userSpaceOnUse", "objectBoundingBox"),
  href: (v) => /^#[A-Za-z][\w-]{0,63}$/.test(v),
};
/** Thuộc tính hình học cho phép theo thẻ (ngoài id/class/style/trình bày). */
const GEOM_BY_TAG: Record<string, string[]> = {
  svg: ["viewBox", "width", "height", "preserveAspectRatio"],
  g: ["transform"],
  path: ["d", "pathLength", "transform"],
  circle: ["cx", "cy", "r", "pathLength", "transform"],
  ellipse: ["cx", "cy", "rx", "ry", "pathLength", "transform"],
  rect: ["x", "y", "width", "height", "rx", "ry", "pathLength", "transform"],
  line: ["x1", "y1", "x2", "y2", "pathLength", "transform"],
  polyline: ["points", "pathLength", "transform"],
  polygon: ["points", "pathLength", "transform"],
  linearGradient: ["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform", "spreadMethod"],
  radialGradient: ["cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform", "spreadMethod"],
  stop: ["offset"],
  clipPath: ["clipPathUnits", "transform"],
  mask: ["x", "y", "width", "height", "maskUnits", "maskContentUnits"],
  symbol: ["viewBox", "preserveAspectRatio"],
  use: ["href", "x", "y", "width", "height", "transform"],
  text: ["x", "y", "dx", "dy", "transform"],
  tspan: ["x", "y", "dx", "dy"],
};
const CANON = new Map(Object.keys(GEOM).map((k) => [k.toLowerCase(), k]));

/** CSS trong <style> (chỉ mode asset): không tải ngoài, không biểu thức, không thoát chuỗi. */
export function safeCss(css: string): boolean {
  const c = css.toLowerCase();
  if (/@import|@font-face|@namespace|expression\s*\(|javascript:|behavior\s*:|-moz-binding|\\|<\/?|image-set|cross-fade|\bsrc\s*\(/.test(c)) return false;
  for (const m of c.matchAll(/url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/g)) if (!/^#[a-z][\w-]*$/.test(m[2].trim())) return false;
  return !/url\s*\(/.test(c.replace(/url\s*\(\s*(['"]?)#[a-z][\w-]*\1\s*\)/g, ""));
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Giải mã thực thể; thực thể lạ (có thể do DOCTYPE khai báo) → null. */
function decode(s: string): string | null {
  let bad = false;
  const out = s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z]\w{0,31});?/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!(cp > 0 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) return (bad = true), "";
      return String.fromCodePoint(cp);
    }
    if (e in ENT) return ENT[e];
    bad = true;
    return "";
  });
  return bad ? null : out;
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// chuẩn hoá khoảng trắng; ký tự điều khiển bị loại (tránh lách mẫu kiểm)
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();

function styleDecls(s: string): [string, string][] {
  return s
    .split(";")
    .map((d) => d.split(":"))
    .filter((p) => p.length === 2)
    .map(([k, v]) => [k.trim().toLowerCase(), clean(v).replace(/\s*!important$/i, "")]);
}

/** Mở/đóng/tự đóng thẻ tại vị trí '<' (đã chắc chắn không phải chú thích/CDATA/khai báo). */
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTR_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Phân tích + lọc SVG. Trả root = null kèm error nếu không dùng được. */
export function parseSvg(src: string, mode: SvgMode = "illustration"): SvgParse {
  const warnings: string[] = [];
  const fail = (error: string): SvgParse => ({ root: null, warnings, error });
  if (typeof src !== "string" || !src.trim()) return fail("SVG rỗng");
  if (src.length > MAX_LEN[mode]) return fail(`SVG quá lớn (${src.length} ký tự)`);
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(src)) return fail("SVG có khai báo DOCTYPE/ENTITY – bị từ chối");

  const allowed = TAGS[mode];
  const stack: { tag: string; el: SvgEl | null }[] = [];
  let root: SvgEl | null = null;
  let count = 0;
  const dropped = new Set<string>();
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const text = src.slice(i, lt < 0 ? n : lt);
    if (text.trim()) {
      const top = stack.at(-1);
      if (!top) {
        if (root) break; // phần thừa sau thẻ gốc
        return fail("Có chữ nằm ngoài thẻ <svg>");
      }
      if (top.el && TEXT_TAGS.has(top.el.tag)) {
        const t = decode(text);
        if (t === null) warnings.push("Bỏ chữ có thực thể lạ");
        else top.el.children.push(t);
      }
    }
    if (lt < 0) break;
    i = lt;
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      if (e < 0) return fail("Chú thích không đóng");
      i = e + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const e = src.indexOf("]]>", i);
      if (e < 0) return fail("CDATA không đóng");
      const top = stack.at(-1);
      if (top?.el && top.el.tag === "style") top.el.children.push(src.slice(i + 9, e));
      i = e + 3;
      continue;
    }
    if (src.startsWith("<?", i) || src.startsWith("<!", i)) {
      if (root || stack.length) return fail("Khai báo XML nằm trong thân SVG");
      const e = src.indexOf(">", i);
      if (e < 0) return fail("Khai báo không đóng");
      i = e + 1;
      continue;
    }
    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(src);
    if (!m) return fail(`Thẻ hỏng ở vị trí ${i}`);
    i = TAG_RE.lastIndex;
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    if (closing) {
      const top = stack.pop();
      if (!top || top.tag !== rawTag) return fail(`Thẻ đóng </${rawTag}> không khớp`);
      if (stack.length === 0) break; // xong thẻ gốc
      continue;
    }
    if (++count > MAX_ELEMENTS[mode]) return fail(`Quá nhiều phần tử (> ${MAX_ELEMENTS[mode]})`);
    if (stack.length >= MAX_DEPTH) return fail("Lồng thẻ quá sâu");
    const parent = stack.at(-1);
    if (!parent && root) break;
    if (!parent && rawTag !== "svg") return fail("Thẻ gốc phải là <svg>");
    const keep = allowed.has(rawTag) && (!parent || parent.el !== null);
    if (!allowed.has(rawTag)) dropped.add(rawTag);
    // script/style (style bị cấm) → bỏ thẳng tới thẻ đóng, kể cả khi chứa "<"
    if (RAW_TAGS.has(rawTag.toLowerCase()) && !selfClose) {
      const close = new RegExp(`</${rawTag}\\s*>`, "ig");
      close.lastIndex = i;
      const cm = close.exec(src);
      if (!cm) return fail(`<${rawTag}> không đóng`);
      if (keep && rawTag === "style") {
        const css = src.slice(i, cm.index).replace(/<!\[CDATA\[|\]\]>/g, "");
        if (safeCss(css)) parent!.el!.children.push({ tag: "style", attrs: {}, style: {}, children: [css] });
        else warnings.push("Bỏ <style> có CSS không an toàn");
      }
      i = close.lastIndex;
      continue;
    }
    const el: SvgEl | null = keep ? { tag: rawTag, attrs: {}, style: {}, children: [] } : null;
    if (el) {
      const ok = readAttrs(el, rawAttrs, mode, warnings);
      if (!ok) return fail("Thuộc tính có thực thể lạ");
      if (parent) parent.el!.children.push(el);
      else root = el;
    }
    if (!selfClose) stack.push({ tag: rawTag, el });
    else if (!parent) break;
  }
  if (!root) return fail("Không có thẻ <svg>");
  if (stack.length) return fail(`Thẻ <${stack.at(-1)!.tag}> không đóng`);
  if (dropped.size) warnings.push(`Đã bỏ thẻ: ${[...dropped].slice(0, 10).join(", ")}`);
  return { root, warnings };
}

function readAttrs(el: SvgEl, raw: string, mode: SvgMode, warnings: string[]): boolean {
  const geomOk = new Set(GEOM_BY_TAG[el.tag] ?? []);
  const present = mode === "asset" ? { ...PRESENT, ...PRESENT_ASSET } : PRESENT;
  const seen = new Set<string>();
  const styleIn: [string, string][] = [];
  for (const a of raw.matchAll(ATTR_RE)) {
    const name = a[1];
    const lname = name.toLowerCase();
    if (seen.has(lname)) continue;
    seen.add(lname);
    const rawVal = a[2] ?? a[3] ?? a[4];
    if (rawVal === undefined) continue;
    const dv = decode(rawVal);
    if (dv === null) return false;
    const v = clean(dv);
    if (lname === "style") {
      styleIn.push(...styleDecls(v));
      continue;
    }
    if (lname === "id") {
      if (ID.test(v)) el.attrs.id = v;
      continue;
    }
    if (lname === "class") {
      const toks = v.split(" ").filter((t) => /^[A-Za-z][\w-]{0,40}$/.test(t) && (mode === "asset" || t === "draw"));
      if (toks.length) el.attrs.class = toks.join(" ");
      continue;
    }
    // xlink:href / href chỉ trỏ nội bộ (#id) trên <use>
    const canon = lname === "xlink:href" ? "href" : CANON.get(lname);
    if (canon && geomOk.has(canon)) {
      if (GEOM[canon](v, mode)) el.attrs[canon] = v;
      continue;
    }
    if (lname in present) {
      if (present[lname](v, mode)) el.style[lname] = v;
      else if (mode === "illustration" && (lname === "fill" || lname === "stroke")) {
        el.style[lname] = lname === "fill" ? "var(--ink-soft)" : "var(--ink)";
        warnings.push(`Màu "${v.slice(0, 30)}" không phải biến theme – đổi sang ${el.style[lname]}`);
      }
    }
    // còn lại (on*, href ngoài, xmlns:*, sodipodi:*, …) bị bỏ
  }
  for (const [k, v] of styleIn) {
    if (k in present && present[k](v, mode)) el.style[k] = v;
    else if (mode === "illustration" && (k === "fill" || k === "stroke") && v) {
      el.style[k] = k === "fill" ? "var(--ink-soft)" : "var(--ink)";
      warnings.push(`Màu "${v.slice(0, 30)}" không phải biến theme – đổi sang ${el.style[k]}`);
    }
  }
  return true;
}

/** In lại cây đã lọc. rename: đổi id (và tham chiếu #id) – dùng để thêm tiền tố cảnh. */
export function serializeSvg(el: SvgEl, o: { rename?: (id: string) => string; xmlns?: boolean } = {}): string {
  const rn = o.rename ?? ((x: string) => x);
  const fixRef = (v: string) => v.replace(/#([A-Za-z][\w-]*)/g, (_, id: string) => `#${rn(id)}`);
  const attrs = Object.entries(el.attrs).map(([k, v]) => {
    const val = k === "id" ? rn(v) : k === "href" ? fixRef(v) : v;
    return ` ${k}="${escAttr(val)}"`;
  });
  const st = Object.entries(el.style).map(([k, v]) => `${k}:${URL_REF.test(v) ? fixRef(v) : v}`);
  if (st.length) attrs.push(` style="${escAttr(st.join(";"))}"`);
  if (o.xmlns && el.tag === "svg") attrs.unshift(` xmlns="http://www.w3.org/2000/svg"`);
  if (!el.children.length) return `<${el.tag}${attrs.join("")}/>`;
  const inner = el.children.map((c) => (typeof c === "string" ? escText(c) : serializeSvg(c, { rename: o.rename }))).join("");
  return `<${el.tag}${attrs.join("")}>${inner}</${el.tag}>`;
}

/** viewBox [x, y, w, h] của gốc (hoặc từ width/height), mặc định 0 0 800 600. */
export function svgViewBox(root: SvgEl): [number, number, number, number] {
  const vb = root.attrs.viewBox?.split(/[\s,]+/).filter(Boolean).map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return vb as [number, number, number, number];
  const w = parseFloat(root.attrs.width ?? "");
  const h = parseFloat(root.attrs.height ?? "");
  if (w > 0 && h > 0 && !/%/.test(root.attrs.width! + root.attrs.height!)) return [0, 0, w, h];
  return [0, 0, 800, 600];
}

export type SanitizeResult = { svg: string | null; warnings: string[]; error?: string; viewBox?: [number, number, number, number]; elements?: number };

const countEls = (e: SvgEl): number => 1 + e.children.reduce<number>((a, c) => a + (typeof c === "string" ? 0 : countEls(c)), 0);

/** Lọc SVG → chuỗi an toàn (null nếu bị từ chối). Mode illustration bỏ width/height gốc (template tự đặt cỡ). */
export function sanitizeSvg(src: string, mode: SvgMode = "illustration"): SanitizeResult {
  const r = parseSvg(src, mode);
  if (!r.root) return { svg: null, warnings: r.warnings, error: r.error };
  const viewBox = svgViewBox(r.root);
  if (mode === "illustration") {
    r.root.attrs = { viewBox: viewBox.join(" ") };
  } else if (!r.root.attrs.viewBox && !(r.root.attrs.width && r.root.attrs.height)) {
    r.root.attrs.viewBox = viewBox.join(" ");
  }
  return { svg: serializeSvg(r.root, { xmlns: true }), warnings: r.warnings, viewBox, elements: countEls(r.root) };
}
