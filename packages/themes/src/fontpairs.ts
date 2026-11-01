// Cặp phông chữ cho video: người dùng chọn một cặp (tiêu đề + nội dung) để đè lên phông mặc định của phong cách.
// Mọi phông đều có bộ ký tự tiếng Việt (gói @fontsource, nhúng khi render – không cần mạng).
// "theo-phong-cach" = giữ phông của phong cách đang chọn.

import type { FontRef } from "./tokens";

export type FontPair = {
  id: string;
  name: string;
  /** Hợp với nội dung gì – hiện cho người dùng. */
  description: string;
  display: FontRef;
  body: FontRef;
  bodyBold: FontRef;
};

const f = (family: string, pkg: string, weight: number, generic?: FontRef["generic"]): FontRef => ({ family, pkg, weight, ...(generic ? { generic } : {}) });

export const DEFAULT_FONT_PAIR = "theo-phong-cach";

export const FONT_PAIRS: FontPair[] = [
  {
    id: "be-vietnam",
    name: "Be Vietnam Pro",
    description: "Thiết kế riêng cho tiếng Việt, dấu thanh rõ, hiện đại. Hợp mọi chủ đề.",
    display: f("Be Vietnam Pro", "be-vietnam-pro", 700),
    body: f("Be Vietnam Pro", "be-vietnam-pro", 400),
    bodyBold: f("Be Vietnam Pro", "be-vietnam-pro", 600),
  },
  {
    id: "lexend",
    name: "Lexend (dễ đọc)",
    description: "Tạo ra để giảm mỏi mắt khi đọc; hợp bài giảng dài, nhiều chữ trên màn hình.",
    display: f("Lexend", "lexend", 700),
    body: f("Lexend", "lexend", 400),
    bodyBold: f("Lexend", "lexend", 600),
  },
  {
    id: "montserrat-inter",
    name: "Montserrat + Inter",
    description: "Tiêu đề hình học đậm, nội dung trung tính. Kỹ thuật, quy trình.",
    display: f("Montserrat", "montserrat", 800),
    body: f("Inter", "inter", 400),
    bodyBold: f("Inter", "inter", 600),
  },
  {
    id: "jakarta",
    name: "Plus Jakarta Sans",
    description: "Tròn, gọn, chuyên nghiệp. Đào tạo nội bộ doanh nghiệp.",
    display: f("Plus Jakarta Sans", "plus-jakarta-sans", 800),
    body: f("Plus Jakarta Sans", "plus-jakarta-sans", 400),
    bodyBold: f("Plus Jakarta Sans", "plus-jakarta-sans", 700),
  },
  {
    id: "roboto-slab",
    name: "Roboto Slab + Roboto",
    description: "Tiêu đề chân vuông chắc chắn, nội dung Roboto quen mắt. Tiêu chuẩn, quy định.",
    display: f("Roboto Slab", "roboto-slab", 700, "serif"),
    body: f("Roboto", "roboto", 400),
    bodyBold: f("Roboto", "roboto", 600),
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk + Inter",
    description: "Cảm giác công nghệ, hợp số liệu và biểu đồ.",
    display: f("Space Grotesk", "space-grotesk", 700),
    body: f("Inter", "inter", 400),
    bodyBold: f("Inter", "inter", 600),
  },
  {
    id: "oswald",
    name: "Oswald + Source Sans 3",
    description: "Tiêu đề cao, hẹp, mạnh như bản tin; nội dung gọn.",
    display: f("Oswald", "oswald", 600),
    body: f("Source Sans 3", "source-sans-3", 400),
    bodyBold: f("Source Sans 3", "source-sans-3", 600),
  },
  {
    id: "bricolage",
    name: "Bricolage Grotesque + Inter",
    description: "Biên tập hiện đại, có cá tính; hợp phần mở đầu và tóm tắt.",
    display: f("Bricolage Grotesque", "bricolage-grotesque", 800),
    body: f("Inter", "inter", 400),
    bodyBold: f("Inter", "inter", 600),
  },
  {
    id: "fira",
    name: "Fira Sans",
    description: "Trung tính, rất rõ ở cỡ nhỏ. Bảng biểu, danh sách dài.",
    display: f("Fira Sans", "fira-sans", 700),
    body: f("Fira Sans", "fira-sans", 400),
    bodyBold: f("Fira Sans", "fira-sans", 600),
  },
  {
    id: "josefin",
    name: "Josefin Sans + Mulish",
    description: "Hình học thanh lịch, nhẹ nhàng. Kỹ năng mềm, dịch vụ.",
    display: f("Josefin Sans", "josefin-sans", 700),
    body: f("Mulish", "mulish", 400),
    bodyBold: f("Mulish", "mulish", 700),
  },
  {
    id: "raleway",
    name: "Raleway + Noto Sans",
    description: "Tiêu đề thanh mảnh, sang; nội dung Noto rõ ràng.",
    display: f("Raleway", "raleway", 800),
    body: f("Noto Sans", "noto-sans", 400),
    bodyBold: f("Noto Sans", "noto-sans", 600),
  },
  {
    id: "playfair",
    name: "Playfair Display + Source Sans 3",
    description: "Tiêu đề có chân tương phản cao, sang trọng. Lãnh đạo, chiến lược.",
    display: f("Playfair Display", "playfair-display", 700, "serif"),
    body: f("Source Sans 3", "source-sans-3", 400),
    bodyBold: f("Source Sans 3", "source-sans-3", 600),
  },
  {
    id: "merriweather",
    name: "Merriweather + Noto Sans",
    description: "Học thuật, đáng tin; tiêu đề có chân dễ đọc trên màn hình.",
    display: f("Merriweather", "merriweather", 700, "serif"),
    body: f("Noto Sans", "noto-sans", 400),
    bodyBold: f("Noto Sans", "noto-sans", 600),
  },
  {
    id: "lora-inter",
    name: "Lora + Inter",
    description: "Tiêu đề có chân mềm mại, nội dung hiện đại. Kể chuyện, tình huống.",
    display: f("Lora", "lora", 700, "serif"),
    body: f("Inter", "inter", 400),
    bodyBold: f("Inter", "inter", 600),
  },
  {
    id: "noto-serif",
    name: "Noto Serif",
    description: "Toàn bộ có chân như sách giáo khoa. Pháp lý, văn bản.",
    display: f("Noto Serif", "noto-serif", 700, "serif"),
    body: f("Noto Serif", "noto-serif", 400, "serif"),
    bodyBold: f("Noto Serif", "noto-serif", 600, "serif"),
  },
  {
    id: "quicksand",
    name: "Quicksand + Nunito",
    description: "Bo tròn, thân thiện, nhẹ nhàng. Hướng dẫn cơ bản.",
    display: f("Quicksand", "quicksand", 700),
    body: f("Nunito", "nunito", 500),
    bodyBold: f("Nunito", "nunito", 700),
  },
  {
    id: "baloo",
    name: "Baloo 2 + Nunito",
    description: "Vui nhộn, tròn đầy. Học đường, an toàn cho người mới.",
    display: f("Baloo 2", "baloo-2", 800),
    body: f("Nunito", "nunito", 500),
    bodyBold: f("Nunito", "nunito", 800),
  },
  {
    id: "viet-tay",
    name: "Viết tay (Patrick Hand)",
    description: "Như viết bảng trắng; hợp video giải thích ngắn.",
    display: f("Patrick Hand", "patrick-hand", 400, "cursive"),
    body: f("Patrick Hand", "patrick-hand", 400, "cursive"),
    bodyBold: f("Patrick Hand", "patrick-hand", 400, "cursive"),
  },
];

export const FONT_PAIR_IDS = FONT_PAIRS.map((p) => p.id);

export function getFontPair(id: string | undefined | null): FontPair | undefined {
  if (!id || id === DEFAULT_FONT_PAIR) return undefined;
  return FONT_PAIRS.find((p) => p.id === id);
}
