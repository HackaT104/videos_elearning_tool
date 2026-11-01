# Chuyển động (motion craft) – áp vào SceneSpec

Phỏng theo HyperFrames `references/motion.md` (Apache-2.0), đổi sang công cụ của dự án.

## Thuộc tính được phép (AnimProps, `packages/engine/src/spec.ts`)

| Prop | GSAP (HyperFrames) | Dùng cho |
|---|---|---|
| `opacity` | opacity | mọi lối vào/ra, `dim`/`undim` |
| `x`, `y` | x / y (px) | trượt vào 16–40 px, dời bố cục |
| `scale`, `scaleX`, `scaleY` | scale… | pop, cột/thanh mọc (`grow`, `transform-origin` đặt trên **chính** phần tử được scale, vd. `bottom` cho cột) |
| `rotate` | rotation (độ) | kim đồng hồ, mũi tên quay, nghiêng nhẹ ≤ 6° |
| `blur` | filter: blur(px) | blur-in 6–8 px → 0, ra cảnh |
| `dash` | stroke-dashoffset | vẽ nét: phần tử có `pathLength="1"` + lớp `.draw`, 1 → 0 |
| `wipe` | clip-path inset trái→phải 0..1 | gạch chân/marker, thanh tiến độ, lộ chữ theo hàng |
| `wipeUp` | clip-path inset dưới→trên 0..1 | cột dâng, mực nước, lộ khối từ đáy |

Không có prop nào khác: màu, width/height, top/left, clip-path tự do **không** tween được trong SceneSpec
(Remotion phát lại phải khớp). Muốn đổi màu → hai lớp chồng nhau và crossfade `opacity`.
Đếm số dùng `counts` (`CountAnim`), không dùng anim.

Helper sẵn có (`packages/engine/src/motion.ts`): `enter` (mờ + trượt + blur 6), `fade`, `dim`/`undim`, `pop` (back.out(1.6)),
`draw`, `grow`, `move`, `wipeIn(dir)`, `springIn` (elastic.out(1, 0.5)), `count`, `shift(ref, d)`.
Chữ chuyển động: `kineticText` (`packages/engine/src/kinetic.ts`, xem mục Preset chữ chuyển động).

## Từ vựng ease (khớp `packages/engine/src/ease.ts`)

| Vai trò | Ease | Thời lượng |
|---|---|---|
| Vào cảnh (phần tử đáp xuống) | `expo.out`, `power4.out` (theme quyết định qua `enterEase`) | 0,6–0,8 s |
| Nhịp chậm (cấp độ cơ bản, theme chậm) | `power2.out`, `sine.inOut` | 0,9–1,3 s |
| Dời bố cục, máy quay, đổi màu nền | `power2.inOut`, `power3.inOut` | 0,7–1,2 s |
| Vẽ nét, wipe | `power2.inOut` / `power3.inOut` | 0,8–1,3 s |
| Bật/nảy biểu tượng | `back.out(1.4–1.7)`, `elastic.out(1, 0.5)` | 0,6–1,0 s |
| Rơi chạm đất (hiếm, vui) | `bounce.out` | 0,8–1,2 s |
| Ra/zoom xuyên | `power3.in` | ngắn hơn vào 40–50 % |
| Tiến độ, quay đều | `none`/`linear` | theo nội dung |

Tên ease khác sẽ rơi về `power2.out` trong Remotion → lệch khung giữa hai engine. Chỉ dùng tên trong bảng `BASE` hoặc
`back.*(s)`, `elastic.*(a, p)`.

Quy tắc:
- **Đến chậm, đi gọn**: đuôi ease-out dài khi đáp; ra là một chuyển động liền, ngắn hơn.
- Cùng `power2.out 0,5 s` cho mọi thứ = cảm giác "máy tạo". Đổi ease theo vai trò.
- Độ nảy: vị trí/kích thước được nảy; opacity và màu nên dùng ease không nảy (đừng đặt `back`/`elastic` cho tween chỉ có opacity).
  Lưu ý: helper `pop`/`springIn` tween opacity + scale chung một ease nảy – `back.out` vượt 1 bị kẹp nên không thấy, `springIn` làm opacity
  chớp xuống ~0,97 sau đỉnh (khó thấy, chấp nhận được). Cảnh tùy biến: tách opacity thành tween riêng `power2.out`.
- Nảy là gia vị: tối đa 1–2 phần tử/cảnh, không dùng cho đoạn chữ dài, không cho giao diện nghiêm túc (cảnh rủi ro/pháp lý).

## Nhịp, stagger, chồng lấp

- Phần tử kế tiếp bắt đầu khi phần trước xong 30–50 % (nối tiếp hoàn toàn = robot; cùng lúc = rẻ).
- Stagger: từ 60–120 ms; mục danh sách 40–80 ms; ký tự (tên riêng ngắn) ~ 1 khung–100 ms.
  Trong SceneSpec: `shift(ref, i * 0.08)`; trong cảnh tùy biến: `at(i, f) + k * 0.08`.
- Mỗi câu thoại = một nhịp; phần tử chính của câu vào ở `f` 0,05–0,2 (ngay khi giọng chạm ý), phần phụ ở `f` 0,3–0,7.
- Rải nội dung sang nửa sau cảnh. Mọi thứ hiện trong 1/4 đầu rồi đứng im = slideshow.
- Tương phản tốc độ: chuyển nhanh (0,3–0,6 s) xen giữ lâu; dừng 0,3–0,75 s ngay trước "khoảnh khắc trả lời" (số lớn, kết luận).

## Giữ (hold) và đọc

- Dòng phải đọc: giữ ≥ 0,5 s + 0,3 s/từ trước khi bị dim/che. Câu kết video ≥ 2 s.
- Tiêu đề đã đáp là **đứng yên tuyệt đối**; chuyển động dời sang phần tử tiếp theo.
- Engine đã thêm máy quay đẩy nhẹ (scale 1 → 1 + `theme.motion.camera`, mặc định 0,025, `sine.inOut` cả cảnh) cho cảnh template
  (theme có `camera: 0` thì không đẩy; cảnh `draft`/`custom` không có máy quay).
  Đừng thêm zoom/pan riêng chồng lên. Cảnh tùy biến không có máy quay: được phép một push-in 1 → 1,02 trên div bọc bên trong stage.

## Ra cảnh

`EXIT` (`spec.ts`): blur 8 px + opacity 0 trong 0,3 s `power3.in` tại `T.dur − 0.45`, áp cho stage – chỉ cho cảnh template. Template **không** tự viết exit
cho từng phần tử. Cảnh tùy biến dùng nguyên mã → **phải tự viết** exit này trên `#<sid>-stage` (HF_CONTRACT; lint không bắt thiếu). Trong cảnh, khi một ý bị thay: `dim` về 0,35 (giữ ngữ cảnh) hoặc blur-out 0,13–0,25 s rồi phần mới vào cùng chỗ.

## Chữ chuyển động (kinetic text)

Các cách vào chữ – **đổi giữa các cảnh**, đừng lặp một kiểu:
- theo từ: blur 6 px → 0 + opacity 0 → 1, 0,13–0,2 s mỗi từ, cách nhau 60–100 ms, không trượt;
- theo từ: màu nhạt → mực (hai lớp chồng, crossfade);
- cả dòng blur-in 8 px → 0 trong 0,15–0,2 s;
- lộ theo hàng bằng `wipe`/`wipeUp` (mặt nạ chừa ≥ 0,3 em trên/dưới cho dấu);
- một từ khóa được tô (marker `wipe` sau chữ, hoặc đổi sang màu nhấn) đúng lúc giọng nói tới.

### Preset chữ chuyển động (`KINETIC_PRESETS`, tham số `preset` của kinetic-statement)

Tách lúc build, chỉ dùng AnimProps (HyperFrames = Remotion). Đổi preset giữa các cảnh; nghiêm túc → word-fade/focus-pull/wipe-reveal.
- Theo từ: `word-rise`, `word-fade`, `mask-rise`, `scale-pop`; nhấn **…**: `highlight-sweep`, `underline-draw`, `circle-annotate`
  (`<ellipse>` theo % hộp cụm, nét px thật, vòng thứ hai vượt điểm đầu).
- Theo grapheme (chỉ tiêu đề ≤ 30 ký tự, dài hơn tự về theo từ/cả khối): `char-soft-rise` (blur 8 + y 16 → 0, expo.out, 0,03 s),
  `tracking-in` (x lệch theo vị trí → 0, không tween letter-spacing); `typewriter` (≈ 20 ký tự/s, con trỏ nháy 2 lần rồi tắt).
- Cả khối: `focus-pull` (blur 14 + scale 1,03 → 1), `block-reveal` (thanh accent nở trái → chữ hiện → thanh co về phải),
  `wipe-reveal` (`wipe` + clip chừa đệm dấu).
- `word-swap` (cụm **…** thay cho các từ `alt`), `odometer` (mỗi chữ số cuộn 0 → d, phải → trái), `reading-focus`
  (câu/dòng chưa đọc 0,35, đang đọc 1, đã đọc 0,55).
Đệm mặt nạ theo phông: `kineticPad(theme)` = max(0,35 em, `viPadEm` + 0,15) – `viPadEm` khai báo trong `fontpairs.ts`
(League Spartan 0,30, Unbounded 0,25, Bitter 0,21, Mali 0,20, Anton 0,19, Archivo 0,15; mặc định 0,12).

**Tiếng Việt**: không tách chữ thành ký tự bằng `split("")`. Tách theo từ (khoảng trắng) hoặc theo grapheme
`new Intl.Segmenter("vi", { granularity: "grapheme" })` trên chuỗi đã `normalize("NFC")`. Dấu chồng (ặ, ổ, ữ) cao hơn chữ Latin:
`overflow:hidden`/`clip-path` phải chừa ≥ 0,3 em đệm trên và dưới; line-height ≥ 1,12 cho chữ display.

## Dấu hiệu "trông như máy tạo" (tránh)

Mọi phần tử mờ + trượt lên giống nhau; mọi cảnh vào cùng kiểu; vòng thở/lơ lửng/nhấp nháy thay cho chuyển động thật;
tiêu đề trượt/scale mãi sau khi đáp; nảy trên giao diện nghiêm túc; vòng click; cả sơ đồ hiện một lúc.

## Khi người duyệt nói…

| Họ nói | Sửa |
|---|---|
| "nhanh quá" | Chậm mọi dời/zoom còn 0,7× tốc độ, giữ nguyên phần còn lại |
| "đơn giản quá / như slide" | Thêm lớp: draw nối, count số, stagger nhãn, highlight từ khóa, dim phần cũ; rải theo câu |
| "chữ cứ chạy" | Cho đáp rồi đứng yên tới khi ra |
| "rối" | Bớt phần tử đồng thời; một tiêu điểm mỗi nhịp; dim phần nền |
