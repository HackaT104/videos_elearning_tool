# Thiết kế giao diện Course Video Studio

Theo kỹ năng `frontend-design` (Anthropic), `animate` / `emil-design-eng` (Emil Kowalski) và `make-interfaces-feel-better` (Jakub Krehel) trong `.claude/skills/`.

## Đối tượng & nhiệm vụ

- **Sản phẩm:** phòng dựng video bài giảng: biến tài liệu Word/Excel thành video có giọng CIT.
- **Người dùng:** chuyên viên thiết kế khóa học (instructional designer), không phải dân dựng phim; làm việc theo lô 10–30 video.
- **Nhiệm vụ chính của giao diện:** dẫn đúng thứ tự 10 bước và cho thấy *video nào đang ở đâu* trong dây chuyền.

## Ý tưởng: "bàn dựng"

Vay ngôn ngữ của phần mềm dựng phim: một **thanh điều khiển tối** bên trái (như panel của bàn dựng), vùng làm việc sáng bên phải.
Yếu tố đáng nhớ duy nhất: **đường ray thời gian (timeline track)**. Các bước của dự án nằm trên một đường ray dọc có vạch chia như thước timecode,
và mỗi video trong trang Sản xuất là **một làn (track)** gồm 6 đoạn clip: Chuẩn hoá · Giọng · Timing · Dựng cảnh · QA · Render.
Đoạn đang chạy có đầu đọc (playhead) trượt theo tiến độ. Mọi thứ khác giữ yên lặng, kỷ luật.

## Token

| Vai trò | Giá trị |
|---|---|
| Mực (chữ, panel tối) | `#13222B` |
| Giấy (nền vùng làm việc) | `#F4F6F5` (xám lạnh, không dùng kem) |
| Bề mặt | `#FFFFFF` |
| Đường kẻ | `#DCE2E0` |
| Nhấn "xanh phòng dựng" | `#0B7A5C` (một màu nhấn duy nhất) |
| Tín hiệu: cảnh báo / lỗi | `#C98418` / `#C7412F` (chỉ dùng cho trạng thái, không trang trí) |

**Chữ:** Be Vietnam Pro, thiết kế riêng cho tiếng Việt: dấu thanh rõ, không chồng nhau, khác hẳn Inter mặc định.
Một họ chữ, phân cấp bằng độ đậm và cỡ (thang 13 / 14 / 16 / 20 / 28). Số liệu và thời lượng dùng `tabular-nums`.
Bỏ nhãn IN HOA giãn chữ phía trên tiêu đề; bỏ dấu "→" gắn vào nút.

**Bố cục:** căn trái; panel tối 264 px trên máy tính, trên điện thoại đổi thành dải cuộn ngang ở đầu trang.
Bo góc theo cấp: thẻ 12 px, nút/ô nhập 8 px, chip 6 px (bo trong = bo ngoài − padding).
Thẻ dùng bóng nhiều lớp mờ để tạo độ nổi, viền chỉ để phân tách cấu trúc.

## Chuyển động (cổng tần suất của Emil Kowalski)

| Thành phần | Tần suất | Quyết định |
|---|---|---|
| Chuyển trang giữa các bước | hàng chục lần/ngày | **Không** hiệu ứng vào trang |
| Hover, nhấn nút | hàng chục lần/ngày | Nhấn: `scale(0.97)` 120 ms ease-out; hover chỉ đổi màu 150 ms, chỉ khi có chuột |
| Thông báo kết quả (Msg) | thỉnh thoảng | Trượt 6 px + mờ dần 200 ms `cubic-bezier(0.23,1,0.32,1)` bằng `@starting-style` |
| Phóng to mẫu phong cách | thỉnh thoảng | `scale(0.96)` → 1 + mờ dần 220 ms, nền tối dần 200 ms |
| Thanh tiến độ, đầu đọc playhead | liên tục | `transform: scaleX / translateX`, `linear` 600 ms (chuyển động đều) |
| Video vừa render xong | hiếm | Dấu ✓ vẽ nét 360 ms (khoảnh khắc "thưởng" duy nhất) |

Chỉ animate `transform` và `opacity`; không `transition: all`; luôn có `prefers-reduced-motion`.

## Tự soát so với mặc định

- Nền kem + chữ có chân + cam đất → **không**: nền xám lạnh, một họ sans tiếng Việt, nhấn xanh.
- Bộ thẻ SaaS giống hệt nhau → giảm: danh sách dự án dạng hàng, Sản xuất dạng làn timeline.
- Nhãn IN HOA trên mọi tiêu đề → bỏ.
