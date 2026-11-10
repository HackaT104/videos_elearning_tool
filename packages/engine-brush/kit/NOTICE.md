# Kit hoạt hình vẽ tay

- `core.js`, `timeline.js`, `clawd.js`: sao nguyên văn từ **Claude Animation Base** – © 2026 John Heibel, MIT
  (`LICENSE-claude-animation-base.txt`). Không sửa các file này; muốn đổi cách vẽ thì bọc lại trong `cvs.js`.
- `character.js`: nhân vật "Kỹ sư" của Course Video Studio (cùng hệ toạ độ và tuỳ chọn với `clawd()` để dùng lại mắt, miệng, mũ, emote, cảm xúc).
- `cvs.js`: nối kit vào ứng dụng (mốc câu `at(i, f)`, màu phong cách `THEME`, chế độ nhẹ, tắt Clawd, tắt chữ trong canvas).
- **Clawd** là linh vật của Claude Code (Anthropic): giấy phép MIT không cấp quyền dùng hình nhân vật/thương hiệu – mặc định tắt.
- Thư viện: p5.js (LGPL-2.1) và p5.brush (MIT), nạp nguyên bản từ `node_modules` khi vẽ.
