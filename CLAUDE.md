# Course Video Studio – hướng dẫn cho Claude

- Trả lời và hiển thị mọi thứ bằng tiếng Việt.
- Viết/sửa mã theo kỹ năng `ponytail` (mức full) trong `.claude/skills/ponytail`: thay đổi nhỏ nhất giải quyết trọn yêu cầu,
  dùng lại helper sẵn có trong repo, không thêm phụ thuộc cho vài dòng, trả lời ngắn. Không cắt: kiểm tra dữ liệu vào, xử lý lỗi, bảo mật, khả năng truy cập.
- Giao diện web: theo `apps/web/DESIGN.md` và các kỹ năng thiết kế trong `.claude/skills/`.
- Monorepo pnpm, Node ≥ 22, TypeScript chạy trực tiếp (tsx). Kiểm tra: `npx tsc --noEmit -p .` và `npx vitest run`.
