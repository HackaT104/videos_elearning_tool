// Thư viện biểu tượng mở Lucide (lucide-static, giấy phép ISC — xem packages/engine/ICONS_LICENSE.md).
// Đọc icon-nodes.json của gói lúc chạy (engine chạy trong Node khi dựng cảnh) → markup nét 24×24 nội tuyến.
// Không ghi stroke/fill trên từng phần tử: CSS theme (.icon svg *) tự đặt currentColor + độ dày nét + vector-effect.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

type IconNode = [string, Record<string, string | number>][];

/** Tiền tố tuỳ chọn để ép dùng icon Lucide khi trùng tên icon vẽ tay (vd "lucide:leaf"). */
export const LIB_PREFIX = "lucide:";

const ALLOWED_TAGS = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
const ALLOWED_ATTRS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points"]);

let nodes: Record<string, IconNode> | null | undefined;
const cache = new Map<string, string>();

function load(): Record<string, IconNode> | null {
  if (nodes !== undefined) return nodes;
  try {
    const req = createRequire(import.meta.url);
    nodes = JSON.parse(readFileSync(req.resolve("lucide-static/icon-nodes.json"), "utf8")) as Record<string, IconNode>;
  } catch (e) {
    nodes = null; // thiếu gói → chỉ còn icon vẽ tay (ICON_NAMES tự bỏ tên Lucide)
    console.warn(
      `[icons] Không tải được lucide-static (${(e as Error).message.split("\n")[0]}) — chỉ dùng icon vẽ tay. Chạy "pnpm install" để cài thư viện biểu tượng.`,
    );
  }
  return nodes;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const strip = (name: string) => (name.startsWith(LIB_PREFIX) ? name.slice(LIB_PREFIX.length) : name);

/** Markup bên trong <svg> của icon Lucide (chỉ hình học, đã lọc thẻ/thuộc tính), hoặc undefined nếu không có. */
export function libIconBody(name: string): string | undefined {
  const key = strip(name);
  if (cache.has(key)) return cache.get(key);
  const lib = load();
  if (!lib || !Object.prototype.hasOwnProperty.call(lib, key)) return undefined;
  const body = lib[key]
    .filter(([tag]) => ALLOWED_TAGS.has(tag))
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => ALLOWED_ATTRS.has(k))
        .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
        .join("");
      return `<${tag}${a}/>`;
    })
    .join("");
  if (!body) return undefined;
  cache.set(key, body);
  return body;
}

export function libIconExists(name: string): boolean {
  return libIconBody(name) !== undefined;
}

/** Tất cả tên icon Lucide có trong gói (không đưa vào prompt — quá dài). */
export function libIconNames(): string[] {
  return Object.keys(load() ?? {});
}

/**
 * Danh sách Lucide chọn lọc cho e-learning doanh nghiệp (ISO 9001/14001/45001/27001, tín chỉ carbon, HACCP,
 * an toàn lao động, đánh giá, năng lượng, xây dựng…). Không trùng tên icon vẽ tay (icon vẽ tay được ưu tiên).
 */
export const CURATED_LIB_ICONS: readonly string[] = [
  // An toàn lao động & sức khỏe (ISO 45001)
  "hard-hat", "shield-check", "shield-alert", "shield-plus", "shield-x", "shield-ban", "shield-half", "triangle-alert", "octagon-alert",
  "circle-alert", "siren", "fire-extinguisher", "flame", "heart-pulse", "stethoscope", "syringe", "pill", "hospital", "ambulance",
  "bandage", "activity", "brain", "ear", "hand", "glasses", "footprints", "skull", "biohazard", "radiation", "cigarette-off",
  "person-standing", "accessibility", "hand-helping", "heart-handshake", "cone", "construction", "traffic-cone", "cctv", "volume-2", "volume-x",
  // Xây dựng & sản xuất
  "shovel", "hammer", "wrench", "drill", "pickaxe", "ruler", "pencil-ruler", "drafting-compass", "axe", "paint-roller", "forklift",
  "container", "package", "package-check", "package-x", "boxes", "warehouse", "building-2", "house", "fence", "door-open", "cog", "settings",
  // Chất lượng, đánh giá, chứng nhận (ISO 9001, audit)
  "award", "medal", "trophy", "badge-check", "badge-alert", "clipboard-check", "clipboard-list", "clipboard-x", "clipboard-pen",
  "file-check", "file-text", "file-search", "file-warning", "file-x", "file-lock", "file-pen-line", "file-badge", "files", "folder",
  "folder-check", "folder-open", "archive", "list-checks", "list-todo", "list-ordered", "square-check-big", "circle-check-big", "circle-x",
  "circle-help", "info", "scan-search", "search-check", "zoom-in", "microscope", "test-tube", "flask-conical", "beaker", "atom", "dna",
  "gauge", "circle-gauge", "sliders-horizontal", "filter", "star", "thumbs-up", "thumbs-down", "smile", "frown",
  // Quy trình & quản lý
  "workflow", "network", "git-branch", "git-fork", "route", "repeat", "refresh-cw", "rotate-ccw", "iteration-cw", "infinity",
  "arrow-right-left", "split", "merge", "layers", "layout-grid", "kanban", "milestone", "flag-triangle-right", "goal", "crosshair", "focus",
  "puzzle", "blocks", "component", "table", "chart-gantt", "calendar-check", "calendar-clock", "calendar-range", "hourglass", "timer",
  "alarm-clock", "history", "rocket", "sparkles", "lightbulb",
  // Tài chính & kinh doanh
  "receipt", "wallet", "credit-card", "banknote", "piggy-bank", "landmark", "hand-coins", "coins", "badge-dollar-sign", "badge-percent",
  "percent", "calculator", "chart-line", "chart-bar", "chart-pie", "chart-column", "chart-area", "chart-candlestick", "trending-up",
  "trending-down", "presentation", "briefcase", "briefcase-business", "store", "shopping-cart", "shopping-bag", "tag", "vault",
  // Con người & giao tiếp
  "users", "user", "user-check", "user-plus", "user-cog", "user-search", "user-x", "users-round", "contact", "id-card", "baby",
  "message-square", "message-circle", "messages-square", "message-square-warning", "megaphone", "mail", "phone", "send", "bell",
  "bell-ring", "vote",
  // Pháp lý
  "gavel", "scroll", "scroll-text", "book-marked", "ban",
  // CNTT & an toàn thông tin (ISO 27001)
  "cpu", "server", "database", "hard-drive", "cloud-upload", "cloud-download", "cloud-cog", "monitor", "laptop", "smartphone", "wifi",
  "globe-lock", "lock-keyhole", "key-round", "fingerprint", "scan-face", "bug", "code", "terminal", "binary", "qr-code", "barcode",
  "router", "satellite", "bot", "keyboard", "mouse-pointer-click",
  // Năng lượng
  "plug", "plug-zap", "power", "battery-charging", "battery-low", "zap", "wind", "fuel", "lamp", "lightbulb-off", "thermometer-sun",
  "thermometer-snowflake", "snowflake", "sun-snow", "cloud-sun",
  // Môi trường & khí hậu (ISO 14001, carbon)
  "droplet", "droplets", "waves", "cloud-rain", "cloud-lightning", "cloud-fog", "tornado", "earth", "mountain", "trees", "tree-pine",
  "tree-deciduous", "sprout", "flower", "bird", "fish", "paw-print", "rabbit", "trash-2",
  // Thực phẩm (HACCP)
  "wheat", "apple", "carrot", "beef", "egg", "milk", "utensils", "utensils-crossed", "chef-hat", "cooking-pot", "refrigerator", "soup",
  "coffee", "wheat-off",
  // Giao thông & logistics
  "car", "car-front", "bus", "train-front", "bike", "anchor", "plane-takeoff", "map-pin", "navigation", "compass", "signpost",
  // Đào tạo
  "graduation-cap", "school", "book", "book-open", "book-open-check", "notebook-pen", "library", "pencil", "pen-line", "highlighter",
];
