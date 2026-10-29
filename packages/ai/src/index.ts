// LLM cho Course Video Studio: viết outline/kịch bản, chọn template + điền tham số, viết cảnh tùy biến, soát hình.
// Nguyên tắc: không bịa số liệu; mọi chữ AI tự thêm phải nằm trong assumptions để người duyệt thấy (màu vàng).

import { readFileSync } from "node:fs";
import { buildVideo, formatClock, type OutlineDoc, type ProjectDefaults, type Scene, type SceneDesign, type SceneTiming, type Video } from "@cvs/core";
import { DESIGN_TEMPLATE_IDS, ICON_NAMES, TEMPLATES, validateParams } from "@cvs/engine";
import { getTheme } from "@cvs/themes";
import { ask, askJson } from "./client";

export * from "./client";

const RULES = `QUY TẮC BẮT BUỘC (khóa học e-learning TUV NORD, tiếng Việt):
- KHÔNG BỊA SỐ LIỆU. Mọi con số, ngày, mã phiên bản, tên tổ chức trên màn hình phải lấy đúng từ tài liệu nguồn được cung cấp.
- Mọi chữ/nhãn/danh sách bạn tự thêm (không có nguyên văn trong kịch bản) phải được liệt kê trong "assumptions".
- Thuật ngữ: verification = thẩm tra, validation = thẩm định; viết "TUV NORD".
- Mỗi lần chỉ hiện một ý mới; không slide gạch đầu dòng; không mọi thứ cùng hiện một lúc.
- Không vẽ/mô phỏng logo hay giao diện của tổ chức thật – chỉ ghi tên bằng chữ.
- Chữ ngắn gọn: nhãn ≤ 6 từ, câu trên màn hình ≤ 14 từ.`;

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

function catalog(): string {
  return DESIGN_TEMPLATE_IDS.map((id) => {
    const t = TEMPLATES[id];
    return `### ${id} – ${t.label}\nDùng khi: ${t.when}\nSchema tham số: ${JSON.stringify(t.schema)}\nVí dụ: ${JSON.stringify(t.example)}`;
  }).join("\n\n");
}

export function seriesSpec(video: Video): string {
  const th = getTheme(video.style);
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

export async function designScene(video: Video, scene: Scene, T?: SceneTiming, note?: string): Promise<DesignResult> {
  const n = scene.sentences.length;
  const r = await askJson<{ template: string; params: Record<string, unknown>; assumptions: string[]; reasoning?: string }>(
    {
      system: `Bạn là đạo diễn hình chuyển động cho video e-learning. Bạn chọn MỘT template cảnh có tham số và điền tham số để hình khớp từng câu thoại. ${RULES}\n\nBiểu tượng có sẵn: ${ICON_NAMES.join(", ")}.\n\nTHƯ VIỆN TEMPLATE:\n${catalog()}`,
      content: `${seriesSpec(video)}

${sceneBrief(video, scene, T)}
${scene.design ? `\nTHIẾT KẾ HIỆN TẠI: ${JSON.stringify(scene.design)}` : ""}
${note ? `\nGHI CHÚ SỬA CỦA NGƯỜI DUYỆT (bắt buộc làm theo): ${note}` : ""}

Yêu cầu:
- Chọn template phù hợp nhất với mô tả hình và lời thoại. Hình phải nói đúng điều lời thoại nói (đúng chủ thể, đúng chiều hành động).
- Đặt "at": {"cue": i, "f": 0..1} cho từng phần tử để phần tử xuất hiện khi giọng đọc nói tới ý đó (cue từ 0 đến ${n - 1}).
- Ưu tiên dùng nguyên văn "chữ trên màn hình"; chữ nào khác do bạn đặt → ghi vào "assumptions".
- Có thể nhấn một cụm bằng **…**; chỉ số dưới viết CO₂.

Trả về DUY NHẤT JSON: {"template": string, "params": object, "assumptions": string[], "reasoning": string}`,
      effort: "medium",
    },
    (v) => {
      if (!DESIGN_TEMPLATE_IDS.includes(v.template)) return [`template "${v.template}" không có trong thư viện`];
      const errs = validateParams(v.template, v.params ?? {});
      const cues = JSON.stringify(v.params).match(/"cue":\s*(\d+)/g) ?? [];
      for (const c of cues) if (Number(c.split(":")[1]) >= n) errs.push(`cue ${c} vượt quá số câu (${n})`);
      return errs;
    },
  );
  return { design: { template: r.template, params: r.params, by: "ai" }, assumptions: r.assumptions ?? [], reasoning: r.reasoning };
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
};

export async function writeCustomScene(video: Video, scene: Scene, o: CustomSceneOptions): Promise<{ code: string; assumptions: string[] }> {
  let feedback = "";
  for (let round = 0; round < 3; round++) {
    const text = await ask({
      system: `Bạn viết mã cảnh hoạt hình cho video e-learning (${o.engine === "hyperframes" ? "HTML + CSS + SVG + GSAP, HyperFrames" : "React/TSX, Remotion"}). ${RULES}`,
      content: `${seriesSpec(video)}

HỢP ĐỒNG FILE CẢNH:
${o.contract}

${sceneBrief(video, scene, o.T)}
KHỐI TIMING hiện tại: ${JSON.stringify({ dur: o.T.dur, cues: o.T.cues, ends: o.T.ends })}

CẢNH MẪU ĐÃ DUYỆT (bắt chước phong cách, lớp CSS, nhịp):
${o.examples.map((e, i) => `--- mẫu ${i + 1} ---\n${e.slice(0, 9000)}`).join("\n")}
${feedback ? `\nLỖI CỦA LẦN TRƯỚC (phải sửa hết):\n${feedback}` : ""}

Trả về: một khối mã \`\`\`${o.engine === "hyperframes" ? "html" : "tsx"} … \`\`\` chứa TOÀN BỘ file cảnh, rồi một khối \`\`\`json {"assumptions": [...]} \`\`\` liệt kê chữ/nhãn bạn tự thêm.`,
      effort: "high",
      maxTokens: 48000,
    });
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
