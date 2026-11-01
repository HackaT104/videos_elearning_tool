import { describe, expect, it } from "vitest";
import { checkTts, createNormalizer, findForeignWords, normalizeVi, readInteger } from "../src";

const n = (s: string) => normalizeVi(s);

describe("đọc số nguyên", () => {
  const cases: [number | string, string][] = [
    [0, "không"],
    [5, "năm"],
    [10, "mười"],
    [11, "mười một"],
    [14, "mười bốn"],
    [15, "mười lăm"],
    [20, "hai mươi"],
    [21, "hai mươi mốt"],
    [24, "hai mươi tư"],
    [25, "hai mươi lăm"],
    [100, "một trăm"],
    [105, "một trăm linh năm"],
    [110, "một trăm mười"],
    [1000, "một nghìn"],
    [1005, "một nghìn không trăm linh năm"],
    [1750, "một nghìn bảy trăm năm mươi"],
    [2027, "hai nghìn không trăm hai mươi bảy"],
    [800000, "tám trăm nghìn"],
    [1000050, "một triệu không trăm năm mươi"],
    [2500000000, "hai tỷ năm trăm triệu"],
    ["007", "bảy"],
  ];
  it.each(cases)("%s → %s", (input, want) => expect(readInteger(input)).toBe(want));
});

describe("chuẩn hóa cách đọc – ví dụ mục 4", () => {
  const cases: [string, string][] = [
    // Ký hiệu hóa học
    ["Giảm 1 tCO₂e.", "Giảm một tấn xê ô hai tương đương."],
    ["Giảm 1 tCO2e.", "Giảm một tấn xê ô hai tương đương."],
    ["Lượng CO₂e phát thải", "Lượng xê ô hai tương đương phát thải"],
    ["Khí CO₂ trong khí quyển", "Khí xê ô hai trong khí quyển"],
    ["Khí CO2 trong khí quyển", "Khí xê ô hai trong khí quyển"],
    ["Khí CH₄ từ bãi rác", "Khí mê tan từ bãi rác"],
    ["Khí N₂O từ phân bón", "Khí ni tơ ô xít từ phân bón"],
    ["Khí methane rất mạnh", "Khí mê tan rất mạnh"],
    ["Khí nitrous oxide", "Khí ni tơ ô xít"],
    // Viết tắt
    ["Tiêu chuẩn VCS", "Tiêu chuẩn vê xê ét"],
    ["Mỗi VCU tương ứng", "Mỗi vê xê u tương ứng"],
    ["Tổ chức VVB độc lập", "Tổ chức vê vê bê độc lập"],
    ["Tài liệu PD của dự án", "Tài liệu pê đê của dự án"],
    ["Lĩnh vực AFOLU", "Lĩnh vực a phô lu"],
    ["Cơ chế CORSIA", "Cơ chế co si a"],
    ["Phát thải GHG", "Phát thải khí nhà kính"],
    ["Ngành E&I", "Ngành năng lượng và công nghiệp"],
    ["Giá 5 USD", "Giá năm đô la Mỹ"],
    ["Quy trình QA/QC", "Quy trình đảm bảo và kiểm soát chất lượng"],
    // Tên riêng & từ ngoại
    ["Tổ chức Verra", "Tổ chức Ve ra"],
    ["Thỏa thuận Paris", "Thỏa thuận Pa ri"],
    ["Tín chỉ carbon", "Tín chỉ các bon"],
    ["Carbon là gì?", "Các bon là gì?"],
    ["Version 4.4", "Phiên bản bốn chấm bốn"],
    ["Diện tích 20 ha", "Diện tích hai mươi héc ta"],
    ["Đạt 5 tCO2e/ha", "Đạt năm tấn xê ô hai tương đương trên héc ta"],
    ["Tăng 15%", "Tăng mười lăm phần trăm"],
    ["Nóng thêm 1,5°C", "Nóng thêm một phẩy năm độ C"],
    ["Nghiên cứu & phát triển", "Nghiên cứu và phát triển"],
    // Mã phương pháp luận
    ["Phương pháp VM0047", "Phương pháp vê em không không bốn bảy"],
    ["Áp dụng VMR0006", "Áp dụng vê em e rờ không không không sáu"],
    ["Theo ACM0002", "Theo a xê em không không không hai"],
    ["Theo AMS0001", "Theo a em ét không không không một"],
    ["Theo AM0036", "Theo a em không không ba sáu"],
    ["Theo VMD0054", "Theo vê em đê không không năm bốn"],
    // Số
    ["Năm 1750", "Năm một nghìn bảy trăm năm mươi"],
    ["Khoảng 800.000 tấn", "Khoảng tám trăm nghìn tấn"],
    ["Đạt 423,9 ppm", "Đạt bốn trăm hai mươi ba phẩy chín ppm"],
    ["Hệ số 1,43", "Hệ số một phẩy bốn mươi ba"],
    ["Hệ số 1,05", "Hệ số một phẩy không năm"],
    ["Phiên bản 5.0", "Phiên bản năm chấm không"],
    ["Phiên bản 5.0A", "Phiên bản năm chấm không a"],
    ["Điều 3.8.2", "Điều ba chấm tám chấm hai"],
    ["Từ 20-40 năm", "Từ hai mươi đến bốn mươi năm"],
    ["Từ 20–40 năm", "Từ hai mươi đến bốn mươi năm"],
    ["Giai đoạn 2020-2030", "Giai đoạn hai nghìn không trăm hai mươi đến hai nghìn không trăm ba mươi"],
    ["11 năm nữa", "Mười một năm nữa"],
    ["Có 21 dự án", "Có hai mươi mốt dự án"],
    ["Có 24 dự án", "Có hai mươi tư dự án"],
    ["Có 105 dự án", "Có một trăm linh năm dự án"],
    // Ngày tháng
    ["Từ 01/01/2027", "Từ ngày một tháng một năm hai nghìn không trăm hai mươi bảy"],
    ["Từ ngày 01/01/2027", "Từ ngày một tháng một năm hai nghìn không trăm hai mươi bảy"],
    ["Ngày 15/4/2025 có hiệu lực", "Ngày mười lăm tháng tư năm hai nghìn không trăm hai mươi lăm có hiệu lực"],
    ["Tháng 6/2024", "Tháng sáu năm hai nghìn không trăm hai mươi tư"],
    // Chú thích tiếng Anh trong ngoặc
    ["Thời gian ân hạn (grace period) là 2 năm", "Thời gian ân hạn là hai năm"],
    ["Bản sửa đổi (revision) mới", "Bản sửa đổi mới"],
    ["Tổ chức thẩm định (VVB) độc lập", "Tổ chức thẩm định, vê vê bê, độc lập"],
    // Kết hợp
    ["Từ ngày 01/01/2027, VCS Version 5.0A áp dụng VM0047.", "Từ ngày một tháng một năm hai nghìn không trăm hai mươi bảy, vê xê ét phiên bản năm chấm không a áp dụng vê em không không bốn bảy."],
    ["Thỏa thuận Paris năm 2015 đặt mục tiêu 1,5°C.", "Thỏa thuận Pa ri năm hai nghìn không trăm mười lăm đặt mục tiêu một phẩy năm độ C."],
    ["Lúc 9:30 sáng", "Lúc chín giờ ba mươi phút sáng"],
    ["Dự án giảm 1.200.000 tCO2e mỗi năm.", "Dự án giảm một triệu hai trăm nghìn tấn xê ô hai tương đương mỗi năm."],
  ];
  it.each(cases)("%s", (input, want) => expect(n(input)).toBe(want));
});

describe("glossary & kiểm tra", () => {
  it("glossary dự án ghi đè mặc định", () => {
    const norm = createNormalizer({ glossary: [{ term: "VCS", reading: "vi xi ét", caseSensitive: true }] });
    expect(norm("Chuẩn VCS").tts).toBe("Chuẩn vi xi ét");
  });
  it("thêm thuật ngữ mới", () => {
    const norm = createNormalizer({ glossary: [{ term: "TUV NORD", reading: "tuyp nọt" }] });
    expect(norm("Chào mừng đến TUV NORD.").tts).toBe("Chào mừng đến tuyp nọt.");
  });
  it("không thay trong từ khác", () => {
    expect(n("Mã PDF")).toBe("Mã PDF");
    expect(n("Muối carbonate")).toBe("Muối carbonate");
  });
  it("cảnh báo chữ số / viết hoa còn sót", () => {
    expect(checkTts("Tổ chức UNFCCC")).toEqual(["Còn cụm viết hoa (có thể đọc sai): UNFCCC"]);
    expect(checkTts("Còn 5")).toHaveLength(1);
    expect(checkTts("Không có lỗi")).toEqual([]);
  });
  it("trả về danh sách quy tắc đã áp dụng", () => {
    const r = createNormalizer()("VCS năm 2027");
    expect(r.changed).toBe(true);
    expect(r.rules).toContain("thuật ngữ");
    expect(r.rules).toContain("số nguyên");
  });
  it("không đổi câu thuần Việt", () => {
    const r = createNormalizer()("Xin chào các bạn.");
    expect(r.changed).toBe(false);
  });
});

describe("phát hiện từ tiếng Anh", () => {
  it.each([
    ["Kịch bản đường cơ sở baseline của dự án", ["baseline"]],
    ["Bù trừ offset và registry", ["offset", "registry"]],
    ["Doanh nghiệp tham gia thị trường", []],
    ["Tín chỉ các bon trong năm", []],
    ["Gửi email và xem video", []],
    ["Ngân hàng Standard Chartered", ["Standard", "Chartered"]],
  ])("%s", (text, want) => expect(findForeignWords(text)).toEqual(want));
  it("đưa vào cảnh báo", () => expect(checkTts("Dùng baseline").join()).toContain("baseline"));
});

describe("thẻ CIT được giữ nguyên", () => {
  it("không chuẩn hóa bên trong [nghỉ 2s], [cười]", () => {
    expect(normalizeVi("Năm 2027 [nghỉ 2s] bắt đầu [cười] nhé")).toBe("Năm hai nghìn không trăm hai mươi bảy [nghỉ 2s] bắt đầu [cười] nhé");
  });
  it("không cảnh báo chữ số trong thẻ", () => expect(checkTts("Xin chào [nghỉ 500ms] các bạn")).toEqual([]));
});
