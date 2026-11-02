// Phụ đề và logo: kiểm/kẹp cài đặt, chia khối phụ đề theo số dòng, vị trí logo + phụ đề (xếp tầng cùng mép), cue WebVTT, khoá render.
import { describe, expect, it } from "vitest";
import {
  buildVideo, buildVtt, captionBlocks, chunkCaption, computeTiming, DEFAULT_SUBTITLE, normalizeLogo, normalizeSubtitle, numbersMatch, overlayKey, overlayLayout,
  resolveOverlay, vttCueSettings, wrapLines, textEm,
} from "../src";

const LOGO = "0123456789abcdef-600x200.png";

describe("cài đặt phụ đề / logo", () => {
  it("thiếu → mặc định; ngoài khoảng → kẹp; giá trị lạ → giữ cũ", () => {
    expect(normalizeSubtitle(undefined)).toEqual(DEFAULT_SUBTITLE);
    const s = normalizeSubtitle({ mode: "burn", size: 200, offset: -5, background: 3, maxWidth: 10, maxLines: 5, position: "giữa", languages: ["en", "xx", "vi", "ja"], burnLanguage: "ja" });
    expect(s).toMatchObject({ mode: "burn", size: 72, offset: 0, background: 1, maxWidth: 40, maxLines: 2, position: "bottom", languages: ["vi", "en", "ja"], burnLanguage: "ja" });
    expect(normalizeSubtitle({ size: "12" }).size).toBe(24);
    // ngôn ngữ gắn cứng không nằm trong danh sách → vi
    expect(normalizeSubtitle({ languages: ["vi"], burnLanguage: "en" }).burnLanguage).toBe("vi");
    expect(normalizeLogo({ assetId: "../../etc/passwd", size: 99, opacity: 0, margin: 1e6, position: "center" })).toEqual({ position: "top-right", size: 30, margin: 200, opacity: 0.2, scenes: "all" });
    expect(normalizeLogo({ assetId: LOGO, scenes: "skip-first" })).toMatchObject({ assetId: LOGO, scenes: "skip-first" });
  });
  it("video ghi đè cài đặt dự án", () => {
    const o = resolveOverlay({ subtitle: { mode: "burn", size: 50 }, logo: { assetId: LOGO } }, { overlay: { subtitle: { size: 30 }, logo: { position: "bottom-left" } } });
    expect(o.subtitle).toMatchObject({ mode: "burn", size: 30 });
    expect(o.logo).toMatchObject({ assetId: LOGO, position: "bottom-left" });
  });
  it("khoá render chỉ đổi khi phụ đề gắn cứng / logo đổi", () => {
    const base = resolveOverlay({});
    expect(overlayKey(resolveOverlay({ subtitle: { size: 60 } }))).toBe(overlayKey(base)); // phụ đề trong trình phát: không đổi hình
    expect(overlayKey(resolveOverlay({ subtitle: { mode: "burn" } }))).not.toBe(overlayKey(base));
    expect(overlayKey(resolveOverlay({ logo: { assetId: LOGO } }))).not.toBe(overlayKey(resolveOverlay({ logo: { assetId: LOGO, size: 12 } })));
  });
});

describe("chia dòng phụ đề", () => {
  it("ngắt ở dấu cách, giữ dấu tiếng Việt; CJK ngắt từng ký tự", () => {
    const lines = wrapLines("Mỗi tấn CO₂ giảm được ghi nhận sau kỳ giám sát và thẩm tra độc lập của TUV NORD", 20);
    expect(lines.join(" ")).toBe("Mỗi tấn CO₂ giảm được ghi nhận sau kỳ giám sát và thẩm tra độc lập của TUV NORD");
    for (const l of lines) expect(textEm(l)).toBeLessThanOrEqual(20);
    const ja = wrapLines("炭素クレジットは独立した第三者による検証を経て発行されます", 10);
    expect(ja.length).toBeGreaterThan(1);
    expect(ja.join("")).toBe("炭素クレジットは独立した第三者による検証を経て発行されます");
  });
  it("vừa maxLines → một khối; dài hơn → thu nhỏ chữ (≥ 28 px) rồi tách nhiều khối nối tiếp", () => {
    expect(chunkCaption("Câu ngắn.", 40, 1400, 2)).toEqual([{ lines: ["Câu ngắn."], size: 40, share: 1 }]);
    const long = "Thẩm định diễn ra trước khi dự án đăng ký, còn thẩm tra diễn ra định kỳ sau mỗi kỳ giám sát để xác nhận lượng giảm phát thải thực tế.";
    const shrunk = chunkCaption(long, 40, 1150, 2);
    expect(shrunk.length).toBe(1);
    expect(shrunk[0].size).toBeLessThan(40);
    expect(shrunk[0].size).toBeGreaterThanOrEqual(32);
    const split = chunkCaption(long, 40, 800, 1);
    expect(split.length).toBeGreaterThan(1);
    for (const c of split) expect(c.lines.length).toBe(1);
    expect(split.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 5);
    expect(split[0].size).toBeGreaterThanOrEqual(32);
  });
  it("khối phụ đề theo mốc câu; thiếu bản dịch → dùng tiếng Việt và đếm", () => {
    const v = buildVideo({ title: "B", fileName: "MO1_U1_1", scenes: [{ scriptStart: 0, scriptEnd: 10, title: "A", visual: "", onscreen: [], vo: "Câu một có 3 ý. Câu hai." }] }, { course: "C", level: "L1" }, 0);
    v.scenes[0].sentences[0].subs = { en: "Sentence one has 3 points." };
    const t = computeTiming(v);
    const { captions, missing } = captionBlocks(v, t, normalizeSubtitle({ mode: "burn", languages: ["vi", "en"], burnLanguage: "en" }));
    expect(captions.map((c) => c.lines.join(" "))).toEqual(["Sentence one has 3 points.", "Câu hai."]);
    expect(missing).toBe(1);
    expect(captions[0].start).toBeCloseTo(t.scenes[0].start + t.scenes[0].cues[0], 3);
    expect(captions[1].end).toBeCloseTo(t.scenes[0].start + t.scenes[0].ends[1], 3);
  });
});

describe("vị trí logo và phụ đề", () => {
  it("logo giữ tỉ lệ từ mã ảnh, đặt theo góc + lề", () => {
    const L = overlayLayout(resolveOverlay({ logo: { assetId: LOGO, size: 10, margin: 40, position: "top-right" } }));
    expect(L.logo).toEqual({ x: 1920 - 40 - 192, y: 40, w: 192, h: 64 });
    const c = overlayLayout(resolveOverlay({ logo: { assetId: LOGO, position: "bottom-center" } })).logo!;
    expect(c.x).toBe(Math.round((1920 - 192) / 2));
    expect(c.y).toBe(1080 - 40 - 64);
    // ảnh cao: tối đa 25 % chiều cao
    expect(overlayLayout(resolveOverlay({ logo: { assetId: "0123456789abcdef-100x400.png", size: 30 } })).logo!.h).toBe(270);
  });
  it("logo cùng mép và chồng ngang vùng phụ đề → phụ đề xếp tầng ra xa mép hơn logo", () => {
    const off = overlayLayout(resolveOverlay({ subtitle: { mode: "burn", offset: 6 } })).caption.offset;
    expect(off).toBe(65);
    const st = overlayLayout(resolveOverlay({ subtitle: { mode: "burn", offset: 6 }, logo: { assetId: LOGO, position: "bottom-left", margin: 40 } }));
    expect(st.caption.offset).toBe(40 + 64 + 16);
    // khác mép → không đẩy
    expect(overlayLayout(resolveOverlay({ subtitle: { mode: "burn" }, logo: { assetId: LOGO, position: "top-left" } })).caption.offset).toBe(65);
    // phụ đề trên + logo trên giữa
    expect(overlayLayout(resolveOverlay({ subtitle: { mode: "burn", position: "top" }, logo: { assetId: LOGO, position: "top-center" } })).caption.offset).toBe(120);
    // phụ đề hẹp không chồng logo ở góc → giữ nguyên
    expect(overlayLayout(resolveOverlay({ subtitle: { mode: "burn", maxWidth: 50 }, logo: { assetId: LOGO, position: "bottom-right" } })).caption.offset).toBe(65);
  });
  it("dòng Nguồn được nâng lên trên phụ đề gắn cứng ở đáy (và logo góc trái dưới)", () => {
    expect(overlayLayout(resolveOverlay({})).srcBottom).toBeNull();
    const L = overlayLayout(resolveOverlay({ subtitle: { mode: "burn", size: 40, maxLines: 2 } }));
    expect(L.srcBottom).toBe(65 + L.caption.boxHeight + 12);
    expect(overlayLayout(resolveOverlay({ subtitle: { mode: "burn", position: "top" } })).srcBottom).toBeNull();
    expect(overlayLayout(resolveOverlay({ logo: { assetId: LOGO, position: "bottom-left" } })).srcBottom).toBe(40 + 64 + 12);
  });
});

describe("WebVTT", () => {
  it("cue có line/position/size theo cài đặt; câu chưa dịch bị bỏ; bản dịch theo ngôn ngữ", () => {
    expect(vttCueSettings(normalizeSubtitle({ position: "bottom", offset: 6, maxWidth: 80 }))).toBe("line:94%,end position:50%,center size:80% align:center");
    expect(vttCueSettings(normalizeSubtitle({ position: "top", offset: 10 }))).toMatch(/^line:10%,start /);
    const v = buildVideo({ title: "B", fileName: "MO1_U1_1", scenes: [{ scriptStart: 0, scriptEnd: 10, title: "A", visual: "", onscreen: [], vo: "Xin chào. Tạm biệt." }] }, { course: "C", level: "L1" }, 0);
    v.scenes[0].sentences[1].subs = { en: "Goodbye." };
    const t = computeTiming(v);
    const vi = buildVtt(v, t, "vi", DEFAULT_SUBTITLE);
    expect(vi.split("\n")[0]).toBe("WEBVTT");
    expect(vi).toContain("Xin chào.");
    expect(vi).toMatch(/^\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3} line:94%,end/m);
    const en = buildVtt(v, t, "en", DEFAULT_SUBTITLE);
    expect(en).toContain("Goodbye.");
    expect(en).not.toContain("Xin chào");
  });
  it("kiểm số trong bản dịch (bỏ qua dấu phân cách)", () => {
    expect(numbersMatch("Tăng 1,5 °C so với năm 2015", "A rise of 1.5 °C compared with 2015")).toBe(true);
    expect(numbersMatch("10.000 tấn", "10,000 tonnes")).toBe(true);
    expect(numbersMatch("ISO 45001", "ISO 45000")).toBe(false);
  });
});
