---
name: cvs-claude-code
description: Làm phần AI của Course Video Studio bằng Claude Code (gói Claude đã đăng ký) thay cho Claude API – thiết kế/thiết kế lại cảnh, sửa một cảnh theo yêu cầu, vẽ hình minh hoạ SVG, viết cảnh tùy biến, sửa / rà soát cách đọc, làm trọn video – qua lệnh `pnpm cvs`. Dùng khi người dùng nhờ thiết kế/sửa/vẽ cho một video của ứng dụng, hoặc nói "xử lý yêu cầu đang chờ (của Course Video Studio)".
---

# Claude Code làm AI cho Course Video Studio

Ứng dụng tự gọi Claude API khi có khoá API. Khi không có, người dùng bấm **"Gửi cho Claude Code"** trong ứng dụng: yêu cầu vào
hàng đợi, rồi bạn (Claude Code, chạy trong thư mục dự án) làm việc đó bằng lệnh `pnpm cvs` (file `scripts/cvs.ts`, gọi API worker
`CVS_API`, mặc định `http://127.0.0.1:3001/api`). Mọi lệnh in JSON. Ghi bằng lệnh `set-*`; **không** sửa trực tiếp `storage/` hay SQLite.

## Quy trình

1. **Ứng dụng đang chạy?** `pnpm -s cvs projects`. Lỗi "Không kết nối được worker" → dừng, bảo người dùng mở ứng dụng bằng
   `KHOI_DONG.cmd` (hoặc `pnpm start`) rồi nhắn lại. Không tự khởi động worker trừ khi người dùng yêu cầu.
2. **Lấy việc:** `pnpm -s cvs pending` (cũ trước; `status: "running"` = ứng dụng đã tự mở Claude Code để làm việc đó – vẫn là việc của bạn). Người dùng nhờ trực tiếp (không qua hàng đợi) thì làm như một yêu cầu cùng loại, bỏ bước `done`.
3. Với **mỗi** yêu cầu, theo thứ tự:
   1. `pnpm -s cvs video <pid> <key>` – kịch bản, lời thoại kèm mốc `cue/end` từng câu, thiết kế hiện tại, assumptions, notes.
   2. Đọc kỹ năng `cvs-scene-design` (`.claude/skills/cvs-scene-design/SKILL.md`) trước khi thiết kế.
   3. Lấy **đúng prompt mà Claude API nhận** cho việc này và làm theo nó như thể bạn là model được gọi:
      `pnpm -s cvs prompt <design|illustration|custom|readings|review-readings> <pid> <key> [sid] [--note "<note của yêu cầu>"]`.
      Prompt đã gồm quy tắc, checklist chuyển động, thư viện template (schema + ví dụ), biểu tượng, SERIES_SPEC, lời thoại có mốc.
      Tra thêm: `pnpm -s cvs templates` (template, biểu tượng, kiểu chữ chuyển động, phong cách, phông).
   4. Ghi kết quả bằng lệnh `set-*` (bên dưới). Lệnh trả `{"ok":false,"errors":[…]}` → sửa đúng lỗi rồi ghi lại.
   5. `pnpm -s cvs check <pid> <key>` – dựng + QA (giữ thiết kế đã ghi). In lỗi QA và **đường dẫn tuyệt đối ảnh khung** từng cảnh.
      **Mở các ảnh bằng công cụ Read và tự nhìn** (ứng dụng không có soát bằng hình khi thiếu API – bạn thay nó). Soát theo checklist
      soát hình của app: chữ đè/tràn/cắt, khoảng trống vô lý, sai chính tả tiếng Việt, số khác kịch bản, hình mâu thuẫn lời thoại
      (sai chủ thể/chiều hành động), khung cuối cảnh chưa hiện đủ, chữ mới hiện quá trễ (< 0,5 s + 0,3 s/từ trước khi hết cảnh).
      Có lỗi → sửa thiết kế, `check` lại (tối đa ~3 vòng).
   6. `pnpm -s cvs render <pid> <key>` rồi `pnpm -s cvs wait <jobId>` (hết giờ → mã thoát 2, chạy `wait` lại). Video chưa có giọng
      thì `render` tự chạy sản xuất đủ (giọng → dựng → render), giữ thiết kế đã ghi. Lỗi "phong cách"/"CIT" → báo người dùng mở bước tương ứng.
   7. `pnpm -s cvs done <reqId> "<tóm tắt ngắn đã làm>"` – hoặc `pnpm -s cvs fail <reqId> "<lý do>"` nếu không làm được.
4. Trả lời người dùng ngắn gọn bằng tiếng Việt: đã làm gì từng yêu cầu, chỗ nào cần họ duyệt (assumptions), mở bước **Duyệt** để xem.

## Từng loại yêu cầu

| kind | Làm gì |
|---|---|
| `revise` (có `scene_id`, `note`) | `prompt design … <sid> --note "<note>"` → JSON → `set-design … <sid> <file> --note "<note>"`. Cảnh đang là `custom` → làm như `custom-scene` với note. |
| `design-video` | Mỗi cảnh: `prompt design … <sid>` → `set-design`. Rồi `check` một lần cho cả video. |
| `illustration` (có `scene_id`) | Cảnh cần `illustration`: `set-design` với `params.brief` (≤ 60 từ, không tự viết SVG trong JSON), rồi `prompt illustration … <sid>` → vẽ SVG → `set-svg`. |
| `custom-scene` (có `scene_id`) | `prompt custom … <sid> [--note]` (gồm hợp đồng file cảnh, 2 cảnh mẫu đã dựng, khối TIMING) → viết file → `set-custom`. |
| `fix-readings` | `pnpm -s cvs readings <pid> [key] --warn` + `prompt readings <pid> <key>` → mỗi câu `set-reading <pid> <key> <sid> <idx> <cách đọc>`. |
| `review-readings` (`video_key` trống = mọi video) | Xem mục **Rà soát cách đọc** bên dưới. Chỉ **đề xuất** (`suggest-reading`), không `set-reading`; không cần `check`/`render`. |
| `agent` (`video_key` trống = mọi video của dự án) | `fix-readings` → `design-video` (thiết kế lại mọi cảnh, kể cả cảnh `auto`) → `check` + nhìn khung + sửa → `render`. |

Các cảnh có `design.by = "user"` là người dùng tự chỉnh: chỉ thay khi yêu cầu nhắm đúng cảnh đó.

## Lệnh ghi

- `set-design <pid> <key> <sid> <file.json|->` – file đúng dạng câu trả lời của prompt design:
  `{"template":"hub-spoke","params":{…},"assumptions":["…"],"reasoning":"…"}`. Máy chủ kiểm như đường API (`designErrors` trong
  `packages/ai/src/index.ts`: template có trong thư viện, tham số bắt buộc, `cue` < số câu, illustration có `brief`, image-focus giữ ảnh).
  Thiết kế cũ vào lịch sử (người dùng bấm *Hoàn tác* được), video bị bỏ duyệt.
- `set-svg <pid> <key> <sid> <file.svg|-> [--brief "…"]` – giữ các tham số khác của cảnh illustration. SVG được lọc (`sanitizeSvg`,
  chế độ illustration) và phải có ≥ 6 phần tử, ≥ 2 nhóm `<g id="part-N">` (`checkIllustration`).
- `set-custom <pid> <key> <sid> <file|->` – HTML HyperFrames hoặc TSX Remotion theo engine của video; phải qua lint (`customLint`).
- `set-reading <pid> <key> <sid> <idx> <cách đọc…>` – khoá câu như sửa tay ở bước Chuẩn hoá cách đọc.
- `suggest-reading <pid> <key> <sid> <idx> <cách đọc…> [--reason "…"] [--glossary "HSE=hát ét ét;PPE=pê pê e"]` – lưu **đề xuất**
  (by `claude-code`); cách đọc chỉ đổi khi người dùng bấm *Chấp nhận* (khi đó câu bị khoá và thuật ngữ mới vào bảng thuật ngữ của dự án).

## Rà soát cách đọc (`review-readings`)

Người dùng muốn **tự duyệt** mọi thay đổi: bạn chỉ đề xuất. Với mỗi video (`pnpm -s cvs videos <pid>` khi yêu cầu không có `video_key`):
1. `pnpm -s cvs prompt review-readings <pid> <key>` – đúng prompt của đường API (quy tắc đọc số/ngày/đơn vị/viết tắt/mã tiêu chuẩn,
   mọi câu kèm `id` = `sN#idx`, `text`, `tts`, `warnings`). `pnpm -s cvs readings <pid> <key>` in cùng các câu (kèm đề xuất đang chờ).
2. Đọc **từng câu**, kể cả câu không có cảnh báo: số/phần trăm/ngày/đơn vị đọc sai hoặc khác nghĩa với `text` (2,78 → "hai phẩy bảy mươi tám",
   60% → "sáu mươi phần trăm"), viết tắt (HSE, ILO, PPE…), từ tiếng Anh, mã tiêu chuẩn (ISO 45001 → "i sô bốn lăm nghìn không trăm linh một"),
   ký hiệu, câu đọc ngượng. Câu đã ổn thì bỏ qua ("các bon" cho carbon là được). Không đổi ý, giữ nguyên thẻ `[nghỉ …]`.
3. Mỗi câu cần đổi: `pnpm -s cvs suggest-reading <pid> <key> <sid> <idx> "<toàn bộ câu đã sửa>" --reason "<lý do ngắn tiếng Việt>"`
   (+ `--glossary "cụm=cách đọc"` cho thuật ngữ lặp lại). Cùng một cụm đọc giống nhau trong cả khoá.
4. `pnpm -s cvs done <reqId> "<n> đề xuất – mở bước Chuẩn hoá cách đọc, tab Đề xuất của Claude để duyệt>"`.

Ghi file tạm vào thư mục scratchpad của phiên, không vào repo. Khi ứng dụng tự chạy Claude Code (nút trong app), chỉ được ghi vào
`storage/claude-code-tmp/` và chỉ được chạy `pnpm cvs …` / `pnpm -s cvs …` (mỗi lệnh riêng, không nối `&&`/`|`): ghi JSON/SVG/mã cảnh ra tệp ở đó rồi truyền đường dẫn cho `set-*`.

## Quy tắc chất lượng (giống hệt đường API – nguồn: `packages/ai/src/index.ts`)

Prompt từ `pnpm cvs prompt` đã chứa đủ; tóm tắt để không quên:
- `RULES`: **không bịa số liệu** (số, ngày, mã phiên bản, tổ chức chỉ lấy từ kịch bản/nguồn); mọi chữ/nhãn tự thêm phải nằm trong
  `assumptions`; verification = thẩm tra, validation = thẩm định, viết "TUV NORD"; một ý mới mỗi lần; không vẽ logo/giao diện tổ chức thật;
  nhãn ≤ 6 từ, câu trên màn hình ≤ 14 từ.
- `MOTION_CHECKLIST`: một ý mỗi cảnh, mỗi câu thoại một tiêu điểm; chọn template theo **hình dạng** thông tin; rải `at: {cue, f}` theo câu nói
  tới ý đó (phần chính f 0.05–0.2, phụ 0.3–0.7), không dồn vào câu 0; nhấn 1–2 cụm bằng `**…**`; màu theo vai trò (warn chỉ cho rủi ro).
- Chữ ≥ 28 px, vùng an toàn x 96–1824, y 54–1026; chừa chỗ cho dấu tiếng Việt.
- `ILLUSTRATION_RULES`: viewBox 0 0 800 600, chỉ g/path/circle/ellipse/rect/line/polyline/polygon, không chữ, màu chỉ `var(--…)` của theme,
  nét `stroke-width` theo theme (có trong prompt), 3–7 nhóm `part-N` theo thứ tự hiện, viền chính `class="draw" pathLength="1"`.
- Cảnh tùy biến: `CUSTOM_SCENE_CHECKLIST` + hợp đồng file (`HF_CONTRACT`/`RMT_CONTRACT` trong `packages/studio/src/pipeline.ts`) – hợp đồng thắng.
- Sửa cách đọc: số → chữ kiểu Việt, ngày → "ngày … tháng … năm …", viết tắt đọc theo chữ cái tiếng Việt; không thêm bớt ý.
