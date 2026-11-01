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
