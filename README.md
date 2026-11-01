# Course Video Studio

Ứng dụng web chạy trên máy Windows (localhost) để **tạo video bài giảng e-learning MP4 1920×1080 tự động** từ file Word (.docx) hoặc Excel (.xlsx) chứa kịch bản, dàn ý, hoặc chỉ chủ đề + yêu cầu.

- Giọng đọc tiếng Việt qua **CIT Voice Studio** (chạy cục bộ `http://127.0.0.1:8001`), dự phòng Edge TTS.
- Hình chuyển động khớp từng câu thoại, dựng bằng **HyperFrames** (HTML + GSAP, mặc định) hoặc **Remotion** (React) – chọn cho cả dự án hoặc từng video.
- Thuật ngữ, con số, ngày tháng được chuẩn hóa cách đọc trước khi tạo giọng.
- **Claude** (`claude-opus-5-5`) viết kịch bản từ dàn ý, chọn template/điền tham số cảnh, viết cảnh tùy biến, soát hình bằng ảnh chụp.
- Người dùng duyệt ở từng bước; xuất video theo thư mục cấp độ kèm `DANH_MUC_VIDEO.txt`.

**Nguyên tắc:** giọng đọc là đồng hồ (mọi chuyển động đặt theo mốc câu `at(i, f)`, không giây cứng) · nội dung là dữ liệu (kịch bản → JSON, hình dựng lại được bất kỳ lúc nào) · một nguồn sự thật cho cả hai bộ dựng · không bịa số liệu (chữ AI tự thêm luôn được đánh dấu vàng để duyệt).

---

## 1. Cài đặt (Windows)

**Cần có**

| Thành phần | Ghi chú |
|---|---|
| Windows 10/11 64-bit | |
| [Node.js 22 LTS](https://nodejs.org) | Bắt buộc ≥ 22 (CLI HyperFrames yêu cầu Node 22). |
| CIT Voice Studio | Chạy trên **cùng máy** với ứng dụng, cổng mặc định 8001. |
| Internet lần cài đầu | Tải thư viện, ffmpeg, Chromium cho Playwright/HyperFrames/Remotion. |
| Khóa Claude API (tùy chọn) | Để viết kịch bản bằng AI, thiết kế cảnh bằng AI, soát hình. Không có khóa: thiết kế cảnh dùng chế độ tự động. |
| Python + `pip install edge-tts` (tùy chọn) | Chỉ cho giọng dự phòng Edge TTS. |
| Python ≥ 3.10 (tùy chọn) | Chỉ cho giọng thứ hai ZeroTTS (ứng dụng tự tạo venv riêng khi bạn bấm Cài). |

**Chạy**

1. Tải mã nguồn về (ví dụ `C:\CourseVideoStudio`).
2. Nhấp đúp **`KHOI_DONG.cmd`**. Lần đầu script sẽ: bật pnpm, tạo `.env` từ `.env.example`, `pnpm install`, `pnpm run cai-dat` (kiểm tra phông tiếng Việt, ffmpeg, tải Chromium cho Playwright + `npx hyperframes browser ensure` + Remotion, kiểm tra CIT, dựng giao diện).
3. Trình duyệt tự mở `http://localhost:3000`. Đóng cửa sổ dòng lệnh để dừng ứng dụng.
4. Mở CIT Voice Studio trước khi làm giọng. Nếu không kết nối được, ứng dụng báo rõ **"Hãy mở CIT Voice Studio"** (đèn đỏ ở bước 5/7).

Không có Windows? Trên macOS/Linux: `pnpm install && pnpm run cai-dat && pnpm start`.

### Cấu hình `.env`

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `CIT_TTS_BASE_URL` | `http://127.0.0.1:8001` | Địa chỉ CIT Voice Studio |
| `CIT_TTS_API_KEY` | (trống) | Nếu có, gửi kèm header `X-API-Key` |
| `CVS_VOICE_MALE` / `CVS_VOICE_FEMALE` | `Hải Đăng` / `Trúc Ly` | Giọng mặc định (tên có dấu như trong CIT) |
| `ANTHROPIC_API_KEY` | (trống) | Khóa Claude API |
| `CVS_CLAUDE_MODEL` | `claude-opus-5-5` | Model Claude |
| `CVS_WORKER_CONCURRENCY` | `4` | Số job chạy song song |
| `CVS_RENDER_CONCURRENCY` | `1` | Số video render cùng lúc |
| `CVS_HF_RENDERER` | `auto` | `auto` = `npx hyperframes render`, lỗi thì render dự phòng; `cli`; `fallback` |
| `CVS_REMOTION_CONCURRENCY` | `2` | Concurrency của Remotion (khuyến nghị 1–2) |
| `CVS_REMOTION_BROWSER`, `CVS_CHROMIUM_PATH` | (trống) | Đường dẫn Chrome tùy chọn |
| `CVS_STORAGE` | `./storage` | Thư mục lưu trữ |
| `CVS_TTS_MOCK` | `0` | `1` = giọng **giả lập** (chỉ để thử luồng khi chưa có CIT) |
| `PYTHON` | `python` | Python cho Edge TTS |
| `CVS_ZEROTTS_AUTO_INSTALL` | `0` | `1` = tự cài ZeroTTS khi khởi động/`pnpm run cai-dat` (mặc định chỉ cài khi bấm nút) |
| `CVS_ZEROTTS_MANAGE` | `1` | `0` = không tự chạy/theo dõi máy chủ ZeroTTS |
| `CVS_ZEROTTS_INT8` | `1` | Dựng bản int8 khi cài (nhanh hơn trên CPU thường); `0` = dùng bản fp32 |
| `CVS_ZEROTTS_URL` / `CVS_ZEROTTS_PORT` | `http://127.0.0.1:8002` / `8002` | Địa chỉ máy chủ ZeroTTS cục bộ |
| `CVS_ZEROTTS_PYTHON` | (trống) | Python ≥ 3.10 dùng để tạo venv (trống = `py -3` / `python3` / `python`) |
| `CVS_ZEROTTS_DIR` | `vendor/zerotts` | Thư mục venv, mô hình, nhật ký `server.log` |

---

## 2. Quy trình trên giao diện (10 bước)

1. **Tải tài liệu** – tạo dự án (tên khóa, mã khóa, cấp độ), kéo-thả nhiều file .docx/.xlsx, chọn cấp độ cho từng lượt tải. Excel có tiêu đề cột khác mẫu → **ghép cột** ngay trên màn hình.
2. **Phân tích** – danh sách video (mã, tiêu đề, số cảnh, thời lượng kịch bản/ước tính, trạng thái); tick video cần làm, đánh dấu video **đã có sẵn**; cảnh báo trùng tên file giữa các cấp độ; dàn ý/chủ đề → nút **"Viết kịch bản bằng AI"**.
3. **Kịch bản** – sửa theo cảnh: mô tả hình, chữ trên màn hình, mỗi câu một dòng với cột **lời thoại** và cột **cách đọc**; mục "AI tự quyết" hiện màu vàng; chọn template + tham số cảnh (tùy chọn).
4. **Soát cách đọc** – bảng trước → sau của mọi câu bị đổi, cảnh báo còn chữ số/cụm viết hoa, sửa nhanh (khóa câu sửa tay), **nghe thử từng câu**, bảng thuật ngữ của dự án và dùng chung.
5. **Giọng & nhịp** – đèn trạng thái CIT, cấu hình theo cấp độ (xen kẽ nữ/nam, một giọng), tốc độ, nhịp lead/gap/tail từng video, **Nghe thử** nhiều giọng × tốc độ.
6. **Phong cách & bộ dựng** – dựng **cùng một khung mẫu theo mọi phong cách** để so sánh; chọn theme và bộ dựng cho dự án hoặc từng video; **"Dựng lại bằng bộ kia"** (giữ giọng và timing).
7. **Sản xuất** – hàng đợi job, mỗi video có tiến độ riêng: Giọng → Cắt/giãn → Timing → Dựng cảnh → QA → Render; nút **Tạm dừng / Tiếp tục / Thử lại bước lỗi / Chỉ dựng lại hình (giữ giọng) / Chỉ làm lại giọng / Thiết kế lại (AI)**; nhật ký từng job.
8. **Xem & duyệt** – trình phát có phụ đề, ảnh ghép khung cuối cảnh, báo cáo QA, danh sách "AI tự quyết"; **Duyệt** hoặc **Ghi chú sửa** (ngôn ngữ tự nhiên, AI sửa đúng cảnh đó); nút "AI viết cảnh tùy biến".
9. **Xuất** – `storage/projects/<id>/out/Cap_do_1/<mã>.mp4` …, kèm `DANH_MUC_VIDEO.txt` (UTF-8 BOM, CRLF: mã, thời lượng, tiêu đề, giọng, phong cách); chỉ video **đã duyệt** (QA chặn xuất nếu không đạt, trừ khi chủ động bỏ qua); nút **Mở thư mục**.
10. **Dọn dẹp** – giọng thô/cũ, file tạm, bộ nhớ đệm xem trước, bản render thử; xác nhận trước và **chuyển vào `_luu_tru/<thời điểm>`** thay vì xóa.

---

## 3. Kiến trúc

```
apps/web            Next.js 15 + React 19 + Tailwind 4 – giao diện thuần; /api/* proxy tới worker
apps/worker         Node 22 + TypeScript (tsx) – API HTTP (Hono) + hàng đợi job trên SQLite
packages/core       Kiểu dữ liệu, bóc docx (mammoth) / xlsx (exceljs), tách câu, chuẩn hóa cách đọc, mã video, timing
packages/tts        Client CIT Voice Studio, Edge TTS dự phòng, gán mốc câu từ cues, cắt im lặng, giãn nhịp, manifest
packages/themes     các theme (`THEMES` – token → CSS variables), phông tiếng Việt thu gọn nhúng base64, kiểm tra cmap
packages/engine     Giao diện RenderEngine, SceneSpec, 13 template cảnh có tham số, ease (giống GSAP), biểu tượng, đo bố cục
packages/engine-hf  HyperFrames: sinh index.html + compositions/sN.html, lint hợp đồng cảnh, preview (Playwright), render CLI + dự phòng
packages/engine-rmt Remotion: composition, phát SceneSpec bằng interpolate, cảnh TSX tùy biến, renderMedia/renderStill
packages/ai         Claude API: dàn ý, kịch bản, chọn template + tham số, cảnh tùy biến, soát hình (vision)
packages/qa         QA âm thanh, nội dung (số liệu so với nguồn, thuật ngữ), bố cục
packages/db         SQLite (better-sqlite3): projects, files, videos, jobs, glossary, voices
packages/studio     Dịch vụ ứng dụng: nhập file, pipeline sản xuất, xuất, dọn dẹp, nghe thử, so sánh phong cách
storage/projects/<id>/{source, data, vo, frames, hf, rmt, render, out, _luu_tru}
```

**Dữ liệu.** Mỗi video là một JSON (`Video` → `Scene[]` → `sentences{text, tts}` + `design` + `assumptions`) lưu trong bảng `videos` và đồng thời ghi `data/<mã>.json` theo kiểu nguyên tử. Cảnh và câu nằm trong JSON (không tách bảng) để đúng nguyên tắc "nội dung là dữ liệu" và để hai bộ dựng đọc cùng một nguồn.

**Mã video** = `<Khóa>-<Cấp độ>_<Học phần>_<Unit>_<STT>`, ví dụ `CAR-L1_MO1_U1.5_1` – luôn có tiền tố cấp độ vì các cấp có thể trùng tên file.

### Hai bộ dựng, một SceneSpec

Mỗi template cảnh được viết **một lần** dưới dạng `SceneSpec` = markup + CSS dùng lớp/biến theme + các rãnh chuyển động `{phần tử, from, to, at: {cue, f}, dur, ease}`.

- **HyperFrames** biên dịch SceneSpec thành `compositions/sN.html` đúng hợp đồng mục 6A.3: chú thích mở đầu, `<template>`, `#root`, khối `const T = /*TIMING*/…/*/TIMING*/;`, `at(i, f)`, một timeline paused chỉ dùng `fromTo`, đăng ký `window.__timelines["sN"]`, id có tiền tố `sN-`, ra cảnh blur 8 px tại `T.dur − 0.45`. Số đếm lên dùng tween `textContent` + `modifiers` (không phụ thuộc callback vì runtime tua với `suppressEvents`).
- **Remotion** phát cùng SceneSpec bằng `interpolate` với hàm ease cùng công thức GSAP (`<Sequence>` mỗi cảnh, `<Audio>` theo `lead`).

Vì vậy cùng tham số cho cùng hình ở cả hai bộ dựng (đo được: SSIM 0,997 giữa hai bản render) và "Dựng lại bằng bộ kia" không phải làm lại giọng. Khi không template nào phù hợp, AI viết **cảnh tùy biến** theo hợp đồng của bộ dựng đang chọn (HTML/GSAP hoặc TSX chỉ import `remotion`, `react`, `../lib`), mã được lint và chạy thử trước khi dùng.

**Template:** `title-card`, `split-compare`, `stat-hero`, `icon-grid`, `flow-chain`, `bar-compare`, `process-steps`, `timeline-run`, `document-transform`, `cause-effect`, `checklist`, `quote-banner`, và `draft` (cảnh nháp "BẢN NHÁP" hiện lời thoại theo mốc để duyệt nhịp). Mọi chữ template/AI thêm không có trong kịch bản tự động vào `assumptions`.

**Theme** (danh sách đầy đủ: `THEMES` trong `packages/themes/src/tokens.ts`): Giấy kỹ thuật · Tối điện ảnh · Minh họa phẳng tươi sáng · Biên tập tạp chí · Bảng trắng vẽ tay (nét bút dạ dùng `feTurbulence` + `feDisplacementMap`) · Doanh nghiệp xanh · Bản thiết kế · Tối giản Thụy Sĩ · Rừng đêm · Pastel học đường · Cảnh báo an toàn · Mực coban · Kỹ thuật số tối · Ấm mộc · Khối màu tạp chí · Danh mục tĩnh (6 theme cuối phỏng theo ý tưởng bộ khung hình mẫu HeyGen HyperFrames, Apache-2.0). Mọi màu chữ đạt tương phản WCAG ≥ 4,5:1 trên nền và thẻ (`packages/themes/test/contrast.test.ts`, trừ vài màu vai trò ở theme cũ được liệt kê). Phông theme và cặp phông – bản thu gọn Latin + Latin-ext + Vietnamese, nhúng base64 (HyperFrames: `@font-face` trong `index.html`; Remotion: `new FontFace(…, ArrayBuffer)` + `document.fonts.add` **đồng bộ, không `delayRender`**). Ký hiệu (→ ✓ ≈ ≤ ≥ …) lấy từ DejaVu Sans thu gọn; chỉ số dưới (CO₂) hiển thị bằng `<sub>` trong chính phông theme.

### Giọng đọc

- Đọc **liền cả cảnh trong một lần gọi** `POST /api/tts/generate-with-subtitles`; gán mốc từng câu từ `cues` theo tỉ lệ ký tự; câu đầu bắt đầu ở `min(cue0.start, 0.3)`, câu cuối kết thúc ở cuối file.
- Timeout 10 phút/yêu cầu, thử lại 3 lần × 5 s; lỗi 4xx dừng ngay; "fetch failed" → "Hãy mở CIT Voice Studio rồi bấm Thử lại".
- Cắt im lặng đầu/cuối (−45 dB, ≥ 0,15 s; giữ 0,05 s đầu, 0,2 s cuối); **giãn nhịp** chỉ tại chỗ ngắt hơi có sẵn (RMS < −40 dB, ≥ 0,08 s, ±1,2 s quanh mốc câu) cho đủ `pace.gap` – không bao giờ cắt/chèn giữa từ; WAV → MP3 160 kbps.
- `vo/manifest.json`: `hash = sha1(provider, voice, speed, gap, tts)`; chỉ tạo lại cảnh đổi hash; file giọng có hash trong tên (tránh lưu đệm bản cũ); ghi nguyên tử + kiểm tra hash.
- Thời lượng cảnh = `lead + audioDur + tail`; mốc câu = `lead + cue`. Chưa có giọng: ước tính 3,1 tiếng/giây × tốc độ × hệ số cấp độ, đánh dấu `estimated`.

### Giọng thứ hai: ZeroTTS

[ZeroTTS](https://github.com/zeroweight-ai/ZeroTTS) – mô hình đọc tiếng Việt chạy CPU (ONNX, không cần GPU), **mã và trọng số giấy phép MIT**, âm thanh 48 kHz. CIT Voice Studio vẫn là mặc định; ZeroTTS là lựa chọn thêm trên trang **Giọng đọc** (nút "ZeroTTS (MIT, 8 giọng)").

- **Giọng:** nữ `maichi` (Mai Chi), `baotrang` (Bảo Trang), `kimoanh` (Kim Oanh), `hamy` (Hà My); nam `giahuy` (Gia Huy), `huuduc` (Hữu Đức), `quangminh` (Quang Minh), `tiendat` (Tiến Đạt). Nghe thử / Dùng giọng này / áp dụng theo dự án, cấp độ, từng video như giọng CIT.
- **Cài:** chỉ khi bấm **Cài ZeroTTS** (hoặc đặt `CVS_ZEROTTS_AUTO_INSTALL=1`). Ứng dụng tìm Python ≥ 3.10 (`py -3` / `python3` / `python`; Windows chưa có thì cài từ python.org, tích *Add python.exe to PATH*), tạo venv `vendor/zerotts/.venv`, `pip install zerotts fastapi uvicorn` (+ `onnx` cho bước int8), tải mô hình từ Hugging Face vào `vendor/zerotts/hf` (~300–900 MB), rồi dựng **bản int8** vào `vendor/zerotts/model-int8` bằng `packages/tts/zerotts/quantize_onnx_int8.py` (script của ZeroTTS; RTF giảm khoảng một nửa trên CPU DDR4 thường; lỗi int8 thì tự dùng bản fp32). Tắt int8: `CVS_ZEROTTS_INT8=0`.
- **Chạy:** đã cài thì worker tự chạy `packages/tts/zerotts/server.py` tại `127.0.0.1:8002` (chỉ máy cục bộ), chờ `/health`, kiểm tra 30 s/lần và bật lại nếu tắt. API: `GET /health`, `GET /v1/voices`, `POST /v1/audio/speech-with-segments {input, voice, speed?, temperature?, seed?}` → `{audio_base64 (WAV 16-bit 48 kHz), sample_rate, segments:[{text,start,end}]}`; mỗi đoạn là một câu (câu dài > ~15 s được chia nhỏ), mốc tính từ số mẫu thật, giữa các đoạn chèn 0,15 s im lặng; một yêu cầu tại một thời điểm.
- **Đọc:** máy chủ gọi `normalize_vi_text` (số, ngày tháng, viết tắt → chữ) và `chunk_text(normalize_punctuation(…))` trước khi đọc. Mốc câu đi qua đúng đường gán mốc/cắt im lặng/giãn nhịp như CIT. **ZeroTTS không có tham số tốc độ**: ứng dụng đổi tốc độ bằng ffmpeg `atempo` (giữ cao độ) và co mốc tương ứng. Độ biểu cảm (temperature) → `audio_temperature`; seed → cố định ngẫu nhiên. Thẻ CIT: `[nghỉ 2s]`/`[nghỉ 500ms]` → chèn khoảng lặng (tối đa 2,4 s), thẻ biểu cảm (`[cười]`…) bị bỏ.
- **Sự cố:** xem `vendor/zerotts/server.log`; bấm "Khởi động lại" trên trang Giọng đọc; cài lại = xoá `vendor/zerotts` rồi bấm Cài. Giấy phép: xem `THIRD-PARTY.md`.

### QA tự động (chặn xuất nếu không đạt)

Chụp khung tại mỗi mốc câu + 1,5 s và `dur − 0,6` của mọi cảnh; đo DOM (tràn vùng an toàn x 96–1824/y 54–1026, chữ chồng nhau, chữ < 28 px, chữ tràn thẻ, thẻ thiếu `box-sizing`); Claude soát ảnh theo checklist và tự sửa tối đa 2 vòng; âm thanh có AAC, `silencedetect −45 dB d=2.5` không có đoạn nào, thời lượng khớp timing ±0,2 s; mọi con số trên màn hình phải có trong văn bản nguồn; thuật ngữ bắt buộc (verification = **thẩm tra**, validation = **thẩm định**, "TUV NORD").

---

## 4. Lệnh cho nhà phát triển

```bash
pnpm install
pnpm run cai-dat        # tải trình duyệt, kiểm tra phông/ffmpeg/CIT, dựng giao diện
pnpm dev                # web (3000) + worker/API (3001) chế độ phát triển
pnpm start              # chạy bản đã dựng
pnpm test               # 172 test: chuẩn hóa cách đọc (≥ 60 ca), bóc docx/xlsx, gán mốc câu, chèn nhịp, CIT client, lint cảnh (24 ca), engine
pnpm test:render        # render video mẫu ~20 s × mọi theme × HyperFrames & Remotion, so sánh thời lượng và tiếng (~15 phút)
pnpm gallery            # ảnh mọi template × mọi theme vào tests/.out/gallery
pnpm mock-cit           # máy chủ CIT GIẢ LẬP ở cổng 8001 (âm thử, không phải giọng thật)
pnpm e2e                # đầu-cuối không cần giao diện (đặt CVS_TTS_MOCK=1 nếu chưa có CIT)
pnpm fixtures           # sinh lại file mẫu: 2 video docx, 1 outline, 1 xlsx
```

---

## 5. Khác biệt so với đặc tả và lý do

| Đặc tả | Thực hiện | Lý do |
|---|---|---|
| Node 20 | **Node 22** | CLI `hyperframes` yêu cầu Node ≥ 22. |
| Template có hai bản cài đặt (HTML/GSAP và TSX) | Một **SceneSpec** + hai bộ phát (HyperFrames biên dịch ra GSAP, Remotion phát bằng `interpolate`) | Bảo đảm cùng tham số cho cùng hình, không phải bảo trì hai bản. Cảnh TSX tùy biến vẫn được hỗ trợ. |
| Thu gọn phông bằng pyftsubset/subset-font, xuất woff | Dùng bản đã thu gọn sẵn của Fontsource (latin, latin-ext, vietnamese) dạng **woff2** + `unicode-range`; `subset-font` cho phông ký hiệu | Nhỏ hơn, không cần Python; vẫn nhúng base64 và kiểm tra cmap khi cài. |
| Next.js gọi DB/worker trực tiếp | Next.js chỉ là giao diện; `/api/*` proxy tới API trong tiến trình worker | Tránh để bundler Next đóng gói module native (SQLite, Playwright, ffmpeg, Remotion) – ổn định hơn trên Windows. |
| Bảng `scenes`, `sentences` | Nằm trong JSON video | Một nguồn sự thật cho cả hai bộ dựng. |
| BullMQ + Redis | Hàng đợi trên SQLite | Không cần cài Redis trên Windows; job chạy lại được sau khi tắt máy. |

---

## 6. Xử lý sự cố

- **"Hãy mở CIT Voice Studio"** – mở CIT, kiểm tra `CIT_TTS_BASE_URL`, rồi bấm "Thử lại bước lỗi" ở bước 7 (các cảnh đã có giọng đúng hash được bỏ qua).
- **CIT trả lỗi 4xx** – thường do sai tên giọng (phải đúng dấu, ví dụ "Hải Đăng") hoặc sai `CIT_TTS_API_KEY`.
- **Render HyperFrames CLI lỗi** – chế độ `auto` tự chuyển sang render dự phòng (Playwright tua từng khung 30 fps → ffmpeg libx264 CRF 18 + `adelay`/`amix` → AAC 192 kbps).
- **Remotion không tải được Chrome** – đặt `CVS_REMOTION_BROWSER` trỏ tới một Chrome Headless Shell có sẵn.
- **Video mới vẫn hiện bản cũ** – file giọng/khung có hash trong tên và ghi nguyên tử; nếu vẫn lỗi, bấm Ctrl+F5.
- Nhật ký job: `storage/logs/job-<số>.log` (link "log" ở bước 7).

---

## 7. Báo cáo các giai đoạn

| Giai đoạn | Kết quả demo với file mẫu |
|---|---|
| 1. Core: bóc tài liệu + chuẩn hóa + timing | `Kich_ban_L1.docx` → 2 video (đoạn văn và dạng bảng), nguồn + ngữ cảnh bảng số liệu; `Outline_L2.docx` → nhận diện dàn ý; `Kich_ban_L2.xlsx` → 2 sheet/2 học phần, tự nhận cột tiếng Việt và tiếng Anh. 88 ca chuẩn hóa cách đọc đạt (toàn bộ ví dụ mục 4). |
| 2. Client CIT + manifest | Thử lại khi 5xx, dừng khi 4xx, báo "Hãy mở CIT"; cắt/giãn nhịp đúng chỗ ngắt; hash bỏ qua cảnh không đổi. |
| 3. HyperFrames | `npx hyperframes render` chạy thẳng trên dự án sinh ra; render dự phòng cho hình giống hệt; mọi template × mọi theme soát bằng ảnh ghép. |
| 4. Remotion | Cùng video: thời lượng khớp tuyệt đối, SSIM 0,997 so với HyperFrames, đường bao giọng tương quan 0,994. |
| 5–7. Giao diện, AI, QA | Luồng tải file → phân tích → soát đọc → sản xuất → QA → duyệt → xuất chạy được qua giao diện (đã kiểm bằng Playwright, `tests/ui`). |
| 8. Template còn lại + dọn dẹp | Đủ 12 template + cảnh nháp; dọn dẹp chuyển vào `_luu_tru`. |

**Chưa kiểm được trong môi trường phát triển (cần làm trên máy thật):** giọng CIT Voice Studio thật (đã kiểm bằng máy chủ CIT giả lập cùng API), các chức năng gọi Claude API (chưa có khóa – mã đã viết theo SDK chính thức, có bật fallback khi bị từ chối), Edge TTS, và chạy trên Windows.
