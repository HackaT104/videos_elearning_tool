// Token theme dùng chung (mục 6.3). Template chỉ dùng token → đổi phong cách không cần sửa cảnh.

import { getFontPair } from "./fontpairs";

export type ThemeId =
  | "giay-ky-thuat"
  | "toi-dien-anh"
  | "phang-tuoi-sang"
  | "bien-tap-tap-chi"
  | "bang-trang"
  | "doanh-nghiep-xanh"
  | "ban-thiet-ke"
  | "toi-gian-thuy-si"
  | "rung-dem"
  | "pastel-hoc-duong"
  | "canh-bao-an-toan"
  | "riso-coban"
  | "ky-thuat-so-toi"
  | "am-moc"
  | "khoi-mau-tap-chi"
  | "danh-muc-tinh";

export type FontRef = { family: string; pkg: string; weight: number; /** Họ dự phòng chung; mặc định sans-serif. */ generic?: "sans-serif" | "serif" | "cursive" | "monospace"; /** Phần dấu chồng tầng (Ấ, Ữ…) vượt trên hộp dòng, theo em; mặc định 0,12 (xem viPad). */ viPadEm?: number };

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
  card: "outline" | "glow" | "solid-shadow" | "rule" | "sketch" | "bar" | "riso" | "tech" | "block";
  /** Kiểu nền. */
  ground: "grid" | "radial" | "cream" | "paper" | "whiteboard" | "plain" | "blueprint" | "forest" | "pastel" | "hazard" | "riso" | "dots" | "grain" | "blocks" | "atlas";
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
    /** Máy quay đẩy chậm cả cảnh theo tỉ lệ 1 + camera: scale 1/(1+camera) → 1 (mặc định 0,015; 0 = tắt). */
    camera?: number;
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
      accent: "#008259", alt: "#0B5FA5", money: "#B7791F", warn: "#D9622B",
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
    motion: { enterEase: "power4.out", enterDur: 0.6, moveEase: "power2.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 1.0, rise: 16, camera: 0 },
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
      accent: "#6556E3", alt: "#16A39A", money: "#E6A23C", warn: "#E86A6A",
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
  // 6 phong cách dưới phỏng theo bộ khung hình mẫu HeyGen HyperFrames (Apache-2.0) – chỉ lấy ý tưởng bảng màu/nền, không chép nhận diện.
  "canh-bao-an-toan": {
    id: "canh-bao-an-toan",
    name: "Cảnh báo an toàn",
    description: "Nền đen mực, mảng cam lửa, dải sọc cảnh báo chéo, chữ kem. Mạnh, rõ – hợp an toàn – sức khỏe – môi trường (HSE).",
    dark: true,
    colors: {
      bg: "#111111", bg2: "#1C1C1C", bg3: "#0A0A0A", grid: "#2A2A2A",
      ink: "#F0ECE5", inkSoft: "#B8B1A6",
      accent: "#E85D26", alt: "#5AB4F0", money: "#F5C518", warn: "#FF5A4F",
      card: "#1C1C1C", cardBorder: "#3A3631", line: "#F0ECE5", highlight: "rgba(232,93,38,0.24)",
    },
    fonts: {
      // Ẳ cao 1,257 em – vượt hộp dòng (line-height 1,2) ~0,21 em
      display: { family: "Oswald", pkg: "oswald", weight: 700, viPadEm: 0.22 },
      body: { family: "Fira Sans", pkg: "fira-sans", weight: 400 },
      bodyBold: { family: "Fira Sans", pkg: "fira-sans", weight: 600 },
    },
    stroke: 3,
    radius: 4,
    card: "bar",
    ground: "hazard",
    motion: { enterEase: "power3.out", enterDur: 0.55, moveEase: "power2.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 0.95, rise: 30 },
    kickerUpper: true,
  },
  "riso-coban": {
    id: "riso-coban",
    name: "Mực coban",
    description: "Giấy in riso, một màu mực coban trên lưới kẻ ô, hạt in nhẹ; đỏ cam chỉ cho rủi ro. Mộc, học thuật.",
    dark: false,
    colors: {
      bg: "#F0EBDE", bg2: "#E6E0CF", bg3: "#FAF7EF", grid: "#D7D4DE",
      ink: "#161E9E", inkSoft: "#4A51B0",
      accent: "#1F2BE0", alt: "#3D46C9", money: "#161E9E", warn: "#C2361A",
      card: "#F8F5EC", cardBorder: "#1F2BE0", line: "#161E9E", highlight: "rgba(31,43,224,0.14)",
    },
    fonts: {
      display: { family: "Merriweather", pkg: "merriweather", weight: 700, generic: "serif" },
      body: { family: "Source Sans 3", pkg: "source-sans-3", weight: 400 },
      bodyBold: { family: "Source Sans 3", pkg: "source-sans-3", weight: 600 },
    },
    stroke: 3,
    radius: 6,
    card: "riso",
    ground: "riso",
    motion: { enterEase: "power3.out", enterDur: 0.65, moveEase: "power2.inOut", moveDur: 0.85, slowEnterEase: "power2.out", slowEnterDur: 1.05, rise: 22 },
    kickerUpper: true,
  },
  "ky-thuat-so-toi": {
    id: "ky-thuat-so-toi",
    name: "Kỹ thuật số tối",
    description: "Nền gần đen có lưới chấm mờ dần ra mép, chữ trắng ngà, nhấn xanh chanh và xanh lơ. Công nghệ, chuyển đổi số, an ninh thông tin.",
    dark: true,
    colors: {
      bg: "#0B0D10", bg2: "#14181E", bg3: "#07080A", grid: "#222831",
      ink: "#EDEFF2", inkSoft: "#9AA3AE",
      accent: "#B6F23A", alt: "#22D3EE", money: "#FBBF24", warn: "#FF6B6B",
      card: "#12161B", cardBorder: "#2A313A", line: "#EDEFF2", highlight: "rgba(182,242,58,0.16)",
    },
    fonts: {
      display: { family: "Space Grotesk", pkg: "space-grotesk", weight: 700 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 2,
    radius: 8,
    card: "tech",
    ground: "dots",
    motion: { enterEase: "expo.out", enterDur: 0.6, moveEase: "power3.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 1.0, rise: 20 },
    kickerUpper: true,
  },
  "am-moc": {
    id: "am-moc",
    name: "Ấm mộc",
    description: "Nền kem có hạt giấy, xanh rừng – đỏ gỉ – nâu gỗ, chữ chân vuông. Gần gũi, hợp kỹ năng mềm, nông nghiệp, môi trường.",
    dark: false,
    colors: {
      bg: "#F5F0E0", bg2: "#ECE4CE", bg3: "#FBF8EE", grid: "#E3DAC3",
      ink: "#2F2B24", inkSoft: "#6B5F50",
      accent: "#3B5E3A", alt: "#7A6248", money: "#8A6418", warn: "#A84A2E",
      // highlight = vàng đất (ochre) – chỉ làm nền tô, không làm màu chữ
      card: "#FBF8EE", cardBorder: "#D9CDB0", line: "#2F2B24", highlight: "#EBD49A",
    },
    fonts: {
      display: { family: "Roboto Slab", pkg: "roboto-slab", weight: 600, generic: "serif" },
      body: { family: "Mulish", pkg: "mulish", weight: 400 },
      bodyBold: { family: "Mulish", pkg: "mulish", weight: 700 },
    },
    stroke: 3,
    radius: 16,
    card: "outline",
    ground: "grain",
    motion: { enterEase: "power2.out", enterDur: 0.8, moveEase: "sine.inOut", moveDur: 1.0, slowEnterEase: "sine.out", slowEnterDur: 1.2, rise: 24 },
    kickerUpper: false,
  },
  "khoi-mau-tap-chi": {
    id: "khoi-mau-tap-chi",
    name: "Khối màu tạp chí",
    description: "Mảng san hô, mực đen và kem cắt cạnh sắc, chữ rất đậm, con số lớn. Hiện đại, gây chú ý – mở đầu, tóm tắt, số liệu.",
    dark: false,
    colors: {
      bg: "#F4EEE3", bg2: "#EAE2D3", bg3: "#FFFDF8", grid: "#E2D9C8",
      ink: "#1A1A1A", inkSoft: "#55504A",
      accent: "#B5373A", alt: "#2F5D8A", money: "#7E5F0E", warn: "#B5373A",
      // highlight = san hô gốc – chỉ làm mảng nền, chữ trên đó luôn là mực đen
      card: "#FFFDF8", cardBorder: "#1A1A1A", line: "#1A1A1A", highlight: "#E85D5D",
    },
    fonts: {
      display: { family: "Bricolage Grotesque", pkg: "bricolage-grotesque", weight: 800 },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 4,
    radius: 0,
    card: "block",
    ground: "blocks",
    motion: { enterEase: "power4.out", enterDur: 0.6, moveEase: "power3.inOut", moveDur: 0.8, slowEnterEase: "power2.out", slowEnterDur: 1.0, rise: 36 },
    kickerUpper: true,
  },
  "danh-muc-tinh": {
    id: "danh-muc-tinh",
    name: "Danh mục tĩnh",
    description: "Nền đá nhạt, lưới kẻ mảnh màu nâu xám, vòng la bàn trang trí, chữ có chân thanh lịch, chuyển động chậm. Trang trọng, chiến lược.",
    dark: false,
    colors: {
      bg: "#EDE8E0", bg2: "#E4DED3", bg3: "#F6F3EE", grid: "#D8D0C4",
      ink: "#2A2622", inkSoft: "#6E665E",
      accent: "#7B5E3B", alt: "#4F6470", money: "#77601C", warn: "#A0452E",
      card: "#F6F3EE", cardBorder: "#CFC6B8", line: "#2A2622", highlight: "rgba(123,94,59,0.12)",
    },
    fonts: {
      display: { family: "Playfair Display", pkg: "playfair-display", weight: 600, generic: "serif" },
      body: { family: "Inter", pkg: "inter", weight: 400 },
      bodyBold: { family: "Inter", pkg: "inter", weight: 600 },
    },
    stroke: 2,
    radius: 2,
    card: "outline",
    ground: "atlas",
    // chậm, êm: vào dài hơn, trượt ít, máy quay đẩy rất nhẹ
    motion: { enterEase: "power2.out", enterDur: 1.0, moveEase: "sine.inOut", moveDur: 1.3, slowEnterEase: "sine.out", slowEnterDur: 1.5, rise: 14, camera: 0.01 },
    kickerUpper: true,
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Theme theo id; nếu có `font` (mã cặp phông) thì thay phông của theme bằng cặp đó. */
export function getTheme(id: string, font?: string | null): Theme {
  const base = THEMES[id as ThemeId] ?? THEMES["giay-ky-thuat"];
  const pair = getFontPair(font);
  return pair ? { ...base, fonts: { display: pair.display, body: pair.body, bodyBold: pair.bodyBold } } : base;
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
