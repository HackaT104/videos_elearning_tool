// cartoon – Cảnh hoạt hình vẽ tay (p5.js + p5.brush, kit Claude Animation Base): AI mô tả cảnh ("brief"), bước dựng cảnh nhờ Claude
// viết mã cảnh ("code") rồi render trước thành clip MP4 ("clip", @cvs/engine-brush); cảnh phát clip như <video> tua theo khung.
// Chữ (tiêu đề, ý chính, chú thích) là HTML phủ theo kịch bản – cùng bố cục với illustration.

import { buildArt, type IllustrationParams } from "./illustration";
import type { TemplateDef } from "./common";

const beatSchema = { type: "object", properties: { cue: { type: "integer", minimum: 0 }, f: { type: "number", minimum: 0, maximum: 1 } }, required: ["cue"] };

export type CartoonParams = Omit<IllustrationParams, "svg"> & {
  /** Mã cảnh p5.brush (function scene(t) {...}) – do Claude viết ở bước dựng cảnh. */
  code?: string;
  /** Tên clip đã render (<mã đệm>.mp4) – hệ thống điền. */
  clip?: string;
};

export const cartoon: TemplateDef<CartoonParams> = {
  id: "cartoon",
  label: "Hoạt hình vẽ tay (nhân vật)",
  when: "Cần một cảnh hoạt hình kể chuyện có nhân vật hành động/biểu cảm (kỹ sư phát hiện rủi ro, làm sai rồi sửa, ngạc nhiên trước con số…), vẽ tay nét cọ. Chỉ điền \"brief\" (≤ 80 từ: nhân vật làm gì ở từng câu thoại, đồ vật, bối cảnh, cảm xúc thay đổi ra sao) – KHÔNG tự viết mã; hệ thống tự dựng. Trong clip không có chữ: thông điệp đặt ở title/points/caption (chỉ chữ của kịch bản). Dùng tiết chế (render chậm): 1–3 cảnh mỗi video, cho khoảnh khắc cần cảm xúc/tình huống.",
  schema: {
    type: "object",
    properties: {
      kicker: { type: "string" },
      title: { type: "string" },
      brief: { type: "string", description: "Mô tả cảnh hoạt hình theo từng câu thoại (tiếng Việt, ≤ 80 từ)" },
      code: { type: "string", description: "Do hệ thống điền – không tự viết" },
      clip: { type: "string", description: "Do hệ thống điền – không tự viết" },
      caption: { type: "string" },
      points: { type: "array", maxItems: 3, items: { type: "object", properties: { text: { type: "string" }, at: beatSchema }, required: ["text"] } },
      layout: { type: "string", enum: ["full", "left", "right"], description: "full: hoạt hình kín khung; left/right: hoạt hình bên trái/phải, ý chính bên kia" },
      at: beatSchema,
    },
    required: ["brief"],
  },
  example: {
    title: "Kiểm tra **trước** khi vận hành",
    brief: "Câu 0: kỹ sư đội mũ bảo hộ bước tới cạnh máy ép, vẻ bình thường. Câu 1: kỹ sư nhìn thấy dây điện hở dưới máy, giật mình (dấu !), lùi lại. Câu 2: kỹ sư bật đèn ý tưởng, giơ tay ra hiệu dừng máy, vẻ quyết tâm.",
    layout: "full",
  },
  build: (P, ctx) => buildArt({ ...P, svg: undefined }, ctx, "clip"),
};
