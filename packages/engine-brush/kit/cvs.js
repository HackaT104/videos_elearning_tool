// cvs.js (Course Video Studio): nối kit Claude Animation Base vào bộ dựng của ứng dụng. Nạp SAU core.js, clawd.js, character.js,
// timeline.js và TRƯỚC mã cảnh. Trang đặt sẵn CVS = { dur, cues, ends, fast, clawd, theme } (xem src/page.ts).
//   - Mốc câu thoại: CUES[i] / ENDS[i] (giây, tính từ đầu cảnh), at(i, f) = thời điểm f (0..1) của câu i.
//   - Chế độ nhẹ (CVS.fast): tô màu nước (fill) đổi thành màu phẳng (wash) – nhanh ~10 lần trên GPU tích hợp.
//   - Clawd (linh vật của Anthropic) chỉ dùng được khi dự án bật; mặc định nhân vật là kysu() (character.js).
//   - Chữ: KHÔNG vẽ chữ trong canvas (ứng dụng phủ chữ HTML theo kịch bản lên trên) – letter()/sfx() bị tắt.

const CUES = CVS.cues, ENDS = CVS.ends;
const at = (i, f = 0) => {
  const k = Math.max(0, Math.min(CUES.length - 1, Math.round(i)));
  return CUES.length ? CUES[k] + (ENDS[k] - CUES[k]) * f : DUR * f;
};
// màu theo phong cách của video (hex) – dùng cho bảng màu cảnh để hợp phần chữ phủ lên trên
const THEME = CVS.theme;

if (CVS.fast) {
  const paintFull = paintAt;
  paintAt = (pts, o) => paintFull(pts, o && o.fill ? (o.wash ? { ...o, fill: null } : { ...o, wash: o.fill, washOp: Math.min(255, (o.fillOp ?? 170) + 40), fill: null }) : o);
}
if (!CVS.clawd) {
  clawd = () => { throw new Error('Nhân vật Clawd đang tắt trong dự án – dùng kysu(x, y, u, {...})'); };
}
dancer = (x, y, u, style, t, extra = {}) => (CVS.clawd && extra.clawd ? clawd : kysu)(x, y, u, { ...move(style, t, extra.seed || 0), ...extra });
letter = () => { throw new Error('Không vẽ chữ trong cảnh hoạt hình – chữ trên màn hình do ứng dụng phủ lên theo kịch bản'); };
sfx = letter;
// trang dựng không có thanh tua của studio.html
devUI = () => {};
