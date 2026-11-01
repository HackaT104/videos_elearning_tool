// Thư viện biểu tượng trung tính (nét 24×24, currentColor). Không vẽ logo/giao diện tổ chức thật.
// Icon vẽ tay bên dưới + thư viện mở Lucide (icon-lib.ts). Trùng tên → icon vẽ tay thắng; "lucide:<tên>" ép dùng Lucide.

import { CURATED_LIB_ICONS, libIconBody, libIconExists } from "./icon-lib";
export { CURATED_LIB_ICONS, LIB_PREFIX, libIconNames } from "./icon-lib";

export const ICONS: Record<string, string> = {
  leaf: `<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19c3-4 6-7 10-9"/>`,
  tree: `<path d="M12 21v-6"/><path d="M12 3l6 8h-3l4 5H5l4-5H6z"/>`,
  forest: `<path d="M7 20v-4M17 20v-5"/><path d="M7 4l4 6H9l3 5H2l3-5H3z"/><path d="M17 6l3.5 5H19l2.5 4h-9L15 11h-1.5z"/>`,
  factory: `<path d="M3 21V10l5 3V10l5 3V6h3v15z"/><path d="M16 21h5V4h-3v2"/><path d="M7 17h2M12 17h2"/>`,
  smoke: `<path d="M6 21V12h4v9"/><path d="M14 21v-6h4v6"/><path d="M8 9c-2-1-1-3 1-3 0-2 3-3 4-1 2-1 4 1 3 3"/>`,
  cloud: `<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>`,
  co2: `<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/><path d="M10 13.5a1.5 1.5 0 1 0 0 1M13.5 12.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`,
  thermometer: `<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>`,
  bolt: `<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>`,
  water: `<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>`,
  fire: `<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 3 2 5 5 5 8 1-1 1-2 1-3 2 2 2 4 2 5 0 3-2 6-6 6z"/>`,
  coin: `<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5"/>`,
  money: `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>`,
  invoice: `<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>`,
  certificate: `<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M7 8h10M7 11h6"/><circle cx="16" cy="17" r="2.5"/><path d="M14.8 19.2L14 22l2-1 2 1-.8-2.8"/>`,
  document: `<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 11h6M9 14h6M9 17h4"/>`,
  documents: `<path d="M8 3h7l4 4v12H8z"/><path d="M15 3v4h4"/><path d="M5 6v15h11"/>`,
  checklist: `<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>`,
  check: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>`,
  cross: `<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>`,
  magnifier: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M8 10.5l2 2 3.5-4"/>`,
  shield: `<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`,
  warning: `<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>`,
  scale: `<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>`,
  handshake: `<path d="M2 11l4-4 4 2 3-2 4 1 5 4"/><path d="M6 13l4 4c1 1 2 1 3 0l5-5"/><path d="M9 16l-2 2M12 18l-1.5 1.5"/>`,
  people: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 5"/>`,
  person: `<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>`,
  building: `<path d="M4 21V5l8-2v18M12 21h8V9l-8-2"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>`,
  bank: `<path d="M3 9l9-5 9 5z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>`,
  chart: `<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>`,
  trend: `<path d="M4 20V4M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/><path d="M16 8h3v3"/>`,
  down: `<path d="M4 20V4M4 20h16"/><path d="M7 8l4 4 3-3 5 6"/><path d="M16 15h3v-3"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>`,
  target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`,
  flag: `<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>`,
  truck: `<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>`,
  recycle: `<path d="M7 7l3-4 3 4M10 3v7"/><path d="M19 12l2 4.5-4.5 1M21 16.5l-6-3.5"/><path d="M5 19H3l2.5-4M3 19l6.5 1"/>`,
  link: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  key: `<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>`,
  eye: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  idea: `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>`,
  map: `<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>`,
  pin: `<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>`,
  arrow: `<path d="M4 12h15M14 6l6 6-6 6"/>`,
  stamp: `<path d="M9 3h6v5l-1 3h4v4H6v-4h4l-1-3z"/><path d="M5 19h14v2H5z"/>`,
  ledger: `<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 3v18"/><path d="M11 8h6M11 12h6M11 16h4"/>`,
  plane: `<path d="M2 13l20-8-6 15-4-6z"/><path d="M12 14l10-9"/>`,
  battery: `<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4"/><path d="M6 10v4M10 10v4"/>`,
  soil: `<path d="M2 15h20"/><path d="M4 19h4M10 19h5M17 19h3"/><path d="M12 15V8M12 11c-2 0-3.5-1.5-3.5-3.5C10.5 7.5 12 9 12 11zM12 9.5c2 0 3.5-1.5 3.5-3.5-2 0-3.5 1.5-3.5 3.5z"/>`,
  cow: `<path d="M5 9h12l3 3v4h-2v3h-2v-3H8v3H6v-3H4v-4z"/><path d="M5 9L3 7M17 9l2-2"/><circle cx="16.5" cy="12" r=".5"/>`,
  ship: `<path d="M3 16l2 4h14l2-4z"/><path d="M6 16V10h12v6M9 10V6h6v4"/>`,
};

/** Tên icon đưa vào prompt AI: icon vẽ tay + danh sách Lucide chọn lọc (iconExists nhận cả tên Lucide khác). */
export const ICON_NAMES: string[] = [...Object.keys(ICONS), ...CURATED_LIB_ICONS.filter((n) => !(n in ICONS) && libIconExists(n))];

const own = (name: string) => (Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : undefined);

function iconBody(name: string | undefined): string | undefined {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n.length > 64) return undefined;
  return own(n) ?? libIconBody(n);
}

/** true nếu tên là icon vẽ tay hoặc BẤT KỲ icon nào trong gói Lucide (có/không tiền tố "lucide:"). */
export function iconExists(name: string | undefined): boolean {
  return iconBody(name) !== undefined;
}

export function iconSvg(name: string | undefined, id?: string): string {
  const body = iconBody(name) ?? ICONS.idea;
  return `<svg viewBox="0 0 24 24"${id ? ` id="${id}"` : ""} fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Gợi ý biểu tượng theo từ khóa tiếng Việt. */
export function guessIcon(text: string): string {
  const t = text.normalize("NFC").toLowerCase(); // NFD tách dấu → ranh giới từ sai
  const rules: [RegExp, string][] = [
    // cụm từ cụ thể (đứng trước các từ chung như "an toàn", "điện", "nước", "đánh giá")
    [/an toàn thông tin|bảo mật|an ninh mạng|iso 27001|27001/, "lock-keyhole"],
    [/an toàn lao động|bảo hộ lao động|bảo hộ|ppe|iso 45001|45001|mũ bảo hộ/, "hard-hat"],
    [/an toàn thực phẩm|vệ sinh thực phẩm|haccp|iso 22000|thực phẩm/, "utensils"],
    [/điểm kiểm soát tới hạn|ccp|giới hạn tới hạn/, "crosshair"],
    [/chữa cháy|pccc|phòng cháy|bình chữa cháy/, "fire-extinguisher"],
    [/an toàn điện|điện giật/, "plug-zap"],
    [/khẩn cấp|ứng phó sự cố|sơ tán|thoát hiểm|báo động/, "siren"],
    [/đánh giá rủi ro|nhận diện mối nguy|mối nguy/, "shield-alert"],
    [/tai nạn|sự cố|thương tích/, "octagon-alert"],
    [/sơ cứu|y tế|sức khỏe|sức khoẻ|bệnh nghề nghiệp/, "heart-pulse"],
    [/hóa chất|hoá chất|phòng thí nghiệm|thử nghiệm|xét nghiệm|mẫu thử/, "flask-conical"],
    [/độc hại|sinh học nguy hại|nguy hại/, "biohazard"],
    [/tiếng ồn/, "volume-2"],
    [/đánh giá nội bộ|chuyên gia đánh giá|audit|đánh giá viên/, "clipboard-check"],
    [/sự không phù hợp|không phù hợp/, "circle-x"],
    [/hành động khắc phục|khắc phục|cải tiến liên tục|cải tiến|pdca/, "refresh-cw"],
    [/iso 9001|9001|chất lượng/, "badge-check"],
    [/iso 14001|14001|môi trường/, "leaf"],
    [/iso 50001|tiết kiệm năng lượng|hiệu suất năng lượng|hiệu quả năng lượng/, "gauge"],
    [/phát thải|khí thải|ống khói/, "smoke"],
    [/co₂|co2|carbon|các bon|khí nhà kính/, "co2"],
    [/điện mặt trời|mặt trời|năng lượng tái tạo/, "sun"],
    [/điện gió|gió/, "wind"],
    [/nhiên liệu|xăng|dầu/, "fuel"],
    [/nước thải/, "droplets"],
    [/chất thải|rác thải|rác/, "trash-2"],
    [/tái chế|tuần hoàn/, "recycle"],
    [/ô nhiễm|bụi/, "cloud-fog"],
    [/biến đổi khí hậu|khí hậu/, "earth"],
    [/đa dạng sinh học|sinh thái/, "bird"],
    [/bảo quản lạnh|đông lạnh|tủ lạnh|chuỗi lạnh/, "refrigerator"],
    [/rửa tay/, "hand"],
    [/nghị định|thông tư|pháp luật|pháp lý|xử phạt|tuân thủ/, "gavel"],
    [/lãnh đạo|ban giám đốc|quản lý cấp cao/, "briefcase"],
    [/hợp đồng|cam kết/, "file-pen-line"],
    [/giấy phép/, "file-badge"],
    [/mật khẩu/, "key-round"],
    [/tấn công mạng|mã độc|virus|lỗ hổng/, "bug"],
    [/dữ liệu|cơ sở dữ liệu|sao lưu/, "database"],
    [/máy tính|phần mềm|công nghệ thông tin|cntt|hệ thống thông tin/, "laptop"],
    [/đào tạo|khóa học|khoá học|học viên|giảng viên|học tập|năng lực/, "graduation-cap"],
    [/người lao động|nhân viên|nhân sự/, "users"],
    [/khách hàng/, "user-check"],
    [/xây dựng|công trường|thi công|giàn giáo/, "construction"],
    [/bảo trì|bảo dưỡng|sửa chữa/, "wrench"],
    [/hiệu chuẩn|đo lường/, "gauge"],
    [/truy xuất nguồn gốc|truy xuất/, "qr-code"],
    [/xe nâng/, "forklift"],
    [/vận chuyển|logistics|giao hàng|chuỗi cung ứng|nhà cung cấp/, "truck"],
    [/kho hàng|lưu kho|kho/, "warehouse"],
    [/hấp thụ|loại bỏ|lưu giữ|bể chứa/, "forest"],
    [/rừng|cây|trồng/, "tree"],
    [/nhà máy|công nghiệp|sản xuất/, "factory"],
    [/tín chỉ|chứng nhận|vcu|cấp/, "certificate"],
    [/đánh giá/, "clipboard-check"], // trước "giá" (tiền)
    [/tiền|giá|usd|đô la|chi phí|doanh thu/, "coin"],
    [/hóa đơn|thanh toán/, "invoice"],
    [/tài liệu|pd|hồ sơ|báo cáo/, "document"],
    [/thẩm tra|kiểm tra|giám sát/, "magnifier"],
    [/thẩm định/, "search"],
    [/rủi ro|cảnh báo|nguy cơ/, "warning"],
    [/đăng ký|sổ|registry/, "ledger"],
    [/người|cộng đồng|bên|chủ dự án/, "people"],
    [/thị trường|giao dịch|mua|bán/, "handshake"],
    [/thời gian|năm|hạn|giai đoạn/, "calendar"],
    [/năng lượng|điện/, "bolt"],
    [/nước/, "water"],
    [/cháy/, "fire"],
    [/đất|nông nghiệp/, "soil"],
    [/toàn cầu|thế giới|quốc tế|paris/, "globe"],
    [/nhiệt độ|nóng lên|°c/, "thermometer"],
    [/mục tiêu/, "target"],
    [/quy trình|bước/, "gear"],
    [/tiêu chuẩn|quy định|luật/, "scale"],
    [/bảo đảm|an toàn|bảo vệ/, "shield"],
    [/hàng không|máy bay|corsia/, "plane"],
    // từ chung (chỉ dùng khi không khớp quy tắc nào ở trên)
    [/câu hỏi|hỏi đáp|quiz|thắc mắc/, "circle-help"],
    [/lưu ý|ghi chú|thông tin/, "info"],
    [/giao tiếp|trao đổi|tham vấn|phản hồi/, "messages-square"],
    [/thông báo|truyền thông/, "megaphone"],
    [/cấm|nghiêm cấm/, "ban"],
    [/doanh nghiệp|công ty|tổ chức/, "building"],
    [/tài chính|ngân sách|đầu tư/, "wallet"],
    [/lợi nhuận|tăng trưởng|tăng/, "trending-up"],
    [/tỷ lệ|tỉ lệ|phần trăm/, "percent"],
    [/thống kê|số liệu/, "chart-bar"],
    [/máy móc|thiết bị/, "cog"],
    [/xe|ô tô|giao thông/, "car"],
    [/tàu|cảng|biển/, "ship"],
    [/lúa|gạo|nông sản/, "wheat"],
    [/thịt/, "beef"],
    [/sữa/, "milk"],
    [/nấu|bếp/, "chef-hat"],
    [/thành công|đạt|hoàn thành/, "trophy"],
    [/ý tưởng|sáng kiến/, "lightbulb"],
  ];
  // ranh giới từ hỗ trợ chữ có dấu ("giá" không khớp trong "giám")
  const hit = rules.find(([re]) => new RegExp(`(?<![\\p{L}])(?:${re.source})(?![\\p{L}])`, "u").test(t));
  return hit?.[1] ?? "idea";
}
