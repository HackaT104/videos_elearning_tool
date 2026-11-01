# Bố cục, màu, chữ

Phần "video facts" phỏng theo HyperFrames `references/look.md` (Apache-2.0).

## Khung

- 1920×1080; vùng an toàn x 96–1824, y 54–1026 (`SAFE`). Dòng nguồn `.src-line` 22–24 px ở đáy do engine tự thêm ở cảnh cuối (cảnh template) khi video có `sources`, ngoài máy quay đẩy – đừng thêm trùng.
- Chữ trên màn hình ≥ 28 px (`MIN_FONT`). Tiêu đề 4–9 % chiều cao khung (≈ 56–104 px), 1–2 dòng; từ khóa "hero" có thể lớn hơn.
- Phân cấp bằng cỡ + độ đậm + màu, không bằng khung viền. Một cụm thông tin chính chiếm 60–90 % chiều ngang vùng an toàn; không dồn vào giữa nhỏ xíu.
- Khoảng trống có chủ đích: lệch tâm (tiêu đề trái, hình phải) thường sống hơn đối xứng tuyệt đối.
- Nhãn đặt **trên/cạnh** phần nó gọi tên (đường dẫn nếu cần), không dùng chú giải (legend).

## Màu theo vai trò (biến theme)

| Biến / tone | Vai trò |
|---|---|
| `--accent` / `tone-accent` | tiêu điểm chính, đáp án, từ khóa được nhấn – mỗi khung **một** màu nhấn chính |
| `--alt` / `tone-alt` | đối trọng trong so sánh (bên trái, phương án A), dữ liệu phụ |
| `--money` / `tone-money` | tiền, giá, doanh thu, tín chỉ có giá |
| `--warn` / `tone-warn` | **chỉ** rủi ro, chi phí, sai, vi phạm, hạn chót |
| `--ink`, `--ink-soft`, `tone-neutral` | chữ, phần đã lùi, dữ liệu nền (tô xám để làm nổi một chuỗi) |
| `--bg`, `--bg2`, `--card` | nền, đĩa nền biểu tượng, thẻ |

- Nhấn một cụm trong chữ bằng `**…**` (template render sang màu nhấn).
- Không glow/neon trang trí ở theme sáng. Gradient tuyến tính toàn khung trên nền tối bị sọc khi nén H.264 → dùng radial hoặc màu đặc.
- Màu không khí (atmosphere) 15–25 % độ phủ; dưới 5 % biến mất khi nén.

## Tiếng Việt

- Dấu chồng (ẫ, ặ, ữ, ỗ) cần ≥ 0,3 em khoảng đệm ở mọi mặt nạ `overflow:hidden`/`clip-path`; line-height ≥ 1,12 (display), 1,35 (body).
- Không tách ký tự thô; dùng `Intl.Segmenter` grapheme trên NFC hoặc tách theo từ.
- Không viết IN HOA dài (dấu khó đọc); kicker ngắn được phép.
- Thuật ngữ: verification = thẩm tra, validation = thẩm định; "TUV NORD"; chỉ số dưới CO₂.
- Số kiểu Việt: 423,9; 1.200 (`formatViNumber`).
