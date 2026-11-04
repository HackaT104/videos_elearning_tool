# Phong cách phim mẫu (lemo-opuscar)

`packages/themes/film-styles/` có 66 bản mô tả phong cách phim (`<slug>.md`, tiếng Anh) từ
[lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) – © 2026 LemoLab, MIT (xem `LICENSE-lemo-opuscar.txt`, `THIRD-PARTY.md`).
`index.json`: slug, tên, nhóm, công dụng; `posters/<slug>.jpg`: ảnh 480 px (CC BY 4.0, đã thu nhỏ).

Mỗi bản: 1 Bản chất · 2 Chất liệu (canvas) · 3 Logic màu · 4 Chữ & phụ đề · 5 Chất lượng chuyển động · 6 Ngữ pháp camera ·
7 Âm thanh · 8 Động tác đặc trưng · 9 Lỗi hay gặp · 10 Engine · 11 Không gian biến thể.

Cách dùng trong dự án này (engine là SceneSpec DOM + tween, KHÔNG phải canvas `render(t)` của lemo-opuscar):
- **Theme**: mục 3 (≤ 3 màu vai trò, mã hex gợi ý) + mục 4 (đổi sang cặp phông có dấu tiếng Việt trong `fontpairs.ts`) + mục 5 (ease/dur).
  Người dùng chọn phong cách mẫu ở "Tạo phong cách bằng AI" → prompt style-gen nhận mục 1, 3, 4, 5, 6, 8, 9, 11.
- **Thiết kế cảnh**: mục 6 và 8 gợi ý cách dắt mắt (camera lướt giữa các vùng của bảng, chữ "viết" đúng lúc lời nói tới,
  khoanh tròn vượt điểm khép, gạch xoá) → dùng `draw` (stroke-dashoffset), `wipe`, camera push-in, `at: {cue, f}` theo câu.
- **Không** chép phông của bản mô tả (đa số không có dấu tiếng Việt), không dựng 3D/WebGL, không thêm âm thanh từng nét.

Hợp với bài giảng: `whiteboard`, `chalkboard`, `blueprint`, `dataviz`, `iso-infographic`, `isometric-picture-book`,
`living-screencast`, `pictogram-motion`, `swiss-motion`, `dark-keynote`, `transit-map`, `teardown`, `briefing-board`, `midcentury-toon`.
