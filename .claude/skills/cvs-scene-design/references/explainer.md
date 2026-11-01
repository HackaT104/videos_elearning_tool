# Mạch bài giảng (explainer)

Phỏng theo HyperFrames `references/types/explainer.md`, `story.md`, `film.md` (Apache-2.0).

## Xương sống: hook → gọi tên → cách nó vận hành → bằng chứng → tóm lại

| Phần | Mục đích | Template hợp |
|---|---|---|
| **Hook** | Bắt đầu từ tình huống người học đã biết + một câu hỏi họ sẽ hỏi | `title-card` (câu hỏi làm tiêu đề), `myth-fact` (hiểu lầm phổ biến), `stat-hero` (một con số gây chú ý) |
| **Gọi tên** | Định nghĩa khái niệm trong một dòng | `title-card`, `quote-banner`, `hub-spoke` (khái niệm + thành phần) |
| **Cách vận hành** | Một ví dụ cụ thể đi qua từng bước | `process-steps`, `flow-chain`, `cause-effect`, `document-transform`, `timeline-run` |
| **Bằng chứng** | Số liệu/so sánh có nguồn | `stat-hero`, `bar-compare`, `donut-share`, `split-compare`, `checklist` |
| **Tóm lại** | Một ý cần nhớ, một dòng | `quote-banner` |

(Một số template – hub-spoke, myth-fact, donut-share… – do đợt khác thêm; kiểm `TEMPLATES` trong `packages/engine/src/templates/index.ts`.)

## Thiết bị giải thích

- **Một sơ đồ lớn dần**: bắt đầu từ hình đơn giản nhất đúng sự thật, mỗi nhịp thêm một phần khi giọng gọi tên nó. Không bao giờ thả cả sơ đồ.
- **Biến đổi liên tục**: phần tử của nhịp trước biến thành nhịp sau (thanh → trục, chấm → nhóm) thay vì cắt.
- **Ví dụ xuyên suốt**: một đầu vào thật (một hóa đơn, một tấn CO₂, một hồ sơ) đi qua mọi bước đến kết quả.
- **Hình dạng trước, hình ảnh sau**: số rơi xuống; hiểu lầm bị gạch và sự thật in đè; trước/sau; nhiều thứ hội tụ; chọn một trong nhiều; các bước tuần tự; trích dẫn như áp phích.

## Lời & chữ

- Giọng là đồng hồ: hiện mỗi phần đúng lúc giọng nhắc tới nó, rải qua nửa sau cảnh.
- Chữ trên màn hình không lặp nguyên văn lời thoại: nhãn ≤ 6 từ, câu ≤ 14 từ.
- Cảnh ~15–40 s, 2–5 câu; mỗi câu ≤ 25 từ.

## Dấu hiệu yếu

Slide gạch đầu dòng; biểu tượng trong vòng tròn xếp ba thẻ một hàng mà không có quan hệ; cả sơ đồ hiện một lúc;
mọi cảnh cùng template; kết thúc bằng thẻ thương hiệu thay vì một ý cần nhớ.
