// Token theme dùng chung (mục 6.3). Template chỉ dùng token → đổi phong cách không cần sửa cảnh.

export type ThemeId = "giay-ky-thuat" | "toi-dien-anh" | "phang-tuoi-sang" | "bien-tap-tap-chi" | "bang-trang" | "doanh-nghiep-xanh" | "ban-thiet-ke" | "toi-gian-thuy-si" | "rung-dem" | "pastel-hoc-duong";

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
  ground: "grid" | "radial" | "cream" | "paper" | "whiteboard" | "plain" | "blueprint" | "forest" | "pastel";
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
  "doanh-nghiep-xanh": {
    id: "doanh-nghiep-xanh",
    name: "Doanh nghiệp xanh",
    description: "Nền trắng sạch, dải màu xanh thương hiệu, thẻ bo nhẹ có bóng mềm. Trang trọng, hợp đào tạo nội bộ.",
    dark: false,
    colors: {
      bg: "#FFFFFF", bg2: "#EEF6F2", bg3: "#FFFFFF", grid: "#E3ECE8",
      ink: "#12324A", inkSoft: "#53687A",
      accent: "#008A5E", alt: "#0B5FA5", money: "#B7791F", warn: "#D9622B",
      card: "#FFFFFF", cardBorder: "#D5E2DC", line: "#12324A", highlight: "#DDF3EA",
    },
    fonts: {
      display: { family: "Be Vietnam Pro", pkg: "be-vietnam-pro", weight: 700 },
      body: { family: "Be Vietnam Pro", pkg: "be-vietnam-pro", weight: 400 },
      bodyBold: { family: "Be Vietnam Pro", pkg: "be-vietnam-pro", weight: 700 },
    },
    stroke: 2,
    radius: 16,
    card: "outline",
    ground: "plain",
    motion: { enterEase: "power4.out", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.9, slowEnterEase: "power2.out", slowEnterDur: 1.1, rise: 24 },
    kickerUpper: true,
  },
  "ban-thiet-ke": {
    id: "ban-thiet-ke",
    name: "Bản thiết kế",
    description: "Nền xanh bản vẽ kỹ thuật, lưới trắng mờ, nét mảnh màu trắng – vàng. Hợp quy trình, sơ đồ.",
    dark: true,
    colors: {
      bg: "#0E3B6E", bg2: "#0B3260", bg3: "#082850", grid: "rgba(255,255,255,0.10)",
      ink: "#F2F7FF", inkSoft: "#B8CCE6",
      accent: "#FFD166", alt: "#8FD3FF", money: "#FFD166", warn: "#FF8A65",
      card: "rgba(8,40,80,0.55)", cardBorder: "rgba(242,247,255,0.55)", line: "#F2F7FF", highlight: "rgba(255,209,102,0.18)",
    },
    fonts: {
      display: { family: "Montserrat", pkg: "montserrat", weight: 700 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 2,
    radius: 4,
    card: "outline",
    ground: "blueprint",
    motion: { enterEase: "expo.out", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.9, slowEnterEase: "power2.out", slowEnterDur: 1.1, rise: 20 },
    kickerUpper: true,
  },
  "toi-gian-thuy-si": {
    id: "toi-gian-thuy-si",
    name: "Tối giản Thụy Sĩ",
    description: "Trắng – đen, chữ rất lớn, một màu đỏ nhấn, kẻ đường đậm. Nghiêm túc, dễ đọc.",
    dark: false,
    colors: {
      bg: "#FAFAFA", bg2: "#F0F0F0", bg3: "#FFFFFF", grid: "#E6E6E6",
      ink: "#111111", inkSoft: "#555555",
      accent: "#E30613", alt: "#111111", money: "#111111", warn: "#E30613",
      card: "#FAFAFA", cardBorder: "#111111", line: "#111111", highlight: "rgba(227,6,19,0.10)",
    },
    fonts: {
      display: { family: "Inter", pkg: "inter", weight: 800 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 4,
    radius: 0,
    card: "rule",
    ground: "plain",
    motion: { enterEase: "power4.out", enterDur: 0.6, moveEase: "power2.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 1.0, rise: 16 },
    kickerUpper: true,
  },
  "rung-dem": {
    id: "rung-dem",
    name: "Rừng đêm",
    description: "Nền xanh rừng sâu, chữ kem ấm, nhấn xanh lá non và vàng nắng. Hợp chủ đề môi trường, khí hậu.",
    dark: true,
    colors: {
      bg: "#163A2C", bg2: "#0F2B20", bg3: "#0A1F17", grid: "#1E4A39",
      ink: "#F4EFE1", inkSoft: "#BFC9B8",
      accent: "#9BE15D", alt: "#7CC6D6", money: "#F2C14E", warn: "#F2795C",
      card: "#123326", cardBorder: "#2C5E49", line: "#F4EFE1", highlight: "rgba(155,225,93,0.16)",
    },
    fonts: {
      display: { family: "Lora", pkg: "lora", weight: 700 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 3,
    radius: 18,
    card: "glow",
    ground: "forest",
    motion: { enterEase: "power4.out", enterDur: 0.8, moveEase: "power2.inOut", moveDur: 1.0, slowEnterEase: "sine.inOut", slowEnterDur: 1.2, rise: 24 },
    kickerUpper: true,
  },
  "pastel-hoc-duong": {
    id: "pastel-hoc-duong",
    name: "Pastel học đường",
    description: "Màu pastel tím – bạc hà nhẹ nhàng, khối bo tròn lớn, chữ tròn thân thiện. Hợp người học mới.",
    dark: false,
    colors: {
      bg: "#F6F2FF", bg2: "#E9E1FF", bg3: "#FFFFFF", grid: "#ECE6FA",
      ink: "#2E2A4F", inkSoft: "#6A6590",
      accent: "#6C5CE7", alt: "#16A39A", money: "#E6A23C", warn: "#E86A6A",
      card: "#FFFFFF", cardBorder: "#DCD3FA", line: "#2E2A4F", highlight: "#D9F5EF",
    },
    fonts: {
      display: { family: "Nunito", pkg: "nunito", weight: 800 },
      body: { family: "Nunito", pkg: "nunito", weight: 600 },
      bodyBold: { family: "Nunito", pkg: "nunito", weight: 800 },
    },
    stroke: 3,
    radius: 32,
    card: "outline",
    ground: "pastel",
    motion: { enterEase: "back.out(1.3)", enterDur: 0.7, moveEase: "power2.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 1.0, rise: 30 },
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
