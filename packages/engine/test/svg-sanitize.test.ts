import { describe, expect, it } from "vitest";
import { parseSvg, safeCss, sanitizeSvg, serializeSvg } from "../src/svg-sanitize";

const ok = (src: string, mode: "illustration" | "asset" = "illustration") => {
  const r = sanitizeSvg(src, mode);
  expect(r.error).toBeUndefined();
  return r.svg!;
};
/** Không còn dấu vết thực thi/tải ngoài. */
const clean = (s: string | null) => {
  if (s === null) return;
  expect(s.replace(' xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/<script|<foreignObject|<iframe|<image|<a[\s>]|\son\w+\s*=|javascript:|data:|https?:|@import|xlink:href|<!ENTITY|<!DOCTYPE/i);
};

const GOOD = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <!-- người công nhân -->
  <g id="part-1"><rect x="100" y="400" width="600" height="40" rx="8" fill="var(--bg2)"/></g>
  <g id="part-2" transform="translate(10 0)">
    <circle cx="400" cy="200" r="60" fill="var(--card)" stroke="var(--ink)" stroke-width="6"/>
    <path class="draw" pathLength="1" d="M340 190 Q400 120 460 190 Z" style="fill: var(--accent); stroke: var(--ink); stroke-width: 6; stroke-linecap: round"/>
  </g>
</svg>`;

describe("sanitizeSvg – illustration", () => {
  it("giữ hình hợp lệ: nhóm, id, hình, pathLength, lớp draw, màu biến theme; bỏ width/height gốc", () => {
    const s = ok(GOOD);
    expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">')).toBe(true);
    expect(s).toContain('<g id="part-1">');
    expect(s).toContain('<g id="part-2" transform="translate(10 0)">');
    expect(s).toContain('class="draw"');
    expect(s).toContain('pathLength="1"');
    expect(s).toMatch(/style="fill:var\(--accent\);stroke:var\(--ink\);stroke-width:6;stroke-linecap:round"/);
    expect(s).not.toContain("<!--");
    // ổn định khi lọc lại
    expect(ok(s)).toBe(s);
  });

  it("bỏ script (kể cả chứa '<' và viết hoa), foreignObject, image, a, use, text", () => {
    const s = ok(`<svg viewBox="0 0 10 10"><script>if (a<b) alert(1)</script><SCRIPT>x</SCRIPT><script/>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>
      <image href="https://evil/x.png"/><a href="javascript:alert(1)"><circle r="1"/></a><use href="#x"/><text>Xin chào</text>
      <circle cx="5" cy="5" r="2"/></svg>`);
    clean(s);
    expect(s).toContain('<circle cx="5" cy="5" r="2"/>');
    expect(s).not.toContain("Xin chào");
    expect(s).not.toContain("r=\"1\""); // con của <a> bị bỏ cùng thẻ cha
  });

  it("bỏ mọi on*, href/xlink:href, style url(), màu ngoài biến theme → đổi sang biến", () => {
    const r = sanitizeSvg(
      `<svg viewBox="0 0 10 10" onload="alert(1)"><rect x="1" y="1" width="2" height="2" onclick="x()" OnMouseOver="y()" fill="url(https://evil/a)" stroke="#f00" xlink:href="javascript:alert(1)" style="fill:url(javascript:alert(1));background:url(//evil)"/></svg>`,
    );
    clean(r.svg);
    expect(r.svg).not.toMatch(/url\(/);
    expect(r.svg).toContain("fill:var(--ink-soft)");
    expect(r.svg).toContain("stroke:var(--ink)");
    expect(r.warnings.join(" ")).toMatch(/biến theme/);
  });

  it("lớp chỉ giữ 'draw'; id lạ bị bỏ; giá trị số/đường dẫn/biến đổi kiểm chặt", () => {
    const s = ok(`<svg viewBox="0 0 10 10"><path id="a b" class="abs draw kicker" d="M0 0 L10 10 expression(alert(1))"/><circle id="ok-1" cx="1);background:red" cy="2" r="3" transform="translate(1,2) url(x)"/><rect x="1" y="1" width="calc(1px)" height="2"/></svg>`);
    expect(s).toContain('<path class="draw"/>');
    expect(s).toContain('<circle id="ok-1" cy="2" r="3"/>');
    expect(s).toContain('<rect x="1" y="1" height="2"/>');
  });

  it("thực thể được giải mã trước khi kiểm (không lách bằng &#…;); thực thể lạ → từ chối", () => {
    const r = sanitizeSvg(`<svg viewBox="0 0 10 10"><rect fill="&#118;ar(--accent)" stroke="javascript&#58;x" x="1"/></svg>`);
    expect(r.svg).toContain("fill:var(--accent)");
    expect(r.svg).not.toContain("javascript");
    expect(sanitizeSvg(`<svg viewBox="0 0 10 10"><rect fill="&xxe;"/></svg>`).svg).toBeNull();
  });

  it("từ chối DOCTYPE có ENTITY (XXE, billion laughs), cấu trúc hỏng, gốc không phải svg, quá lớn, quá nhiều phần tử", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg><text>&x;</text></svg>`;
    const lol = `<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><svg>&b;</svg>`;
    for (const bad of [
      xxe,
      lol,
      `<svg><g></svg>`,
      `<svg><g><rect/></g>`,
      `<svg><rect x="1></svg>`,
      `<svg/onload=alert(1)>`,
      `<html><svg/></html>`,
      `<div><svg viewBox="0 0 1 1"/></div>`,
      `hello <svg/>`,
      "",
      `<svg>${"<g>".repeat(40)}${"</g>".repeat(40)}</svg>`,
      `<svg>${"<circle r='1'/>".repeat(700)}</svg>`,
      `<svg><path d="${"M0 0 ".repeat(90_000)}"/></svg>`,
    ]) {
      const r = sanitizeSvg(bad);
      expect(r.svg, bad.slice(0, 60)).toBeNull();
      expect(r.error).toBeTruthy();
    }
  });

  it("bỏ phần thừa sau thẻ gốc và DOCTYPE đơn giản", () => {
    const s = ok(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg viewBox="0 0 4 3"><circle r="1"/></svg><script>alert(1)</script>`);
    expect(s).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><circle r="1"/></svg>');
  });

  it("escape giá trị khi in lại (không phá thuộc tính HTML)", () => {
    const r = parseSvg(`<svg viewBox="0 0 10 10"><g id="x"><circle r="1"/></g></svg>`);
    r.root!.attrs.id = `x" onload="alert(1)`;
    expect(serializeSvg(r.root!)).toContain('id="x&quot; onload=&quot;alert(1)"');
  });
});

describe("sanitizeSvg – asset (ảnh người dùng)", () => {
  it("giữ gradient, clipPath, use #id, chữ, màu tự do; bỏ use ngoài, image, script", () => {
    const s = ok(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" sodipodi:docname="x">
        <defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#ff0000"/><stop offset="1" style="stop-color:rgb(0,0,255)"/></linearGradient>
        <clipPath id="c"><rect width="10" height="10"/></clipPath></defs>
        <rect width="200" height="100" fill="url(#g1)" clip-path="url(#c)"/>
        <use xlink:href="#c"/><use href="https://evil/sprite.svg#a"/><use href="data:image/svg+xml,&lt;svg onload=alert(1)&gt;"/>
        <text x="10" y="50" font-family="Arial" font-size="20">A &amp; B &lt;3</text>
        <image href="data:image/png;base64,AAAA"/><script>alert(1)</script>
      </svg>`,
      "asset",
    );
    clean(s);
    expect(s).toContain('width="200" height="100"');
    expect(s).toContain("fill:url(#g1)");
    expect(s).toContain("clip-path:url(#c)");
    expect(s).toContain('<use href="#c"/>');
    expect(s.match(/<use/g)!.length).toBe(3);
    expect(s).toContain("<use/>");
    expect(s).toContain("A &amp; B &lt;3");
    expect(s).toContain("stop-color:rgb(0,0,255)");
  });

  it("CSS trong <style>: giữ khi an toàn, bỏ khi có url()/@import/escape", () => {
    expect(ok(`<svg><style>.a{fill:#123456}</style><rect class="a"/></svg>`, "asset")).toContain("<style>.a{fill:#123456}</style>");
    for (const css of [".a{background:url(https://evil/x)}", "@import 'x.css';", ".a{fill:u\\72l(x)}", ".a{fill:url( 'javascript:x' )}", "</style><script>alert(1)</script>"]) {
      expect(safeCss(css), css).toBe(false);
      const s = sanitizeSvg(`<svg><style>${css}</style><rect/></svg>`, "asset").svg;
      if (s) expect(s).not.toContain("<style");
    }
    expect(safeCss(".a{clip-path:url(#c)}")).toBe(true);
  });

  it("thêm viewBox khi thiếu cả viewBox lẫn width/height", () => {
    expect(ok(`<svg><rect width="1" height="1"/></svg>`, "asset")).toContain('viewBox="0 0 800 600"');
  });
});
