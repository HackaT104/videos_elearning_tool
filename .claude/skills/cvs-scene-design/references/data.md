# Số liệu, biểu đồ, bộ đếm

Phỏng theo HyperFrames `references/types/data.md` và `film.md` (Apache-2.0).

## Một thông điệp mỗi biểu đồ

- Biểu đồ chỉ nói **một** điều; điều đó nằm ngay trong tiêu đề ("Phát thải giảm 40 % sau 5 năm"), không phải "Biểu đồ phát thải".
- Tô màu nhấn **một** chuỗi/cột quan trọng, phần còn lại `tone-neutral`.
- Chú thích (annotation) đặt ngay trên điểm quan trọng, xuất hiện sau khi dữ liệu đã vẽ xong; không legend.
- Không biểu đồ tròn nhiều lát; tỷ trọng 2–3 phần → `donut-share` (nếu đã có trong `TEMPLATES`); nhiều giá trị → `bar-compare`.

## Thứ tự dựng (theo nhịp đọc)

1. Khung/trục (fade 0,4 s) → 2. đường tham chiếu (draw) → 3. dữ liệu (cột `grow`/`wipeUp` stagger 80–120 ms, đường `draw`)
→ 4. giá trị (count hoặc enter) → 5. một chú thích trên điểm quan trọng (pop/enter + đường dẫn draw).
Mỗi bước gắn vào câu thoại nói tới nó.

## Một con số

- Con số là thứ lớn nhất trên khung; được "dọn đường" bởi câu trước.
- `count` 1,2–1,6 s `power2.out` rồi giữ yên; `font-variant-numeric: tabular-nums` để không rung.
- Không cho mọi con số đếm cùng lúc; tối đa một bộ đếm chính mỗi nhịp.
- Định dạng kiểu Việt (423,9 · 1.200); đơn vị nhỏ hơn số, cùng màu nhấn hoặc mực.

## Trung thực

- Chỉ số liệu có trong tài liệu nguồn, làm tròn giống nhau ở mọi nơi; không suy ra số mới (40 → 2 phút không thành "nhanh 20×").
- Dòng nguồn nhỏ (22–24 px, `.src-line`) do engine tự thêm ở cảnh cuối khi video có `sources` – đừng tự thêm trùng; cảnh tùy biến cần nguồn riêng thì dùng lớp `src-line`.
- Thang đo bắt đầu từ 0 cho cột; không cắt trục để phóng đại.

## Dấu hiệu yếu

Lưới thẻ KPI; dashboard; pie nhiều lát; mọi số đếm cùng lúc; số không nguồn.
