# Kỹ năng (skill) dùng cho dự án

Claude Code tự nạp các kỹ năng trong `.claude/skills/` khi mở dự án này.

## Thiết kế giao diện & chuyển động (khi chỉnh giao diện)

| Kỹ năng | Nguồn | Giấy phép |
|---|---|---|
| frontend-design | https://github.com/anthropics/claude-plugins-official (plugins/frontend-design) | Apache-2.0 |
| animate, review-animations, emil-design-eng | https://github.com/emilkowalski/skills | MIT |
| make-interfaces-feel-better | https://github.com/jakubkrehel/make-interfaces-feel-better | MIT |

Nguyên tắc áp dụng cho Course Video Studio: xem `apps/web/DESIGN.md`.

## Tiết kiệm token khi viết mã: Ponytail

| Kỹ năng | Dùng khi |
|---|---|
| ponytail | Mặc định cho mọi việc viết/sửa mã: thay đổi nhỏ nhất mà giải quyết trọn vấn đề (YAGNI), trả lời ngắn. Đổi mức: `/ponytail lite\|full\|ultra`, tắt: "stop ponytail" |
| ponytail-review | Soát một thay đổi (`/ponytail-review`) |
| ponytail-audit | Soát toàn repo, chỉ báo cáo (`/ponytail-audit`) |
| ponytail-debt | Liệt kê các chỗ ghi `shortcut:` đã hoãn (`/ponytail-debt`) |
| ponytail-gain, ponytail-help | Xem số liệu tiết kiệm / hướng dẫn |

Nguồn: https://github.com/DietrichGebert/ponytail (MIT, bản 2026-10-29, commit 96608e0). Chỉ chép các file SKILL.md (chỉ dẫn thuần văn bản);
không cài hook Node của plugin. Muốn cài bản plugin đầy đủ (tự bật mỗi phiên, thanh trạng thái): trong Claude Code gõ lần lượt
`/plugin marketplace add DietrichGebert/ponytail` rồi `/plugin install ponytail@ponytail`.

## Thiết kế cảnh & chuyển động trong video: cvs-scene-design

| Kỹ năng | Dùng khi |
|---|---|
| cvs-scene-design | Viết/sửa template cảnh, cảnh tùy biến HyperFrames/Remotion, prompt AI chọn template/viết cảnh, hoặc khi video "đơn giản quá / như slide". Gồm: mô hình SceneSpec, AnimProps & ease, nhịp theo câu, stagger, giữ chữ, màu theo vai trò, tiếng Việt, mạch bài giảng, biểu đồ |

Chưng cất từ HyperFrames (https://github.com/heygen-com/hyperframes, Apache-2.0, commit 6b0abb4) – xem `cvs-scene-design/LICENSE` và `NOTICE.md`.
Không cài skill lõi `hyperframes` (hợp đồng của nó xung đột với lint của dự án). Checklist rút gọn cho Claude trong app: `packages/ai/src/index.ts`.
