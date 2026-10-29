// Token theme dùng chung (mục 6.3). Template chỉ dùng token → đổi phong cách không cần sửa cảnh.

export type ThemeId = "giay-ky-thuat" | "toi-dien-anh" | "phang-tuoi-sang" | "bien-tap-tap-chi" | "bang-trang";

export type FontRef = { family: string; pkg: string; weight: number };

export type Theme = {
  id: ThemeId;
  name: string;
  description: string;
  dark: boolean;
  colors: {
    bg: string;
    bg2: string;
    bg3: string;
    grid: string;
    ink: string;
    inkSoft: string;
    /** Màu nhấn chính (giải pháp/kết quả). */
    accent: string;
    /** Màu phụ (thị trường/thông tin). */
    alt: string;
    /** Tiền/giá trị. */
    money: string;
    /** Rủi ro/chi phí – chỉ dùng cho rủi ro hoặc chi phí. */
    warn: string;
    card: string;
    cardBorder: string;
    line: string;
    /** Tô dạ quang / nền nhấn chữ. */
    highlight: string;
  };
  fonts: { display: FontRef; body: FontRef; bodyBold: FontRef };
  stroke: number;
  radius: number;
  /** Kiểu thẻ. */
  card: "outline" | "glow" | "solid-shadow" | "rule" | "sketch";
  /** Kiểu nền. */
  ground: "grid" | "radial" | "cream" | "paper" | "whiteboard";
  motion: {
    enterEase: string;
    enterDur: number;
    moveEase: string;
    moveDur: number;
    /** Nhịp chậm (trung cấp/chuyên sâu). */
    slowEnterEase: string;
    slowEnterDur: number;
    /** Độ trượt khi vào (px). */
    rise: number;
  };
  /** Chữ hoa cho tiêu đề phụ (kicker). */
  kickerUpper: boolean;
};

export const THEMES: Record<ThemeId, Theme> = {
  "giay-ky-thuat": {
    id: "giay-ky-thuat",
    name: "Giấy kỹ thuật",
    description: "Nền giấy kẻ lưới 48 px, mực xanh đậm, nhấn xanh lá. Rõ ràng, kỹ thuật.",
    dark: false,
    colors: {
      bg: "#F3F6F9", bg2: "#EAF0F5", bg3: "#FFFFFF", grid: "#E1E8EF",
      ink: "#0F2B46", inkSoft: "#4B6278",
      accent: "#0E9F6E", alt: "#1E5A8C", money: "#B7791F", warn: "#DE7A2E",
      card: "#FFFFFF", cardBorder: "#C9D5E1", line: "#0F2B46", highlight: "#D3F2E6",
    },
    fonts: {
      display: { family: "Montserrat", pkg: "montserrat", weight: 800 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 3,
    radius: 14,
    card: "outline",
    ground: "grid",
    motion: { enterEase: "expo.out", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.9, slowEnterEase: "power2.out", slowEnterDur: 1.1, rise: 28 },
    kickerUpper: true,
  },
  "toi-dien-anh": {
    id: "toi-dien-anh",
    name: "Tối điện ảnh",
    description: "Nền xuyên tâm xanh đêm có vignette, thẻ phát sáng nhẹ, màu theo vai trò.",
    dark: true,
    colors: {
      bg: "#12304A", bg2: "#0A1A2B", bg3: "#071320", grid: "#16354F",
      ink: "#EAF4FB", inkSoft: "#9DB4C7",
      accent: "#2DD4BF", alt: "#7DD3FC", money: "#F59E0B", warn: "#F25F5C",
      card: "#0F2539", cardBorder: "#23476A", line: "#7DD3FC", highlight: "rgba(45,212,191,0.18)",
    },
    fonts: {
      display: { family: "Be Vietnam Pro", pkg: "be-vietnam-pro", weight: 700 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 3,
    radius: 18,
    card: "glow",
    ground: "radial",
    motion: { enterEase: "power4.out", enterDur: 0.8, moveEase: "power2.inOut", moveDur: 1.0, slowEnterEase: "sine.inOut", slowEnterDur: 1.2, rise: 24 },
    kickerUpper: true,
  },
  "phang-tuoi-sang": {
    id: "phang-tuoi-sang",
    name: "Minh họa phẳng tươi sáng",
    description: "Nền kem, khối bo tròn, nhãn dạng viên thuốc, bóng đổ đặc.",
    dark: false,
    colors: {
      bg: "#FFF4E4", bg2: "#FFE9CC", bg3: "#FFFFFF", grid: "#F6E2C4",
      ink: "#2B2340", inkSoft: "#6B5F7E",
      accent: "#2A9D8F", alt: "#3D5A98", money: "#E9A23B", warn: "#E76F51",
      card: "#FFFFFF", cardBorder: "#2B2340", line: "#2B2340", highlight: "#FFD98A",
    },
    fonts: {
      display: { family: "Nunito", pkg: "nunito", weight: 800 },
      body: { family: "Nunito", pkg: "nunito", weight: 600 },
      bodyBold: { family: "Nunito", pkg: "nunito", weight: 800 },
    },
    stroke: 4,
    radius: 28,
    card: "solid-shadow",
    ground: "cream",
    motion: { enterEase: "back.out(1.4)", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 1.0, rise: 36 },
    kickerUpper: false,
  },
  "bien-tap-tap-chi": {
    id: "bien-tap-tap-chi",
    name: "Biên tập tạp chí",
    description: "Nền giấy, chữ có chân lớn, nét đen, một màu đỏ nhấn, kẻ đường mảnh.",
    dark: false,
    colors: {
      bg: "#F6F3EC", bg2: "#EFEADF", bg3: "#FFFFFF", grid: "#E4DDCD",
      ink: "#141414", inkSoft: "#5A554C",
      accent: "#C8102E", alt: "#141414", money: "#141414", warn: "#C8102E",
      card: "#F6F3EC", cardBorder: "#141414", line: "#141414", highlight: "rgba(200,16,46,0.10)",
    },
    fonts: {
      display: { family: "Lora", pkg: "lora", weight: 700 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 2,
    radius: 0,
    card: "rule",
    ground: "paper",
    motion: { enterEase: "power4.out", enterDur: 0.8, moveEase: "power2.inOut", moveDur: 1.0, slowEnterEase: "sine.inOut", slowEnterDur: 1.3, rise: 18 },
    kickerUpper: true,
  },
  "bang-trang": {
    id: "bang-trang",
    name: "Bảng trắng vẽ tay",
    description: "Nét bút dạ hơi rung, gạch chân đỏ, tô dạ quang vàng.",
    dark: false,
    colors: {
      bg: "#FBFBF8", bg2: "#F1F1EC", bg3: "#FFFFFF", grid: "#ECECE6",
      ink: "#1F2A36", inkSoft: "#55606B",
      accent: "#1565C0", alt: "#2E7D32", money: "#2E7D32", warn: "#D32F2F",
      card: "#FFFFFF", cardBorder: "#1F2A36", line: "#1F2A36", highlight: "#FFF176",
    },
    fonts: {
      display: { family: "Patrick Hand", pkg: "patrick-hand", weight: 400 },
      body: { family: "Patrick Hand", pkg: "patrick-hand", weight: 400 },
      bodyBold: { family: "Patrick Hand", pkg: "patrick-hand", weight: 400 },
    },
    stroke: 4,
    radius: 10,
    card: "sketch",
    ground: "whiteboard",
    motion: { enterEase: "power3.out", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.9, slowEnterEase: "power2.out", slowEnterDur: 1.1, rise: 20 },
    kickerUpper: false,
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function getTheme(id: string): Theme {
  return THEMES[id as ThemeId] ?? THEMES["giay-ky-thuat"];
}

export type Tone = "accent" | "alt" | "money" | "warn" | "neutral";

export function toneColor(theme: Theme, tone: Tone | undefined): string {
  switch (tone) {
    case "alt":
      return theme.colors.alt;
    case "money":
      return theme.colors.money;
    case "warn":
      return theme.colors.warn;
    case "neutral":
      return theme.colors.inkSoft;
    default:
      return theme.colors.accent;
  }
}
