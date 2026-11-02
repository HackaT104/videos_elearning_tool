// LLM cho Course Video Studio: viết outline/kịch bản, chọn template + điền tham số, viết cảnh tùy biến, soát hình.
// Nguyên tắc: không bịa số liệu; mọi chữ AI tự thêm phải nằm trong assumptions để người duyệt thấy (màu vàng).

import { readFileSync } from "node:fs";
import { buildVideo, formatClock, type OutlineDoc, type ProjectDefaults, type Scene, type SceneDesign, type SceneTiming, type Video } from "@cvs/core";
import { DESIGN_TEMPLATE_IDS, ICON_NAMES, sanitizeSvg, TEMPLATES, THEME_COLOR_VARS, validateParams } from "@cvs/engine";
import { getTheme } from "@cvs/themes";
import { AiError, ask, askJson } from "./client";

export * from "./client";

export const RULES = `QUY TẮC BẮT BUỘC (khóa học e-learning TUV NORD, tiếng Việt):
- KHÔNG BỊA SỐ LIỆU. Mọi con số, ngày, mã phiên bản, tên tổ chức trên màn hình phải lấy đúng từ tài liệu nguồn được cung cấp.
- Mọi chữ/nhãn/danh sách bạn tự thêm (không có nguyên văn trong kịch bản) phải được liệt kê trong "assumptions".
- Thuật ngữ: verification = thẩm tra, validation = thẩm định; viết "TUV NORD".
- Mỗi lần chỉ hiện một ý mới; không slide gạch đầu dòng; không mọi thứ cùng hiện một lúc.
- Không vẽ/mô phỏng logo hay giao diện của tổ chức thật – chỉ ghi tên bằng chữ.
- Chữ ngắn gọn: nhãn ≤ 6 từ, câu trên màn hình ≤ 14 từ.`;

// Checklist chuyển động (rút gọn từ .claude/skills/cvs-scene-design – sửa nguyên tắc thì cập nhật cả hai nơi).
export const MOTION_CHECKLIST = `CHECKLIST THIẾT KẾ CHUYỂN ĐỘNG:
- Một ý mỗi cảnh; mỗi câu thoại là một nhịp với MỘT tiêu điểm mới (hiện ra hoặc được nhấn), phần cũ lùi lại.
- Mạch bài giảng: hook (câu hỏi/hiểu lầm/con số) → gọi tên khái niệm → cách vận hành (bước, nhân quả, luồng) → bằng chứng (số liệu có nguồn) → tóm lại một dòng.
- Chọn template trong THƯ VIỆN theo HÌNH DẠNG thông tin (so sánh, quy trình, nhân quả, một con số, tỷ trọng, mốc thời gian, danh sách, kết luận…), không mặc định thẻ tiêu đề.
- Ưu tiên template có nhiều lớp chuyển động (sơ đồ lớn dần, nét nối vẽ ra, cột mọc, bộ đếm số, đánh dấu lần lượt) hơn là một khối chữ.
- Tiết lộ dần (progressive disclosure): rải "at" theo câu nói tới ý đó, phần tử chính ở f 0.05–0.2, phần phụ f 0.3–0.7; không dồn mọi thứ vào câu 0; nửa sau cảnh vẫn có thứ mới.
- Nhấn từ khóa bằng **…** (1–2 cụm mỗi cảnh); chữ đọc được giữ ≥ 0,5 s + 0,3 s/từ.
- Số liệu: một thông điệp mỗi biểu đồ, tiêu đề nói thông điệp, tô một cột/chuỗi chính, số lớn nhất khung; chỉ số có trong nguồn.
- Màu theo vai trò: accent = tiêu điểm, alt = đối trọng, money = tiền, warn = CHỈ rủi ro/chi phí/sai.
- Cảnh TEMPLATE: engine tự thêm máy quay đẩy nhẹ (tùy theme) và hiệu ứng ra cảnh – đừng tự tạo zoom/exit.`;

export const CUSTOM_SCENE_CHECKLIST = `CHECKLIST CHUYỂN ĐỘNG CHO CẢNH TÙY BIẾN:
- Lớp vào: nền/khung (mờ dần) → tiêu đề (expo.out/power4.out 0,6–0,8 s, trượt 16–40 px + blur 6 px → 0) → nội dung chính → nhãn phụ → điểm nhấn.
- Cảnh tùy biến KHÔNG có máy quay/ra cảnh của engine: tự viết exit đúng như hợp đồng (bắt buộc, kẻo cắt cứng).
- Kỹ thuật dưới đây dùng cho cả hai engine: HyperFrames viết bằng tl.fromTo, Remotion bằng interpolate theo t (cùng mốc, cùng ease).
- Stagger nhóm 0,06–0,12 s (mục danh sách 0,04–0,08 s) bằng vòng lặp: mốc at(…) của hợp đồng + k * 0.08; phần sau bắt đầu khi phần trước xong 30–50 %.
- Đổi kiểu vào giữa các lớp, đừng chỉ "mờ + trượt lên": nét vẽ (path pathLength="1", strokeDashoffset 1 → 0, power2.inOut), mọc (scaleX/scaleY từ 0, transform-origin đặt trên CHÍNH phần tử được scale, vd. cột: bottom), lộ bằng clip-path, blur-in, đếm số (tabular-nums, số kiểu Việt 423,9).
- back.out(1.4–1.7) / elastic.out(1, 0.5) chỉ cho 1–2 biểu tượng/huy hiệu; không nảy chữ dài; opacity tween riêng bằng ease không nảy (power2.out).
- Dời bố cục power2.inOut 0,7–1,2 s; khi ý mới thành trọng tâm, ý cũ lùi opacity 0.35.
- Nhấn từ khóa đúng lúc giọng nói tới: marker lộ dần sau chữ hoặc lớp màu nhấn chồng lên rồi crossfade.
- Chữ đã vào chỗ thì đứng yên, không nhấp nháy; dao động "sống" (vd. wobble của Remotion) chỉ ≤ 4 px trên hình trang trí, không trên chữ; không tự thêm máy quay lớn (tối đa một push-in scale 1 → 1.02 sine.inOut trên div bọc bên trong stage).
- Tiếng Việt: không tách chữ thành ký tự thô (chỉ theo từ, hoặc Intl.Segmenter grapheme trên chuỗi NFC); mặt nạ overflow chừa ≥ 0.3em trên/dưới cho dấu.`;

// ---------------- Kịch bản ----------------

export type ScriptConstraints = { level: string; targetSeconds?: number; audience?: string; extra?: string };

export async function writeOutline(topic: string, c: ScriptConstraints): Promise<OutlineDoc> {
  const out = await askJson<{ title: string; objectives: string[]; items: { heading: string; points: string[] }[] }>({
    system: `Bạn là chuyên gia thiết kế bài giảng e-learning. ${RULES}`,
    content: `Lập dàn ý cho MỘT video bài giảng từ chủ đề/yêu cầu sau. Cấp độ: ${c.level}. Thời lượng mong muốn: ${c.targetSeconds ?? 120} giây. Đối tượng: ${c.audience ?? "người học doanh nghiệp"}.
${c.extra ?? ""}

CHỦ ĐỀ / YÊU CẦU:
"""${topic}"""

Trả về DUY NHẤT JSON: {"title": string, "objectives": string[], "items": [{"heading": string, "points": string[]}]}. 4–7 đầu mục.`,
  });
  return { title: out.title, objectives: out.objectives ?? [], items: out.items.map((i) => ({ heading: i.heading, points: i.points ?? [], level: 2 })), raw: topic };
}

type AiScript = {
  title: string;
  scenes: { title: string; visual: string; onscreen: string[]; vo: string; seconds: number }[];
  assumptions: string[];
};

export async function writeScript(outline: OutlineDoc, d: ProjectDefaults & ScriptConstraints & { fileName: string; sourceText?: string }): Promise<Video> {
  const target = d.targetSeconds ?? 120;
  const s = await askJson<AiScript>(
    {
      system: `Bạn là biên kịch video e-learning tiếng Việt. Viết lời thoại tự nhiên, câu ngắn (≤ 25 từ), mỗi câu là một nhịp hình. ${RULES}`,
      content: `Viết kịch bản video ~${target} giây (khoảng ${Math.round(target * 2.6)} tiếng đọc) theo dàn ý. Cấp độ ${d.level}.
Mỗi cảnh 15–40 giây, 2–5 câu thoại; mô tả hình cụ thể (dùng được các dạng: so sánh trái/phải, số lớn, lưới biểu tượng, chuỗi bước, cột so sánh, thanh thời gian, tài liệu A→B, vật thể bay, danh sách kiểm, thông điệp lớn); "onscreen" là chữ trên màn hình (ngắn).
Cảnh đầu giới thiệu chủ đề, cảnh cuối tóm tắt thông điệp.

DÀN Ý:
${JSON.stringify({ title: outline.title, objectives: outline.objectives, items: outline.items }, null, 1)}
${d.sourceText ? `\nTÀI LIỆU NGUỒN (chỉ dùng số liệu có ở đây):\n"""${d.sourceText.slice(0, 60000)}"""` : "\nKhông có tài liệu nguồn: KHÔNG dùng con số cụ thể nào ngoài dàn ý."}

Trả về DUY NHẤT JSON: {"title": string, "scenes": [{"title": string, "visual": string, "onscreen": string[], "vo": string, "seconds": number}], "assumptions": string[]}
"assumptions": liệt kê mọi nội dung/khẳng định bạn thêm ngoài dàn ý.`,
      effort: "high",
    },
    (v) => (Array.isArray(v.scenes) && v.scenes.length > 0 && v.scenes.every((x) => x.vo) ? [] : ["Thiếu scenes hoặc vo"]),
  );
  let t = 0;
  const video = buildVideo(
    {
      fileName: d.fileName,
      title: s.title,
      scenes: s.scenes.map((x) => {
        const sc = { scriptStart: t, scriptEnd: t + (x.seconds || 20), title: x.title, visual: x.visual, onscreen: x.onscreen ?? [], vo: x.vo };
        t += x.seconds || 20;
        return sc;
      }),
      context: d.sourceText,
    },
    d,
    0,
  );
  video.aiWritten = true;
  video.scenes.forEach((sc, i) => {
    sc.assumptions = [`Lời thoại và mô tả hình cảnh này do AI viết – cần duyệt`, ...(i === 0 ? s.assumptions ?? [] : [])];
  });
  return video;
}

// ---------------- Thiết kế cảnh (template + tham số) ----------------

/** Template AI được chọn: "image-focus" chỉ khi cảnh đã có ảnh người dùng (AI không tự chọn ảnh). */
function designIds(scene: Scene): string[] {
  return DESIGN_TEMPLATE_IDS.filter((id) => id !== "image-focus" || scene.design?.template === "image-focus");
}

function catalog(ids = DESIGN_TEMPLATE_IDS): string {
  return ids.map((id) => {
    const t = TEMPLATES[id];
    return `### ${id} – ${t.label}\nDùng khi: ${t.when}\nSchema tham số: ${JSON.stringify(t.schema)}\nVí dụ: ${JSON.stringify(t.example)}`;
  }).join("\n\n");
}

export function seriesSpec(video: Video): string {
  const th = getTheme(video.style, video.font);
  return `SERIES_SPEC: phong cách "${th.name}" – ${th.description}. Khung 1920×1080, vùng an toàn x 96–1824, y 54–1026. Chữ ≥ 28 px (dòng nguồn 22–24 px). Mỗi khung chỉ một màu nhấn chính; màu cam/đỏ (tone "warn") chỉ cho rủi ro/chi phí; "money" cho tiền. ${th.dark ? "" : "Không glow/neon trang trí."}`;
}

function sceneBrief(video: Video, scene: Scene, T?: SceneTiming): string {
  const lines = scene.sentences.map((s, i) => `  [câu ${i}]${T ? ` ${T.cues[i]?.toFixed(2)}–${T.ends[i]?.toFixed(2)}s` : ""}: ${s.text}`).join("\n");
  return `VIDEO: ${video.key} – ${video.title} (cấp độ ${video.level})
CẢNH ${scene.id} · ${scene.title} (kịch bản ${formatClock(scene.scriptStart)}–${formatClock(scene.scriptEnd)})
MÔ TẢ HÌNH: ${scene.visual || "—"}
CHỮ TRÊN MÀN HÌNH (kịch bản): ${scene.onscreen.length ? scene.onscreen.map((o) => `«${o}»`).join(", ") : "—"}
LỜI THOẠI (mỗi câu một nhịp; dùng chỉ số câu cho "at": {cue, f}):
${lines}
${video.context ? `NGỮ CẢNH TÀI LIỆU (bảng số liệu, mô tả infographic…):\n"""${video.context.slice(0, 12000)}"""` : ""}
${video.sources ? `NGUỒN: ${video.sources}` : ""}`;
}

export type DesignResult = { design: SceneDesign; assumptions: string[]; reasoning?: string };

/** Thiết kế hiện tại cho prompt: không gửi lại SVG minh hoạ (dài) – giữ "brief" là giữ hình. */
const designForPrompt = (d: SceneDesign) =>
  JSON.stringify(d, (k, v) => (k === "svg" && typeof v === "string" ? "(đã vẽ – giữ nguyên brief để giữ hình, đổi brief để vẽ lại)" : k === "svgKey" ? undefined : v));

export type DesignReply = { template: string; params: Record<string, unknown>; assumptions: string[]; reasoning?: string };
export type Prompt = { system: string; content: string };

/** Prompt chọn template + điền tham số cho một cảnh (dùng chung cho Claude API và Claude Code). */
export function designPrompt(video: Video, scene: Scene, T?: SceneTiming, note?: string): Prompt {
  const n = scene.sentences.length;
  return {
    system: `Bạn là đạo diễn hình chuyển động cho video e-learning. Bạn chọn MỘT template cảnh có tham số và điền tham số để hình khớp từng câu thoại. ${RULES}\n\n${MOTION_CHECKLIST}\n\nBiểu tượng có sẵn: ${ICON_NAMES.join(", ")}.\n\nTHƯ VIỆN TEMPLATE:\n${catalog(designIds(scene))}`,
    content: `${seriesSpec(video)}

${sceneBrief(video, scene, T)}
${scene.design ? `\nTHIẾT KẾ HIỆN TẠI: ${designForPrompt(scene.design)}` : ""}
${note ? `\nGHI CHÚ SỬA CỦA NGƯỜI DUYỆT (bắt buộc làm theo): ${note}` : ""}

Yêu cầu:
- Chọn template phù hợp nhất với mô tả hình và lời thoại. Hình phải nói đúng điều lời thoại nói (đúng chủ thể, đúng chiều hành động).
- Đặt "at": {"cue": i, "f": 0..1} cho từng phần tử để phần tử xuất hiện khi giọng đọc nói tới ý đó (cue từ 0 đến ${n - 1}).
- Ưu tiên dùng nguyên văn "chữ trên màn hình"; chữ nào khác do bạn đặt → ghi vào "assumptions".
- Có thể nhấn một cụm bằng **…**; chỉ số dưới viết CO₂.

Trả về DUY NHẤT JSON: {"template": string, "params": object, "assumptions": string[], "reasoning": string}`,
  };
}

/** Lỗi của một thiết kế template cho cảnh: template lạ, thiếu tham số, illustration thiếu brief, đổi ảnh, cue vượt số câu. */
export function designErrors(scene: Scene, v: { template: string; params?: Record<string, unknown> }): string[] {
  const ids = designIds(scene);
  if (!ids.includes(v.template)) return [`template "${v.template}" không có trong thư viện`];
  const errs = validateParams(v.template, v.params ?? {});
  if (v.template === "illustration" && !(typeof v.params?.brief === "string" && v.params.brief.trim())) errs.push('illustration cần "brief" (mô tả hình bằng lời)');
  const curImage = scene.design?.template === "image-focus" ? scene.design.params.image : undefined;
  if (v.template === "image-focus" && v.params?.image !== curImage) errs.push(`image-focus phải giữ nguyên "image": ${JSON.stringify(curImage)}`);
  const n = scene.sentences.length;
  const cues = JSON.stringify(v.params ?? {}).match(/"cue":\s*(\d+)/g) ?? [];
  for (const c of cues) if (Number(c.split(":")[1]) >= n) errs.push(`cue ${c} vượt quá số câu (${n})`);
  return errs;
}

export async function designScene(video: Video, scene: Scene, T?: SceneTiming, note?: string): Promise<DesignResult> {
  const r = await askJson<DesignReply>({ ...designPrompt(video, scene, T, note), effort: "medium" }, (v) => designErrors(scene, v));
  // SVG minh hoạ chỉ do drawIllustration vẽ (bước dựng cảnh, theo brief) – không nhận SVG AI tự viết ở đây
  if (r.template === "illustration") {
    delete r.params.svg;
    delete r.params.svgKey;
  }
  return { design: { template: r.template, params: r.params, by: "ai" }, assumptions: r.assumptions ?? [], reasoning: r.reasoning };
}

// ---------------- Hình minh hoạ (SVG) ----------------

export type IllustrationStyle = {
  /** Độ dày nét viền (đơn vị viewBox 800×600). */
  strokeWidth: number;
  /** Theme nền tối: --ink sáng, --card/--bg2 tối. */
  dark: boolean;
};

export const ILLUSTRATION_RULES = (o: IllustrationStyle) => `Vẽ MỘT hình minh hoạ vector phẳng (flat) cho video e-learning, dạng SVG:
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"> – không width/height; không nền phủ kín cả khung (nền video có sẵn).
- Chỉ dùng thẻ: g, path, circle, ellipse, rect, line, polyline, polygon. Tối đa ~150 phần tử. KHÔNG chữ (không <text>), không <image>, <use>, <defs>, gradient, filter, <style>, script, href, sự kiện on*.
- Màu CHỈ qua thuộc tính fill/stroke = biến theme hoặc "none": ${THEME_COLOR_VARS.map((c) => `var(--${c})`).join(", ")}.
  Vai trò: --accent = chủ thể/tiêu điểm (1–2 chỗ); --alt = đối tượng phụ; --money = tiền/giá trị; --warn = CHỈ rủi ro/nguy hiểm; --ink = nét viền chính; --ink-soft = chi tiết phụ, bóng; --card = mảng sáng lớn (${o.dark ? "trên nền tối --card là mảng tối hơi sáng hơn nền" : "thường trắng/sáng"}); --bg2 = mảng nền/sàn; --line = đường mảnh trang trí.${o.dark ? " Theme nền TỐI: --ink là màu sáng." : ""}
- Nét: stroke-width="${o.strokeWidth}", stroke-linecap="round", stroke-linejoin="round". Hình khối đơn giản, rõ ở cỡ nhỏ, không chi tiết li ti, không ảnh thật, không logo/thương hiệu thật.
- Nhóm theo thứ tự xuất hiện: các <g id="part-1">, <g id="part-2">, … (3–7 nhóm, nhóm đầu là bối cảnh/nền, nhóm sau là chủ thể và chi tiết nhấn), nằm thẳng trong <svg>. Hình sẽ hiện dần từng nhóm.
- Nét viền ngoài chính của các hình nên là <path … class="draw" pathLength="1" fill="none" stroke="var(--ink)"> để vẽ ra dần (mảng màu tô dùng phần tử riêng không có class).
- Có thể dùng transform="translate(…)"/"scale(…)" trên <g>.`;

export function illustrationPrompt(brief: string, o: IllustrationStyle, feedback = ""): Prompt {
  return {
    system: `Bạn là họa sĩ minh hoạ vector cho video e-learning an toàn – chất lượng – môi trường (TUV NORD). ${ILLUSTRATION_RULES(o)}`,
    content: `MÔ TẢ HÌNH (tiếng Việt):\n"""${brief.slice(0, 1500)}"""\n${feedback ? `\nLẦN TRƯỚC CHƯA ĐẠT (phải sửa):\n${feedback}\n` : ""}\nTrả về DUY NHẤT một khối \`\`\`svg … \`\`\` chứa toàn bộ SVG.`,
  };
}

/** Lọc SVG minh hoạ và kiểm mức tối thiểu (≥ 6 phần tử, ≥ 2 nhóm part-N). svg = null khi chưa đạt. */
export function checkIllustration(raw: string): { svg: string | null; errors: string[]; warnings: string[] } {
  const r = sanitizeSvg(raw, "illustration");
  const parts = r.svg?.match(/<g id="part-\d+"/g)?.length ?? 0;
  const errors = [r.error, r.svg && (r.elements ?? 0) < 6 ? "Hình quá sơ sài (< 6 phần tử)" : "", r.svg && parts < 2 ? 'Cần ≥ 2 nhóm <g id="part-N">' : ""].filter((x): x is string => !!x);
  return { svg: r.svg && errors.length === 0 ? r.svg : null, errors, warnings: r.warnings };
}

/** Claude vẽ một hình minh hoạ SVG theo mô tả; kết quả đã lọc an toàn (mode illustration). */
export async function drawIllustration(brief: string, o: IllustrationStyle): Promise<{ svg: string; warnings: string[] }> {
  if (!brief.trim()) throw new AiError("Thiếu mô tả hình minh hoạ");
  let feedback = "";
  for (let round = 0; round < 3; round++) {
    const text = await ask({ ...illustrationPrompt(brief, o, feedback), effort: "medium", maxTokens: 24000 });
    const raw = text.match(/```(?:svg|xml|html)?\s*(<svg[\s\S]*?<\/svg>)\s*```/)?.[1] ?? text.match(/<svg[\s\S]*<\/svg>/)?.[0];
    if (!raw) {
      feedback = "Không tìm thấy <svg>…</svg>.";
      continue;
    }
    const r = checkIllustration(raw);
    if (r.svg) return { svg: r.svg, warnings: r.warnings };
    feedback = [...r.errors, ...r.warnings.slice(0, 5)].join("\n");
  }
  throw new AiError(`Claude chưa vẽ được hình minh hoạ hợp lệ: ${feedback}`);
}

// ---------------- Cảnh tùy biến ----------------

export type CustomSceneOptions = {
  engine: "hyperframes" | "remotion";
  T: SceneTiming;
  /** Hợp đồng file cảnh (mục 6A.3) hoặc quy tắc TSX. */
  contract: string;
  /** 1–2 cảnh mẫu đã duyệt cùng theme để bắt chước. */
  examples: string[];
  lint: (code: string) => string[];
  /** Yêu cầu sửa của người dùng (prompt tại cảnh). */
  instruction?: string;
  /** Mã cảnh tùy biến hiện tại (khi sửa tiếp cảnh đã tùy biến). */
  current?: string;
};

/** Prompt viết mã cảnh tùy biến (dùng chung cho Claude API và Claude Code). */
export function customScenePrompt(video: Video, scene: Scene, o: Omit<CustomSceneOptions, "lint">, feedback = ""): Prompt {
  return {
    system: `Bạn viết mã cảnh hoạt hình cho video e-learning (${o.engine === "hyperframes" ? "HTML + CSS + SVG + GSAP, HyperFrames" : "React/TSX, Remotion"}). ${RULES}\n\n${MOTION_CHECKLIST}\n\n${CUSTOM_SCENE_CHECKLIST}\nMọi quy tắc trên phải tuân thủ HỢP ĐỒNG FILE CẢNH (nếu mâu thuẫn, hợp đồng thắng).`,
    content: `${seriesSpec(video)}

HỢP ĐỒNG FILE CẢNH:
${o.contract}

${sceneBrief(video, scene, o.T)}
KHỐI TIMING hiện tại: ${JSON.stringify({ dur: o.T.dur, cues: o.T.cues, ends: o.T.ends })}
${o.current ? `\nMÃ CẢNH HIỆN TẠI (sửa trên nền này, giữ những gì yêu cầu không nhắc tới):\n${o.current.slice(0, 16000)}\n` : ""}${o.instruction ? `\nYÊU CẦU SỬA CỦA NGƯỜI DÙNG (bắt buộc làm theo, nhưng không được phá quy tắc an toàn khung hình, cỡ chữ ≥ 28 px, đồng bộ theo câu thoại): ${o.instruction}\n` : ""}
CẢNH MẪU ĐÃ DUYỆT (bắt chước phong cách, lớp CSS, nhịp):
${o.examples.map((e, i) => `--- mẫu ${i + 1} ---\n${e.slice(0, 9000)}`).join("\n")}
${feedback ? `\nLỖI CỦA LẦN TRƯỚC (phải sửa hết):\n${feedback}` : ""}

Trả về: một khối mã \`\`\`${o.engine === "hyperframes" ? "html" : "tsx"} … \`\`\` chứa TOÀN BỘ file cảnh, rồi một khối \`\`\`json {"assumptions": [...]} \`\`\` liệt kê chữ/nhãn bạn tự thêm.`,
  };
}

export async function writeCustomScene(video: Video, scene: Scene, o: CustomSceneOptions): Promise<{ code: string; assumptions: string[] }> {
  let feedback = "";
  for (let round = 0; round < 3; round++) {
    const text = await ask({ ...customScenePrompt(video, scene, o, feedback), effort: "high", maxTokens: 48000 });
    const code = text.match(/```(?:html|tsx|jsx|typescript)\s*([\s\S]*?)```/)?.[1]?.trim();
    const assumptions = (() => {
      try {
        return (JSON.parse(text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? "{}").assumptions as string[]) ?? [];
      } catch {
        return [];
      }
    })();
    if (!code) {
      feedback = "Không tìm thấy khối mã";
      continue;
    }
    const errs = o.lint(code);
    if (errs.length === 0) return { code, assumptions: ["Cảnh tùy biến do AI viết mã", ...assumptions] };
    feedback = errs.join("\n");
  }
  throw new Error(`Cảnh tùy biến vẫn vi phạm hợp đồng sau 3 lần: ${feedback}`);
}

// ---------------- Soát bằng hình (vision) ----------------

export type VisionIssue = { scene: string; severity: "P0" | "P1" | "P2"; problem: string; fix: string };

export async function visionReview(video: Video, frames: { file: string; scene?: string; label?: string }[]): Promise<VisionIssue[]> {
  const content: any[] = [];
  for (const f of frames.slice(0, 40)) {
    content.push({ type: "text", text: `Khung: ${f.label ?? f.scene ?? ""}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f.file).toString("base64") } });
  }
  const scenesText = video.scenes.map((s) => `${s.id} · ${s.title}\n  Hình: ${s.visual}\n  Chữ: ${s.onscreen.join(" | ")}\n  Lời: ${s.sentences.map((x) => x.text).join(" ")}`).join("\n");
  content.push({
    type: "text",
    text: `Kịch bản:\n${scenesText}\n${video.sources ? `Nguồn: ${video.sources}` : ""}

Soát các khung hình trên theo checklist: (1) chữ đè nhau, (2) chữ tràn/cắt, (3) khoảng trống vô lý, (4) sai chính tả tiếng Việt, (5) số liệu khác kịch bản, (6) hình mâu thuẫn lời thoại (ví dụ vẽ sai chủ thể hành động), (7) khung cuối cảnh chưa hiển thị đủ.
Trả về DUY NHẤT JSON: {"issues": [{"scene": "sN", "severity": "P0"|"P1"|"P2", "problem": string, "fix": string}]} – mảng rỗng nếu không có lỗi. P0 = sai nội dung/không đọc được.`,
  });
  const r = await askJson<{ issues: VisionIssue[] }>({ system: `Bạn là người soát hình khắt khe cho video e-learning. ${RULES}`, content, effort: "medium" });
  return r.issues ?? [];
}

/** Sửa cảnh theo ghi chú ngôn ngữ tự nhiên của người duyệt (chỉ đúng cảnh đó). */
export async function reviseScene(video: Video, scene: Scene, note: string, T?: SceneTiming): Promise<DesignResult> {
  return designScene(video, scene, T, note);
}

// ---------------- Sửa / rà soát cách đọc ----------------

export type ReadingItem = { id: string; text: string; tts: string; warnings: string[] };
export type ReadingFix = { id: string; tts: string; glossary?: { term: string; reading: string }[]; note?: string };
export type ReadingSuggestion = { id: string; tts: string; reason?: string; glossary?: { term: string; reading: string }[] };

const READING_RULES = `Bạn chuẩn hoá văn bản cho máy đọc tiếng Việt (TTS VieNeu/CIT) trong khóa học e-learning. Viết lại "tts" để máy đọc đúng: số → chữ (kiểu Việt: 423,9 → "bốn trăm hai mươi ba phẩy chín"; 2,78 → "hai phẩy bảy mươi tám"; 60% → "sáu mươi phần trăm"; phiên bản 5.0 → "năm chấm không"), ngày tháng → "ngày … tháng … năm …", đơn vị (kg → "ki lô gam", m² → "mét vuông"), ký hiệu (CO₂ → "xê ô hai"), viết tắt đọc theo chữ cái tiếng Việt (VCS → "vê xê ét") hoặc đọc nghĩa nếu quen dùng (GHG → "khí nhà kính"), thuật ngữ tiếng Anh → phiên âm tiếng Việt dễ đọc hoặc từ tiếng Việt tương đương đúng chuyên ngành. Mã tiêu chuẩn đọc như giảng viên Việt Nam hay nói trên lớp: "ISO" → "i sô", số hiệu đọc thành số (ISO 45001 → "i sô bốn lăm nghìn không trăm linh một", ISO 9001 → "i sô chín nghìn không trăm linh một"), năm ban hành sau dấu hai chấm đọc "năm hai nghìn không trăm mười tám"; cùng một mã thì đọc giống nhau trong cả khóa. Giữ nguyên ý, không thêm bớt nội dung, giữ nguyên thẻ [nghỉ …], [cười]. ${RULES}`;

export function readingsPrompt(items: ReadingItem[], context = ""): Prompt {
  return {
    system: READING_RULES,
    content: `Ngữ cảnh khóa học: ${context.slice(0, 2000)}

Các câu cần sửa (JSON):
${JSON.stringify(items, null, 1)}

Trả về DUY NHẤT JSON: {"fixes": [{"id": string, "tts": string, "glossary": [{"term": string, "reading": string}], "note": string}]}
- "glossary": thuật ngữ nên lưu để dùng lại cho các câu khác (term = nguyên văn trong lời thoại).`,
  };
}

/** Đề xuất cách đọc tiếng Việt cho các câu còn chữ số / viết tắt / từ tiếng Anh. Không đổi nghĩa, không thêm bớt ý. */
export async function fixReadings(items: ReadingItem[], context = ""): Promise<ReadingFix[]> {
  if (items.length === 0) return [];
  const r = await askJson<{ fixes: ReadingFix[] }>({ ...readingsPrompt(items, context), effort: "medium" }, (v) => (Array.isArray(v.fixes) ? [] : ["Thiếu fixes"]));
  return r.fixes.filter((f) => items.some((i) => i.id === f.id) && f.tts?.trim());
}

/** Số câu tối đa mỗi lần gọi khi rà soát (video dài chia nhiều lượt). */
export const REVIEW_BATCH = 60;

/** Prompt rà soát MỌI câu (dùng chung cho Claude API và Claude Code): chỉ trả câu mà máy sẽ đọc sai/không tự nhiên. */
export function reviewReadingsPrompt(items: ReadingItem[], context = ""): Prompt {
  return {
    system: READING_RULES,
    content: `Ngữ cảnh khóa học: ${context.slice(0, 2000)}

Hãy đọc và rà soát TỪNG câu dưới đây. "text" là lời thoại hiển thị (không được đổi), "tts" là cách đọc hiện tại gửi cho máy đọc, "warnings" là cảnh báo của bộ kiểm theo luật (có thể thiếu hoặc báo nhầm).
Tìm mọi chỗ máy đọc tiếng Việt sẽ đọc SAI hoặc KHÔNG TỰ NHIÊN, kể cả câu không có cảnh báo: số/ngày/đơn vị/phần trăm đọc sai hoặc đổi nghĩa so với "text", viết tắt chưa đánh vần/chưa đọc nghĩa (HSE, ILO, PPE…), từ tiếng Anh, mã tiêu chuẩn (ISO…), ký hiệu, cách đọc ngượng hoặc sai so với cách giảng viên Việt Nam nói.
Không đề xuất khi cách đọc hiện tại đã ổn (vd. "các bon" cho carbon là được). Không đổi ý, không thêm bớt nội dung, giữ nguyên thẻ [nghỉ …], [cười].

Các câu (JSON):
${JSON.stringify(items, null, 1)}

Trả về DUY NHẤT JSON: {"suggestions": [{"id": string, "tts": string, "reason": string, "glossary": [{"term": string, "reading": string}]}]}
- CHỈ gồm các câu cần đổi; "tts" là TOÀN BỘ câu đã sửa; mảng rỗng nếu mọi câu đều ổn.
- "reason": một câu tiếng Việt ngắn nói vì sao (vd. "HSE đọc theo chữ cái", "ISO 45001 giảng viên quen đọc thành số").
- "glossary": thuật ngữ nên lưu để dùng lại cho câu khác (term = nguyên văn trong lời thoại); bỏ trống nếu không có.`,
  };
}

const tagsOf = (s: string) => (s.match(/\[[^\[\]\n]{1,24}\]/g) ?? []).join(" ");

/** Claude rà soát mọi câu (chia lượt ≤ REVIEW_BATCH câu); chỉ giữ đề xuất hợp lệ: đúng id, khác cách đọc cũ, giữ đủ thẻ [nghỉ …]. */
export async function reviewReadings(items: ReadingItem[], context = "", onBatch?: (done: number, total: number) => void): Promise<ReadingSuggestion[]> {
  const out: ReadingSuggestion[] = [];
  for (let i = 0; i < items.length; i += REVIEW_BATCH) {
    const batch = items.slice(i, i + REVIEW_BATCH);
    const r = await askJson<{ suggestions: ReadingSuggestion[] }>({ ...reviewReadingsPrompt(batch, context), effort: "medium" }, (v) => (Array.isArray(v.suggestions) ? [] : ["Thiếu suggestions"]));
    for (const s of r.suggestions) {
      const it = batch.find((x) => x.id === s.id);
      const tts = typeof s.tts === "string" ? s.tts.trim() : "";
      if (!it || !tts || tts === it.tts.trim() || tagsOf(tts) !== tagsOf(it.tts)) continue;
      const glossary = (Array.isArray(s.glossary) ? s.glossary : []).filter((g) => typeof g?.term === "string" && typeof g?.reading === "string" && g.term.trim() && g.reading.trim());
      out.push({ id: s.id, tts, reason: typeof s.reason === "string" && s.reason.trim() ? s.reason.trim() : undefined, glossary: glossary.length ? glossary : undefined });
    }
    onBatch?.(Math.min(i + REVIEW_BATCH, items.length), items.length);
  }
  return out;
}
