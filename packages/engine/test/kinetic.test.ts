import { describe, expect, it } from "vitest";
import { buildVideo } from "@cvs/core";
import { THEMES } from "@cvs/themes";
import { getTheme } from "@cvs/themes";
import { buildSceneSpec, esc, graphemes, KINETIC_PRESETS, kineticPad, kineticText, kineticWords, resolveTime, SpecBuilder, TEMPLATES, themeMark, wipeIn } from "../src";

const ctx = (theme = THEMES["giay-ky-thuat"]) => ({ p: "s2", theme, slow: false, sentences: ["Một.", "Hai."], sceneTitle: "x" });

describe("kinetic typography", () => {
  it("tách theo từ, NFC, nhấn và chỉ số dưới", () => {
    const nfd = "Tín chỉ **một tấn** CO₂e thực sự.".normalize("NFD");
    const w = kineticWords(nfd);
    expect(w.map((x) => x.text)).toEqual(["Tín", "chỉ", "một", "tấn", "CO₂e", "thực", "sự."]);
    expect(w.every((x) => x.text === x.text.normalize("NFC"))).toBe(true);
    expect(w[2].group).toBe(0);
    expect(w[3].group).toBe(0);
    expect(w[0].group).toBe(-1);
    expect(w[2].html).toBe("<mark>một</mark>");
    expect(w[4].html).toBe("CO<sub>2</sub>e");
    expect(kineticWords('a <b> & "c"').map((x) => x.html)).toEqual(["a", "&lt;b&gt;", "&amp;", "&quot;c&quot;"]);
  });

  for (const preset of ["word-rise", "word-fade", "mask-rise", "highlight-sweep", "underline-draw", "scale-pop"] as const) {
    it(`${preset}: id duy nhất có tiền tố, chữ đầy đủ trong texts, lộ chữ ≤ ~1,5 s`, () => {
      const b = new SpecBuilder(ctx());
      const text = "Mỗi tín chỉ phải đại diện cho **một tấn** giảm phát thải thực sự.";
      const r = kineticText(b, { name: "q", text, cls: "abs d t", style: "left:0;", size: 80, preset, at: { cue: 0, f: 0.1 } });
      const spec = b.done();
      expect(spec.texts).toEqual([text]);
      expect(r.wordIds).toHaveLength(14);
      const ids = [...spec.html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => id.startsWith("s2-"))).toBe(true);
      for (const a of spec.anims) expect(ids).toContain(a.id);
      expect(spec.anims).toHaveLength(14 + (preset === "highlight-sweep" || preset === "underline-draw" ? 1 : 0));
      expect(r.reveal).toBeLessThanOrEqual(1.6);
      // chữ ghép lại từ các từ (bỏ thẻ) = chữ gốc bỏ **
      const plainHtml = spec.html.replace(/<sub>(\d)<\/sub>/g, (_, d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      expect(plainHtml).toBe(text.replace(/\*\*/g, ""));
    });
  }

  it("mốc giây cứng của tiêu đề giữ < 1 s", () => {
    const b = new SpecBuilder(ctx());
    kineticText(b, { name: "t", text: "Một hai ba bốn năm sáu bảy tám chín mười mười một **mười hai**", cls: "abs d t", style: "", size: 90, preset: "word-rise", at: { t: 0.3 } });
    for (const a of b.anims) expect("t" in a.at && a.at.t < 1, JSON.stringify(a.at)).toBe(true);
  });

  it("until cùng câu: rải từ theo f", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "a b c", cls: "t", style: "", size: 40, preset: "word-fade", at: { cue: 1, f: 0.1 }, until: { cue: 1, f: 0.52 } });
    const T = { dur: 10, cues: [0, 2], ends: [2, 7] };
    expect(r.anims.map((a) => resolveTime(a.at, T))).toEqual([2.5, 3.5, 4.5]);
  });

  it("từ nhấn: vạch quét là <mark> nằm gọn trong cụm (không tràn ngang); nhấn kéo dài khi mốc bị chặn < 1 s", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "Một hai ba **bốn năm**", cls: "abs d t", style: "", size: 90, preset: "mask-rise", mark: "highlight-sweep", at: { t: 0.3 } });
    const spec = b.done();
    expect(spec.html).toContain(`<mark id="s2-t-m0" class="kt-hl"></mark>`);
    expect(spec.css).toContain("mark.kt-hl{position:absolute;inset:0;");
    expect(spec.css).not.toMatch(/left:-|right:-/);
    const hl = r.anims.find((a) => a.id === "s2-t-m0")!;
    const last = r.anims.find((a) => a.id === "s2-t-w4")!;
    const tt = (x: { at: unknown }) => (x.at as { t: number }).t;
    expect(tt(hl)).toBeLessThan(1);
    // kết thúc sau khi từ nhấn cuối đã lộ gần hết (≥ mốc từ + 0,45·dur + 0,55)
    expect(tt(hl) + hl.dur).toBeGreaterThanOrEqual(tt(last) + last.dur * 0.45 + 0.55 - 1e-6);
  });

  it("hiệu ứng nhấn theo theme: nền mark → quét, chỉ màu → gạch chân", () => {
    expect(themeMark("bang-trang")).toBe("highlight-sweep");
    expect(themeMark("phang-tuoi-sang")).toBe("highlight-sweep");
    expect(themeMark("giay-ky-thuat")).toBe("underline-draw");
    expect(themeMark("toi-dien-anh")).toBe("underline-draw");
  });

  it("title-card và quote-banner dùng chữ chuyển động theo từ", () => {
    for (const id of ["title-card", "quote-banner"]) {
      const t = TEMPLATES[id];
      const spec = t.build(t.example, ctx(THEMES["toi-dien-anh"]));
      expect(spec.anims.filter((a) => /-w\d+$/.test(a.id)).length).toBeGreaterThan(3);
      expect(spec.texts).toContain((t.example as { title?: string; quote?: string }).title ?? (t.example as { quote: string }).quote);
    }
  });
});

describe("máy quay + wipe", () => {
  const v = buildVideo({ title: "B", fileName: "MO1_U1_1", scenes: [{ scriptStart: 0, scriptEnd: 10, title: "Mở đầu", visual: "Chuỗi bước", onscreen: ["A → B → C"], vo: "Câu một. Câu hai." }] }, { course: "C", level: "L1" }, 0);
  it("bọc cảnh trong sN-cam, đẩy chậm từ 1/(1+k) lên 1 (không vượt bố cục gốc) đến hết cảnh", () => {
    const sc = { ...v.scenes[0], design: { template: "title-card", params: { title: "Xin chào" }, by: "user" as const } };
    const spec = buildSceneSpec({ ...v, scenes: [sc] }, sc);
    expect(spec.html.startsWith(`<div id="s1-cam" class="cvs-cam" data-cam-from="0.9852"`)).toBe(true);
    const cam = spec.anims.find((a) => a.id === "s1-cam")!;
    expect(cam).toMatchObject({ from: { scale: 0.9852 }, to: { scale: 1 }, at: { t: 0 }, until: { end: 0 }, ease: "sine.inOut" });
    // chữ 28 px lúc nhỏ nhất vẫn ≥ ngưỡng 27,5 px của probe
    expect(28 * 0.9852).toBeGreaterThanOrEqual(27.5);
  });
  it("theme tối giản Thụy Sĩ và cảnh nháp không có máy quay", () => {
    const sc = { ...v.scenes[0], design: { template: "title-card", params: { title: "Xin chào" }, by: "user" as const } };
    expect(buildSceneSpec({ ...v, style: "toi-gian-thuy-si", scenes: [sc] }, sc).html).not.toContain("-cam");
    const dr = { ...v.scenes[0], design: { template: "draft", params: {}, by: "user" as const } };
    expect(buildSceneSpec({ ...v, scenes: [dr] }, dr).html).not.toContain("-cam");
  });
  it("wipeIn", () => {
    expect(wipeIn(ctx(), "s1-x", { cue: 0 }).from).toEqual({ wipe: 0 });
    expect(wipeIn(ctx(), "s1-x", { cue: 0 }, "up").to).toEqual({ wipeUp: 1 });
  });
});

describe("preset chữ chuyển động mở rộng", () => {
  const ids = (html: string) => [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
  const plainOf = (html: string) =>
    html
      .replace(/<sub>(\d)<\/sub>/g, (_, d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const T = { dur: 12, cues: [0.5, 4, 8], ends: [3.8, 7.8, 11.5] };

  it("KINETIC_PRESETS: id duy nhất, nhãn tiếng Việt, đủ mọi preset", () => {
    const list = KINETIC_PRESETS.map((p) => p.id);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toHaveLength(16);
    for (const p of KINETIC_PRESETS) expect(p.label.length).toBeGreaterThan(3);
  });

  it("grapheme: NFD vẫn giữ nguyên 'ệ', 'ữ'", () => {
    const g = graphemes("Hệ thống dữ liệu".normalize("NFD"));
    expect(g).toContain("ệ");
    expect(g).toContain("ữ");
    expect(g.every((c) => c === c.normalize("NFC"))).toBe(true);
    expect(esc("ệ".normalize("NFD"))).toBe("ệ");
  });

  for (const preset of KINETIC_PRESETS.map((p) => p.id)) {
    it(`${preset}: id duy nhất có tiền tố, chữ giữ nguyên, không lặp vô hạn`, () => {
      const b = new SpecBuilder({ ...ctx(), sentences: ["Một.", "Hai.", "Ba."] });
      const text = preset === "odometer" ? "Giảm **2.450** tấn năm 2024." : "Hệ thống **dữ liệu** an toàn. Kiểm tra mỗi ngày.";
      const r = kineticText(b, { name: "q", text: text.normalize("NFD"), cls: "abs d t", style: "left:0;", size: 80, preset, at: { cue: 0, f: 0.1 }, alternates: preset === "word-swap" ? ["giấy tờ"] : undefined });
      const spec = b.done();
      const all = ids(spec.html);
      expect(new Set(all).size).toBe(all.length);
      expect(all.every((id) => id.startsWith("s2-q"))).toBe(true);
      for (const a of spec.anims) expect(all, a.id).toContain(a.id);
      expect(r.wordIds.length).toBeGreaterThan(0);
      expect(spec.css).not.toMatch(/repeat|infinite/);
      expect(JSON.stringify(spec.anims)).not.toMatch(/repeat/);
      const want = text.replace(/\*\*/g, "");
      const got = plainOf(spec.html);
      if (preset === "word-swap") expect(got).toBe(want.replace("dữ liệu", "giấy tờdữ liệu"));
      else expect(got).toBe(want);
      expect(got).toBe(got.normalize("NFC"));
      // GSAP và Remotion: mọi mốc giải được, dur dương
      for (const a of spec.anims) {
        expect(Number.isFinite(resolveTime(a.at, T))).toBe(true);
        expect(a.dur).toBeGreaterThan(0);
      }
    });
  }

  it("char-soft-rise/tracking-in: tách grapheme, từ bọc nowrap; dài > 30 ký tự → về theo từ / cả khối", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "Hệ thống dữ liệu", cls: "d t", style: "", size: 90, preset: "char-soft-rise", at: { t: 0.3 } });
    expect(r.wordIds).toHaveLength(13);
    expect(b.done().html).toContain(`<span class="kt-wn"><span id="s2-t-c0" class="kt-c">H</span><span id="s2-t-c1" class="kt-c">ệ</span></span>`);
    for (const a of r.anims) expect("t" in a.at && a.at.t < 1).toBe(true);
    const tr = kineticText(b, { name: "u", text: "An toàn", cls: "d t", style: "", size: 90, preset: "tracking-in", at: { t: 0.3 } });
    const xs = tr.anims.map((a) => a.from.x!);
    expect(xs[0]).toBeLessThan(0);
    expect(xs[xs.length - 1]).toBe(-xs[0]);
    const long = "Mỗi tín chỉ phải đại diện cho một tấn giảm phát thải";
    expect(kineticText(b, { name: "v", text: long, cls: "d t", style: "", size: 90, preset: "char-soft-rise", at: { t: 0.3 } }).wordIds[0]).toBe("s2-v-w0");
    expect(kineticText(b, { name: "w", text: long, cls: "d t", style: "", size: 90, preset: "tracking-in", at: { t: 0.3 } }).wordIds).toEqual(["s2-w-in"]);
  });

  it("typewriter: ~20 ký tự/s, mỗi ký tự 0,03 s ease none; con trỏ nháy hữu hạn rồi tắt", () => {
    const b = new SpecBuilder(ctx());
    const text = "Thẩm tra là xác nhận độc lập";
    const r = kineticText(b, { name: "t", text, cls: "d t", style: "", size: 60, preset: "typewriter", at: { cue: 0, f: 0.1 } });
    const chars = r.anims.filter((a) => /-c\d+$/.test(a.id));
    expect(chars).toHaveLength(graphemes(text.replace(/ /g, "")).length);
    for (const a of chars) expect(a).toMatchObject({ dur: 0.03, ease: "none", from: { opacity: 0 }, to: { opacity: 1 } });
    const t0 = resolveTime(chars[0].at, T);
    const t1 = resolveTime(chars[chars.length - 1].at, T);
    const steps = graphemes(text).length - 1;
    expect((t1 - t0) / steps).toBeCloseTo(0.05, 3);
    const caret = r.anims.filter((a) => a.id === "s2-t-caret");
    expect(caret.length).toBeGreaterThanOrEqual(3);
    expect(caret.length).toBeLessThanOrEqual(4);
    expect(resolveTime(caret[0].at, T)).toBeGreaterThanOrEqual(t1);
    expect(caret[caret.length - 1].to.opacity).toBe(0);
    // vừa thời gian câu khi có total: nhanh hơn nhưng không quá 33 ký tự/s
    const b2 = new SpecBuilder(ctx());
    const r2 = kineticText(b2, { name: "t", text, cls: "d t", style: "", size: 60, preset: "typewriter", at: { cue: 0 }, total: 1 });
    const c2 = r2.anims.filter((a) => /-c\d+$/.test(a.id));
    const step2 = (resolveTime(c2[c2.length - 1].at, T) - resolveTime(c2[0].at, T)) / steps;
    expect(step2).toBeGreaterThanOrEqual(0.03 - 1e-9);
    expect(step2).toBeLessThan(0.05);
  });

  it("word-swap: ô inline-grid; từ cũ lên + mờ 0,35 s power2.in, từ mới vào sau 0,1 s 0,45 s power3.out", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "An toàn là **thói quen**", cls: "d t", style: "", size: 100, preset: "word-swap", at: { cue: 0 }, alternates: ["thủ tục"] });
    const spec = b.done();
    expect(spec.texts).toEqual(["An toàn là **thói quen**", "thủ tục"]);
    expect(spec.html).toContain(`<span class="kt-sw"><span id="s2-t-x0" class="kt-sx"><mark>thủ tục</mark></span><span id="s2-t-x1" class="kt-sx"><mark>thói</mark> <mark>quen</mark></span></span>`);
    const out = r.anims.find((a) => a.id === "s2-t-x0" && a.ease === "power2.in")!;
    const inn = r.anims.find((a) => a.id === "s2-t-x1")!;
    expect(out).toMatchObject({ to: { opacity: 0, y: -40 }, dur: 0.35 });
    expect(inn).toMatchObject({ from: { opacity: 0, y: 40 }, dur: 0.45, ease: "power3.out" });
    expect(resolveTime(inn.at, T) - resolveTime(out.at, T)).toBeCloseTo(0.1, 6);
  });

  it("block-reveal: thanh A nở trái → chữ hiện giữa chừng → thanh B co về phải", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "Chương hai", cls: "d t", style: "", size: 100, preset: "block-reveal", at: { t: 0.3 } });
    const a = r.anims.filter((x) => x.id === "s2-t-ba");
    expect(a[0]).toMatchObject({ from: { scaleX: 0 }, to: { scaleX: 1 }, dur: 0.4, ease: "power3.in" });
    const txt = r.anims.find((x) => x.id === "s2-t-in")!;
    expect(txt.at).toEqual({ t: 0.7 });
    expect(r.anims.find((x) => x.id === "s2-t-bb" && x.from.scaleX === 1)).toMatchObject({ to: { scaleX: 0 }, dur: 0.45, ease: "power3.out", at: { t: 0.7 } });
    expect(b.done().css).toContain("#s2-t-bb{transform-origin:100% 50%;}");
  });

  it("wipe-reveal / mask-rise: đệm theo phông (League Spartan 0,3 → 0,45em; mặc định 0,35em)", () => {
    const b = new SpecBuilder(ctx());
    kineticText(b, { name: "t", text: "Ấn tượng", cls: "d t", style: "", size: 100, preset: "wipe-reveal", at: { cue: 0 } });
    expect(b.done().css).toContain("#s2-t-in{display:inline-block;clip-path:inset(-0.35em calc((1 - var(--cvs-wx, 1)) * 100%) -0.35em -0.12em) !important;}");
    expect(b.anims[0]).toMatchObject({ from: { wipe: 0 }, to: { wipe: 1 }, dur: 0.8, ease: "power3.inOut" });
    const ls = getTheme("giay-ky-thuat", "league-spartan");
    expect(kineticPad(ls)).toBe(0.45);
    const b2 = new SpecBuilder({ ...ctx(), theme: ls });
    kineticText(b2, { name: "t", text: "Ấn tượng", cls: "d t", style: "", size: 100, preset: "mask-rise", at: { cue: 0 } });
    expect(b2.done().css).toContain("clip-path:inset(-0.45em -0.3em -0.45em -0.3em)");
    expect(kineticPad(getTheme("giay-ky-thuat", "mali"))).toBe(0.35);
  });

  it("circle-annotate: <ellipse> theo %, không viewBox/non-scaling-stroke; vòng vượt điểm đầu", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "Phải có **bằng chứng**", cls: "d t", style: "", size: 100, preset: "circle-annotate", at: { cue: 0 } });
    const spec = b.done();
    expect(spec.html).toMatch(/<svg class="kt-cs"[^>]*><ellipse id="s2-t-m0" class="draw" pathLength="1" cx="50%"/);
    expect(spec.html).not.toMatch(/viewBox|preserveAspectRatio|vector-effect/);
    expect(spec.css).not.toContain("non-scaling-stroke");
    const main = r.anims.find((a) => a.id === "s2-t-m0")!;
    const tail = r.anims.find((a) => a.id === "s2-t-m0t")!;
    expect(main).toMatchObject({ from: { dash: 1 }, to: { dash: 0 } });
    expect(resolveTime(tail.at, T)).toBeCloseTo(resolveTime(main.at, T) + main.dur, 6);
  });

  it("odometer: mỗi chữ số một ô, cuộn tới -d·H, phải → trái 0,06 s; dấu chấm/chữ ngoài ô", () => {
    const b = new SpecBuilder(ctx());
    const r = kineticText(b, { name: "t", text: "Đạt 45,7%", cls: "d t", style: "", size: 100, preset: "odometer", at: { cue: 0 } });
    const spec = b.done();
    expect(spec.html).toContain(`<span class="kt-dg"><span class="kt-dp">4</span><span id="s2-t-d0" class="kt-ds"></span></span>`);
    expect(spec.html).toContain(`</span>,<span class="kt-dg">`);
    const rolls = r.anims.filter((a) => /-d\d$/.test(a.id));
    expect(rolls.map((a) => a.to.y)).toEqual([-448, -560, -784]);
    const ts = rolls.map((a) => resolveTime(a.at, T));
    expect(ts[0] - ts[1]).toBeCloseTo(0.06, 6);
    expect(ts[1] - ts[2]).toBeCloseTo(0.06, 6);
    for (const a of rolls) expect(a.dur).toBeGreaterThanOrEqual(1);
  });

  it("reading-focus: câu chưa đọc 0,35, câu đang đọc 1, câu đã đọc 0,55 – mỗi câu một cue", () => {
    const b = new SpecBuilder({ ...ctx(), sentences: ["a", "b", "c"] });
    const r = kineticText(b, { name: "t", text: "Câu một. Câu hai. Câu ba.", cls: "d t", style: "", size: 60, preset: "reading-focus", at: { cue: 0, f: 0.1 } });
    expect(r.wordIds).toEqual(["s2-t-r0", "s2-t-r1", "s2-t-r2"]);
    const of = (id: string) => r.anims.filter((a) => a.id === id).map((a) => [a.to.opacity, (a.at as { cue: number }).cue]);
    expect(of("s2-t-r0")).toEqual([[1, 0], [0.55, 1]]);
    expect(of("s2-t-r1")).toEqual([[0.35, 0], [1, 1], [0.55, 2]]);
    expect(of("s2-t-r2")).toEqual([[0.35, 0], [1, 2]]);
  });
});
