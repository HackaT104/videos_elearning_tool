// Bộ sưu tập template: mỗi template một cảnh (tham số mẫu) × 5 theme → ảnh khung cuối cảnh + ảnh ghép.
// Dùng cho màn hình "Chọn phong cách" và để soát hình template.
//   pnpm tsx scripts/gallery.ts [thư mục ra] [template1,template2]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { computeTiming, makeSentences, createNormalizer, type Video, type StyleId } from "@cvs/core";
import { TEMPLATES, qaTimes } from "@cvs/engine";
import { contactSheet, hfBuild, hfPreview, launchBrowser } from "@cvs/engine-hf";
import { THEME_IDS } from "@cvs/themes";


const SAMPLE_VO: Record<string, string> = {
  "title-card": "Chào mừng bạn đến với bài học về tín chỉ carbon. Một tín chỉ tương ứng với một tấn CO₂e.",
  "split-compare": "Thẩm định diễn ra trước khi dự án đăng ký. Thẩm tra diễn ra định kỳ sau mỗi kỳ giám sát.",
  "stat-hero": "Thỏa thuận Paris đặt mục tiêu giới hạn mức tăng nhiệt độ ở 1,5°C. Đây là ngưỡng quan trọng.",
  "icon-grid": "Có ba bên chính. Chủ dự án, tổ chức VVB, và Verra.",
  "flow-chain": "Dự án được thiết kế. Sau đó được thẩm định. Cuối cùng được đăng ký.",
  "bar-compare": "Năm 2021 đạt 300 triệu. Năm 2022 giảm còn 250 triệu.",
  "process-steps": "Đầu tiên là giám sát. Tiếp theo VVB thẩm tra. Cuối cùng Verra cấp VCU.",
  "timeline-run": "Năm 1997 có Nghị định thư Kyoto. Năm 2015 có Thỏa thuận Paris.",
  "document-transform": "Chủ dự án nộp báo cáo giám sát. VVB thực hiện thẩm tra. Kết quả là chứng nhận tín chỉ.",
  "cause-effect": "Doanh nghiệp muốn bù trừ phát thải. Họ chi trả cho dự án. Dự án trồng rừng nhận nguồn tài chính.",
  checklist: "Tín chỉ phải có tính bổ sung. Không được đếm trùng. Và phải bền vững lâu dài.",
  "quote-banner": "Hãy ghi nhớ. Mỗi tín chỉ phải đại diện cho một tấn giảm phát thải thực sự.",
  draft: "Đây là cảnh nháp. Lời thoại hiện theo mốc câu.",
  "myth-fact": "Nhiều người nghĩ tín chỉ carbon chỉ là giấy phép được xả thải. Thực tế, mỗi tín chỉ là một tấn CO₂e đã được giảm và thẩm tra độc lập.",
  "term-define": "Thẩm tra là gì? Thẩm tra là việc tổ chức độc lập xác nhận lượng giảm phát thải đã thực sự xảy ra. Đừng nhầm với thẩm định, diễn ra trước khi dự án đăng ký.",
  "kinetic-statement": "Hãy nhớ điều quan trọng nhất. An toàn luôn đi trước năng suất.",
  "module-divider": "Chúng ta chuyển sang học phần hai. Trong học phần này bạn sẽ nắm được quy trình thẩm định và thẩm tra.",
  "hub-spoke": "An toàn lao động dựa trên bốn hoạt động cốt lõi. Trước hết là nhận diện mối nguy và đánh giá rủi ro. Tiếp theo là thiết lập biện pháp kiểm soát. Cuối cùng là đào tạo người lao động.",
  "cycle-loop": "Chu trình PDCA giúp tổ chức cải tiến liên tục. Hoạch định: đặt mục tiêu và lập kế hoạch. Thực hiện: triển khai theo kế hoạch đã đề ra. Kiểm tra: đo lường và đánh giá kết quả. Hành động: điều chỉnh để cải tiến, rồi vòng lặp bắt đầu lại.",
  "decision-tree": "Để xác định điểm kiểm soát tới hạn, ta trả lời từng câu hỏi. Nếu không có biện pháp kiểm soát, công đoạn này không phải CCP. Nếu có, ta hỏi tiếp: công đoạn có loại bỏ hoặc giảm mối nguy không? Nếu có, đó là điểm kiểm soát tới hạn. Nếu không, hãy xem xét công đoạn tiếp theo.",
  "quiz-check": "Câu hỏi nhanh: theo ISO 45001, biện pháp kiểm soát nào được ưu tiên cao nhất? Hãy chọn một trong bốn phương án. Đáp án đúng là loại bỏ mối nguy. Theo thứ bậc kiểm soát, loại bỏ mối nguy luôn được ưu tiên trước, còn bảo hộ cá nhân là lựa chọn cuối cùng.",
  "donut-share": "Trong tổng phát thải của nhà máy, điện năng chiếm phần lớn nhất. Nhiên liệu và vận chuyển chiếm phần còn lại. Vì vậy tiết kiệm điện là ưu tiên số một.",
  "trend-line": "Phát thải của doanh nghiệp tăng đều từ năm 2019. Năm 2022 đạt đỉnh. Sau khi áp dụng ISO 14001, phát thải giảm rõ rệt.",
  "rank-reorder": "Năm 2023, điện năng là nguồn phát thải lớn nhất. Sang năm 2024, thứ hạng đã thay đổi. Vận chuyển vươn lên dẫn đầu sau khi nhà máy lắp điện mặt trời.",
  "ui-walkthrough": "Mở phần mềm quản lý tài liệu. Chọn mục Hồ sơ đánh giá ở menu bên trái. Nhập tên cơ sở cần đánh giá. Bấm nút Lưu để hoàn tất.",
};

export function galleryVideo(style: StyleId, templates = Object.keys(TEMPLATES), level = "L1"): Video {
  const norm = createNormalizer();
  return {
    key: `GALLERY-${style}`,
    course: "CVS",
    level,
    module: "MO0",
    unit: "U0",
    seq: "1",
    title: "Bộ sưu tập template",
    style,
    engine: "hyperframes",
    voice: { provider: "cit", voiceId: "Hải Đăng", speed: 1 },
    pace: { lead: 0.5, gap: 0.4, tail: 0.6 },
    scenes: templates.map((t, i) => {
      const def = TEMPLATES[t];
      return {
        id: `s${i + 1}`,
        scriptStart: i * 10,
        scriptEnd: i * 10 + 10,
        title: def.label,
        visual: def.when,
        // để kiểm tra "assumptions": coi chữ mẫu là chữ trên màn hình của kịch bản
        onscreen: [JSON.stringify(def.example)],
        sentences: makeSentences(SAMPLE_VO[t] ?? "Câu mẫu một. Câu mẫu hai.", norm),
        design: { template: t, params: def.example as Record<string, unknown>, by: "user" as const },
      };
    }),
  };
}

async function main() {
  const out = process.argv[2] ?? join(import.meta.dirname, "..", "tests", ".out", "gallery");
  const only = process.argv[3] ? process.argv[3].split(",") : undefined;
  const browser = await launchBrowser();
  const sheets: string[] = [];
  for (const style of THEME_IDS) {
    const v = galleryVideo(style, only);
    const timing = computeTiming(v);
    const work = join(out, style);
    mkdirSync(work, { recursive: true });
    const b = await hfBuild({ video: v, timing, manifest: null, voDir: join(work, "vo"), workDir: join(work, "hf") });
    if (b.warnings.length) console.log(style, "warnings:", b.warnings);
    const times = qaTimes(timing).filter((x) => x.label.endsWith("cuối cảnh"));
    const p = await hfPreview(join(work, "hf"), times, join(work, "frames"), { browser });
    if (p.errors.length) console.log(style, "errors:", p.errors);
    for (const l of p.layout) console.log(style, "layout:", l.scene, l.kind, l.id, l.detail);
    const sheet = join(out, `sheet-${style}.png`);
    await contactSheet(p.frames.map((f) => ({ file: f.file, label: `${f.scene} ${v.scenes.find((s) => s.id === f.scene)?.design?.template}` })), sheet, browser);
    sheets.push(sheet);
    console.log("✓", style, sheet);
  }
  await browser.close();
}

if (process.argv[1]?.endsWith("gallery.ts")) await main();
