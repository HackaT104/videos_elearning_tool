import { describe, expect, it } from "vitest";
import { buildVideo } from "@cvs/core";
import { THEMES } from "@cvs/themes";
import { buildSceneSpec, kineticText, kineticWords, resolveTime, SpecBuilder, TEMPLATES, themeMark, wipeIn } from "../src";

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
