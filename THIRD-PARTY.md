# Thành phần bên thứ ba

## ZeroTTS (giọng thứ hai, tuỳ chọn)

- Nguồn: https://github.com/zeroweight-ai/ZeroTTS · trọng số: https://huggingface.co/zeroweight-ai/ZeroTTS · gói PyPI `zerotts`
- Bản quyền (c) 2026 ZeroWeight AI – **MIT License** (cả mã và trọng số).
- Ứng dụng **không đóng gói sẵn** ZeroTTS: chỉ khi người dùng bấm "Cài ZeroTTS" mới `pip install zerotts` vào `vendor/zerotts/.venv`
  và tải trọng số từ Hugging Face vào `vendor/zerotts/hf`.
- `packages/tts/zerotts/quantize_onnx_int8.py` sao nguyên văn từ `tools/quantize_onnx_int8.py` của ZeroTTS (commit 319c3e0), giấy phép MIT.
- `packages/tts/zerotts/server.py` là mã của Course Video Studio (bọc HTTP quanh API Python của ZeroTTS).
- Trọng số ZeroTTS kèm bộ giải mã MOSS-Audio-Tokenizer-Nano (OpenMOSS Team, Apache-2.0) và bảng viết tắt từ soe-vinorm (vinhdq842, MIT) –
  xem file `NOTICE` trong kho ZeroTTS.

Văn bản giấy phép MIT của ZeroTTS:

```
MIT License

Copyright (c) 2026 ZeroWeight AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## CIT Voice Studio (giọng mặc định)

- Nguồn: https://github.com/Cuongyd196/cit-voice-studio – dùng CIT là đồng ý Điều khoản sử dụng:
  https://github.com/Cuongyd196/cit-voice-studio/blob/main/DIEU-KHOAN.md

## Nhạc nền và ảnh miễn phí (nội dung của người dùng)

Ứng dụng **không kèm** nhạc hay ảnh nào; người dùng tự chọn và chịu trách nhiệm về quyền dùng.

- **Nhạc nền:** chỉ dùng nhạc bạn có quyền dùng thương mại (nhạc tự sở hữu, CC0, CC BY – nhớ ghi tác giả, hoặc thư viện có giấy phép rõ ràng như YouTube Audio Library / Pixabay Content License – đọc điều khoản của từng nơi). Ghi giấy phép vào ô *Giấy phép / nguồn nhạc*; nội dung này được đưa vào `DANH_MUC_VIDEO.txt` khi xuất.
- **Openverse** (https://openverse.org, API `api.openverse.org`) và **Wikimedia Commons** (https://commons.wikimedia.org, API `w/api.php`): ứng dụng chỉ hiện ảnh CC0, Public Domain Mark, CC BY, CC BY-SA. CC BY/BY-SA **bắt buộc ghi tác giả, tiêu đề, nguồn và giấy phép** – ứng dụng tự ghi trên cảnh và trong `credits.txt`; CC BY-SA còn yêu cầu bản phái sinh **của ảnh** (ảnh đã chỉnh sửa) dùng cùng giấy phép. Siêu dữ liệu giấy phép do nguồn cung cấp – hãy mở liên kết "nguồn" để kiểm tra trước khi dùng cho sản phẩm thương mại; ảnh có người/nhãn hiệu có thể cần thêm quyền chân dung/nhãn hiệu.
- **Pexels** (https://www.pexels.com/license/): cần khoá API miễn phí của người dùng; ảnh dùng thương mại được, không bắt buộc ghi công nhưng điều khoản API yêu cầu ghi nguồn Pexels và tác giả khi hiển thị – ứng dụng ghi trong `credits.txt`. Giới hạn mặc định của Pexels: 200 yêu cầu/giờ.
- Ứng dụng gọi các API trên với User-Agent `CourseVideoStudio/<phiên bản>` (không kèm thông tin cá nhân), tuần tự và cách nhau ≥ 1,1 s mỗi máy chủ.

## lemo-opuscar (phong cách phim mẫu)

- Nguồn: https://github.com/lemomo-ai/lemo-opuscar (commit bebbbe1, 2026-11-01) – © 2026 LemoLab.
- `packages/themes/film-styles/*.md`: sao nguyên văn `styles/<slug>/STYLE.md` – **MIT License** (văn bản bên dưới).
- `packages/themes/film-styles/index.json`: trích từ `styles/<slug>/style.json` (MIT).
- `packages/themes/film-styles/posters/*.jpg`: ảnh poster của LemoLab, **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/) –
  **đã thu nhỏ** từ 1920×1080 xuống 480 px. Ghi công: "LemoLab – lemo-opuscar, https://github.com/lemomo-ai/lemo-opuscar".
- Không lấy mã dựng hình canvas/three.js, phông, âm thanh, giọng đọc hay tư liệu bên thứ ba trong các bản demo.

```
MIT License

Copyright (c) 2026 LemoLab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

