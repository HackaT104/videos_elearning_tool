---
name: cvs-scene-design
description: Motion-design and scene-design guidance for Course Video Studio (1920x1080 Vietnamese e-learning videos). Use when designing, writing or reviewing a scene template (packages/engine/src/templates), a custom HyperFrames/Remotion scene, the in-app AI prompts that pick templates or write scenes (packages/ai), or when a video "looks too simple / like slides" and needs richer animation. Covers the SceneSpec model, allowed AnimProps and eases, cue-synced timing, staggers, holds, exits, hierarchy, color roles, Vietnamese diacritic headroom, explainer and data-viz patterns.
---

# Thiết kế cảnh & chuyển động cho Course Video Studio

Một cảnh = một ý được giọng đọc dẫn dắt. Hình không trang trí lời thoại; hình **chỉ ra** điều lời thoại đang nói, đúng lúc nó nói.
Kỹ năng này chưng cất từ HyperFrames (HeyGen, Apache-2.0, xem `NOTICE.md`) và điều chỉnh theo dây chuyền của dự án:
SceneSpec → GSAP `fromTo` (HyperFrames) và `interpolate` (Remotion) phải ra **cùng khung hình**.

> Không cài/không làm theo skill lõi `hyperframes` của HeyGen: hợp đồng của nó (class="clip", tl.to/set, không có khối TIMING)
> xung đột với lint của dự án (`packages/engine-hf/src/lint.ts`). Hợp đồng đúng nằm trong `HF_CONTRACT` (`packages/studio/src/pipeline.ts`).

## Khi nào đọc file nào

| Việc | Đọc |
|---|---|
| Viết/sửa template, helper chuyển động, AnimProps, ease | `references/motion.md`, `references/scene-spec.md` |
| Viết cảnh tùy biến HyperFrames/Remotion (tay hoặc prompt AI) | `references/scene-spec.md` (mục Cảnh tùy biến), `references/motion.md` |
| Chọn bố cục, màu, cỡ chữ, tiếng Việt | `references/look.md` |
| Dựng mạch bài giảng, chọn template cho từng câu | `references/explainer.md` |
| Số liệu, biểu đồ, bộ đếm | `references/data.md` |
| Cần ý tưởng phong cách / ngữ pháp hình (bảng trắng, phấn, bản vẽ, isometric, dataviz…) | `references/film-styles.md` → `packages/themes/film-styles/<slug>.md` |

## Quy trình 6 bước cho một cảnh

1. **Một ý** – viết ra một câu: người học phải hiểu gì sau cảnh này? Nếu cần hai câu → tách hai cảnh.
2. **Hình dạng thông tin** – so sánh, quy trình, nhân quả, một con số, tỷ trọng, mốc thời gian, hiểu lầm/sự thật, trung tâm–vệ tinh, kết luận… → chọn template khớp hình dạng (bảng trong `explainer.md`), không chọn theo thói quen.
3. **Nhịp theo câu** – mỗi câu thoại là một nhịp; mỗi nhịp có **một tiêu điểm** mới xuất hiện/được nhấn. Gắn `at: {cue, f}` cho từng phần tử, rải phần hiển thị sang nửa sau cảnh, không đổ hết trong 1 giây đầu.
4. **Lớp vào cảnh** – nền/khung (fade) → tiêu đề (enter) → nội dung chính (enter/draw/grow/count) → nhãn phụ (stagger 60–120 ms) → nhấn mạnh (pop/highlight/dim phần cũ).
5. **Giữ & đọc** – chữ cần đọc giữ ≥ 0,5 s + 0,3 s/từ trước khi bị che/dim. Đã vào chỗ thì đứng yên.
6. **Soát** – chạy `npx tsx scripts/gallery.ts <outDir> <template>` và **nhìn** contact sheet (Read tool): chữ đè, tràn, cắt dấu, khoảng trống, khung cuối đủ nội dung.

## Checklist nhanh (dán vào review)

- [ ] Một tiêu điểm mỗi nhịp; phần cũ lùi (`dim` 0,35) khi phần mới là trọng tâm.
- [ ] Mọi mốc qua `at(cue, f)`; giây cứng chỉ cho tiêu đề < 1 s.
- [ ] Vào: `expo.out`/`power4.out` 0,6–0,8 s; dời bố cục: `power2.inOut` 0,7–1,2 s; nét vẽ: `dash` 1→0 `power2.inOut`; nảy (`back.out(1.4–1.7)`, `elastic.out(1,0.5)`) chỉ cho biểu tượng/huy hiệu, ≤ 1–2 lần một cảnh.
- [ ] Stagger nhóm 60–120 ms (danh sách 40–80 ms); phần tử sau bắt đầu khi phần trước xong 30–50 %.
- [ ] Không phải mọi thứ đều "mờ + trượt lên": đổi kiểu vào giữa các lớp (wipe, draw, grow, count, blur-in, scale-in).
- [ ] Không nhấp nháy; không `repeat: -1`; chữ đã vào thì đứng yên. Dao động "sống" (Remotion `wobble`) chỉ ≤ 4 px trên hình trang trí, không trên chữ.
- [ ] Cảnh template: ra cảnh do engine lo (blur 8 px + mờ 0,3 s `power3.in` tại `T.dur − 0.45`), không tự thêm exit chồng. Cảnh tùy biến: engine **không** thêm exit/máy quay → phải tự viết exit đúng hợp đồng (lint không bắt thiếu exit).
- [ ] Màu theo vai trò: `accent` chính, `alt` đối trọng, `money` tiền, `warn` chỉ rủi ro/chi phí; mỗi khung một màu nhấn chính.
- [ ] Chữ ≥ 28 px (dòng nguồn 22–24 px); vùng an toàn x 96–1824, y 54–1026; mặt nạ tràn chừa ≥ 0,3 em cho dấu tiếng Việt.
- [ ] Đa dạng cả video (tránh "trình chiếu"): không hai cảnh liền nhau cùng template; một template ≤ 40 % số cảnh; ít cảnh chỉ có chữ
      (title-card, quote-banner, kinetic-statement, term-define, checklist) khi nội dung vẽ được; cảnh ≥ 20 s cần ≥ 4 phần tử chuyển động.
      QA kiểm bằng `varietyQa` (`packages/qa/src/variety.ts`) và hiện ở bước Sản xuất.
- [ ] Không bịa số; chữ tự thêm → `assumptions`. Dòng nguồn `.src-line` do engine tự thêm ở cảnh cuối (cảnh template) khi video có `sources` – đừng thêm trùng.

## Đồng bộ với prompt trong ứng dụng

Checklist rút gọn (≤ 40 dòng) cho Claude chạy trong app nằm ở `packages/ai/src/index.ts` (`MOTION_CHECKLIST`, `CUSTOM_SCENE_CHECKLIST`)
và được kiểm bằng `packages/ai/test/prompts.test.ts`. Sửa nguyên tắc ở đây thì cập nhật cả hai chỗ đó.
