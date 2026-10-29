// Sinh file mẫu cho test & demo: fixtures/Kich_ban_L1.docx (2 video), fixtures/Outline_L2.docx, fixtures/Kich_ban_L2.xlsx
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "fixtures");
mkdirSync(OUT, { recursive: true });

const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) =>
  new Paragraph({ text, heading: level });
const bullet = (text: string, level = 0) => new Paragraph({ text, bullet: { level } });
const cell = (text: string) => new TableCell({ children: text.split("\n").map((t) => p(t)), width: { size: 25, type: WidthType.PERCENTAGE } });
const table = (rows: string[][]) => new Table({ rows: rows.map((r) => new TableRow({ children: r.map(cell) })) });

async function scriptDocx() {
  const doc = new Document({
    sections: [
      {
        children: [
          h("HỌC PHẦN 1 – TỔNG QUAN TÍN CHỈ CARBON", HeadingLevel.HEADING_1),
          p("Loại: Video"),
          p("Tên file: videos/MO1_U1.5_1.mp4"),
          p("SCRIPT VIDEO 1: Tín chỉ carbon là gì?", true),
          p('[0:00 - 0:20] Mở đầu: Bầu trời với các ống khói nhà máy, chữ xuất hiện. Text: "Tín chỉ carbon là gì?"'),
          p("Giọng đọc (Voice-over):"),
          p('"Chào mừng bạn đến với khóa học về tín chỉ carbon. Mỗi tín chỉ đại diện cho 1 tCO₂e được giảm hoặc loại bỏ khỏi khí quyển."'),
          p('[0:20 - 0:45] So sánh: Bên trái là nhà máy phát thải, bên phải là khu rừng hấp thụ. Text: "Phát thải" Text: "Hấp thụ"'),
          p('Giọng đọc (Voice-over): "Một bên là nguồn phát thải khí nhà kính. Bên còn lại là dự án giảm hoặc hấp thụ phát thải, ví dụ trồng rừng trên 20 ha đất."'),
          p('[0:45 - 1:05] Con số: Số lớn đếm lên. Text: "1 VCU = 1 tCO₂e"'),
          p('Giọng đọc (Voice-over): "Theo tiêu chuẩn VCS do Verra quản lý, mỗi VCU tương ứng với một tấn CO₂e. Từ ngày 01/01/2027, VCS Version 5.0A sẽ được áp dụng."'),
          p("Nguồn: Verra, VCS Standard v4.7 (2024)."),
          p("Bảng số liệu tham khảo:"),
          table([
            ["Chỉ tiêu", "Giá trị"],
            ["Nhiệt độ mục tiêu Thỏa thuận Paris", "1,5°C"],
            ["Năm ký Thỏa thuận Paris", "2015"],
          ]),

          p("Loại: Video"),
          p("Tên file: videos/MO2_U2.2_1.mp4"),
          p("SCRIPT VIDEO 2: Chu trình dự án VCS", true),
          table([
            ["Thời gian", "Hình ảnh", "Text", "Giọng đọc (Voice-over)"],
            [
              "[0:00 - 0:25] Các bước",
              "Chuỗi ô và mũi tên nối các bước của dự án.",
              "Thiết kế\nThẩm định\nĐăng ký",
              '"Một dự án VCS trải qua nhiều bước. Đầu tiên, chủ dự án viết tài liệu PD. Sau đó, tổ chức VVB thực hiện thẩm định."',
            ],
            [
              "[0:25 - 0:50] Thẩm tra",
              "Tài liệu giám sát biến thành chứng nhận tín chỉ.",
              "Giám sát → Thẩm tra → Cấp VCU",
              '"Sau khi dự án vận hành, kết quả giám sát được VVB thẩm tra. Cuối cùng, Verra cấp VCU cho lượng giảm phát thải đã được thẩm tra."',
            ],
          ]),
          p("Nguồn: Verra, VCS Program Guide v4.4."),
        ],
      },
    ],
  });
  writeFileSync(join(OUT, "Kich_ban_L1.docx"), await Packer.toBuffer(doc));
}

async function outlineDocx() {
  const doc = new Document({
    sections: [
      {
        children: [
          h("Thị trường carbon tự nguyện", HeadingLevel.HEADING_1),
          h("Mục tiêu học tập"),
          bullet("Phân biệt thị trường bắt buộc và tự nguyện"),
          bullet("Hiểu vai trò của tổ chức VVB"),
          h("1. Hai loại thị trường"),
          bullet("Thị trường bắt buộc: do luật định"),
          bullet("Thị trường tự nguyện: doanh nghiệp tự cam kết"),
          h("2. Các bên tham gia"),
          bullet("Chủ dự án"),
          bullet("Tổ chức thẩm định/thẩm tra (VVB)"),
          bullet("Cơ quan quản lý chương trình (Verra)"),
          p("Thời lượng mong muốn: khoảng 2 phút. Đối tượng: nhân viên mới."),
        ],
      },
    ],
  });
  writeFileSync(join(OUT, "Outline_L2.docx"), await Packer.toBuffer(doc));
}

async function scriptXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("MO2");
  ws.addRow(["Mã video", "Tiêu đề", "Cảnh", "Bắt đầu", "Kết thúc", "Mô tả hình", "Chữ trên màn hình", "Lời thoại", "Ghi chú"]);
  ws.addRow(["MO2_U2.2_1", "Thẩm định và thẩm tra", "Mở đầu", "0:00", "0:15", "Tiêu đề bài học", "Thẩm định & Thẩm tra", "Bài học này giải thích hai khái niệm thẩm định và thẩm tra.", ""]);
  ws.addRow(["", "", "So sánh", "0:15", "0:40", "Hai cột so sánh", "Thẩm định; Thẩm tra", "Thẩm định diễn ra trước khi dự án đăng ký. Thẩm tra diễn ra định kỳ, sau mỗi giai đoạn giám sát.", ""]);
  ws.addRow(["", "", "Kết", "0:40", "0:55", "Thông điệp cuối", "", "Cả hai đều do VVB độc lập thực hiện.", "Nguồn: Verra, VCS Standard v4.7"]);
  const ws2 = wb.addWorksheet("MO3");
  ws2.addRow(["Video", "Title", "Scene", "Start", "End", "Visual", "On-screen", "Voice", "Notes"]);
  ws2.addRow(["MO3_U3.1_1", "Rủi ro đảo ngược", "Mở đầu", 0, 20, "Khu rừng bị cháy", "Rủi ro đảo ngược", "Dự án AFOLU có thể gặp rủi ro đảo ngược, ví dụ cháy rừng.", ""]);
  await wb.xlsx.writeFile(join(OUT, "Kich_ban_L2.xlsx"));
}

await scriptDocx();
await outlineDocx();
await scriptXlsx();
console.log("Đã tạo fixtures trong", OUT);
