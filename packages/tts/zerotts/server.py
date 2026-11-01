# Máy chủ HTTP cục bộ cho ZeroTTS (MIT – https://github.com/zeroweight-ai/ZeroTTS), do Course Video Studio tự chạy.
# Chỉ nghe 127.0.0.1. Một yêu cầu tổng hợp tại một thời điểm (khóa) – mô hình chạy CPU.
#
#   GET  /health                          → {"status":"ok","sample_rate":48000,...} (chỉ trả lời khi đã nạp xong mô hình)
#   GET  /v1/voices                       → {"object":"list","data":[{id,name,gender,tags,description}]}
#   POST /v1/audio/speech-with-segments   {input, voice, speed?, temperature?, seed?}
#        → {audio_base64 (WAV 16-bit mono), sample_rate, segments:[{text,start,end}], speed_applied:false}
#
# ZeroTTS không có tham số tốc độ: "speed" được nhận nhưng KHÔNG áp dụng ở đây – ứng dụng giãn bằng ffmpeg atempo.
# Biến môi trường: ZEROTTS_MODEL (repo HF hoặc thư mục, ví dụ bản int8), ZEROTTS_THREADS, CVS_ZEROTTS_PORT,
# CVS_ZEROTTS_GAP (giây im lặng giữa các đoạn, mặc định 0.15), CVS_ZEROTTS_FAKE=1 (giọng giả: sóng sin, cho test).

from __future__ import annotations

import base64
import io
import os
import threading
import wave

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from zerotts import normalize_vi_text
from zerotts.chunking import chunk_text, clean_segment_punctuation, normalize_punctuation, split_sentences

FAKE = os.environ.get("CVS_ZEROTTS_FAKE") == "1"
MODEL = os.environ.get("ZEROTTS_MODEL") or "zeroweight-ai/ZeroTTS"
THREADS = int(os.environ.get("ZEROTTS_THREADS") or max(1, min(8, os.cpu_count() or 4)))
PORT = int(os.environ.get("CVS_ZEROTTS_PORT") or 8002)
GAP = float(os.environ.get("CVS_ZEROTTS_GAP") or 0.15)

# 8 giọng có sẵn (docs/VOICES.md) – dùng khi chạy giả hoặc gói giọng thiếu meta.json.
BUILTIN = {
    "maichi": ("Mai Chi", "nữ", ["trẻ", "kể chuyện", "nhẹ nhàng", "thân thiện"]),
    "baotrang": ("Bảo Trang", "nữ", ["trưởng thành", "tin tức", "rõ ràng", "trung tính"]),
    "kimoanh": ("Kim Oanh", "nữ", ["trung niên", "kể chuyện", "ấm áp", "truyền cảm"]),
    "hamy": ("Hà My", "nữ", ["trẻ", "hoạt hình", "cao", "biểu cảm"]),
    "giahuy": ("Gia Huy", "nam", ["trẻ", "kể chuyện", "trầm ấm", "tâm tình"]),
    "huuduc": ("Hữu Đức", "nam", ["lớn tuổi", "kể chuyện", "trầm", "điềm đạm"]),
    "quangminh": ("Quang Minh", "nam", ["trẻ", "tin tức", "rõ ràng", "dứt khoát"]),
    "tiendat": ("Tiến Đạt", "nam", ["trẻ", "bình luận", "sôi nổi", "năng lượng cao"]),
}


class FakeTTS:
    """Thay mô hình khi CVS_ZEROTTS_FAKE=1: mỗi ký tự ~60 ms sóng sin – chỉ để kiểm thử đường đi Node ↔ Python."""

    sample_rate = 48_000

    def list_voices(self):
        return sorted(BUILTIN)

    def synthesize(self, text: str, voice=None, **_kw):
        n = int(self.sample_rate * max(0.3, 0.06 * len(text)))
        t = np.arange(n, dtype=np.float32) / self.sample_rate
        f = 140.0 + 15.0 * (sorted(BUILTIN).index(voice) if voice in BUILTIN else 0)
        return (0.3 * np.sin(2 * np.pi * f * t) * np.sin(np.pi * np.arange(n) / n)).astype(np.float32)[None, :]


def load_model():
    if FAKE:
        return FakeTTS()
    from zerotts import ZeroTTS

    return ZeroTTS.from_pretrained(MODEL, intra_op_num_threads=THREADS)


tts = load_model()
SR = int(tts.sample_rate)
VOICES = list(tts.list_voices())
lock = threading.Lock()
app = FastAPI(title="ZeroTTS (Course Video Studio)", docs_url=None, redoc_url=None)


class SpeechReq(BaseModel):
    input: str = Field(min_length=1, max_length=20_000)
    voice: str = "maichi"
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    temperature: float | None = Field(default=None, ge=0.05, le=2.0)
    seed: int | None = None
    normalize: bool = True


def voice_info(name: str) -> dict:
    meta = BUILTIN.get(name, (name, "", []))
    out = {"id": name, "name": meta[0], "gender": meta[1], "tags": list(meta[2]), "description": ""}
    if not FAKE:
        try:
            v = tts.load_voice(name)
            out.update(name=v.display_name or meta[0], gender=v.gender or meta[1], tags=list(v.tags or meta[2]), description=v.description or "")
        except Exception:  # gói giọng hỏng/thiếu meta → giữ thông tin có sẵn
            pass
    return out


def segments(text: str, normalize: bool) -> list[tuple[str, str]]:
    """(chữ gốc, chữ đọc) theo từng câu; câu dài quá ~15 s được chia nhỏ tiếp."""
    out = []
    for sent in split_sentences(normalize_punctuation(text)):
        for piece in chunk_text(sent, max_chunk_sec=15):
            spoken = clean_segment_punctuation(normalize_vi_text(piece) if normalize else piece)
            if spoken:
                out.append((piece, spoken))
    return out


def to_wav(pcm: np.ndarray) -> bytes:
    pcm16 = (np.clip(pcm, -1.0, 1.0) * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm16.tobytes())
    return buf.getvalue()


@app.get("/health")
def health():
    return {"status": "ok", "sample_rate": SR, "voices": len(VOICES), "fake": FAKE, "model": MODEL if not FAKE else "fake"}


@app.get("/v1/voices")
def voices():
    return {"object": "list", "data": [voice_info(n) for n in VOICES]}


@app.post("/v1/audio/speech-with-segments")
def speech_with_segments(req: SpeechReq):
    if req.voice not in VOICES:
        raise HTTPException(400, f"Không có giọng '{req.voice}'. Giọng có: {', '.join(VOICES)}")
    segs = segments(req.input, req.normalize)
    if not segs:
        raise HTTPException(400, "Văn bản không có chữ để đọc")
    kw = {} if req.temperature is None else {"audio_temperature": float(req.temperature)}
    parts: list[np.ndarray] = []
    cues = []
    n = 0  # vị trí hiện tại (mẫu) – mốc tính từ số mẫu thật, không ước lượng
    gap = np.zeros(int(round(GAP * SR)), np.float32)
    with lock:
        if req.seed is not None:
            np.random.seed(req.seed & 0xFFFFFFFF)  # ZeroTTS lấy mẫu bằng np.random
        try:
            for i, (orig, spoken) in enumerate(segs):
                a = np.asarray(tts.synthesize(spoken, voice=req.voice, **kw), dtype=np.float32).reshape(-1)
                if i:
                    parts.append(gap)
                    n += len(gap)
                cues.append({"text": orig, "start": round(n / SR, 3), "end": round((n + len(a)) / SR, 3)})
                parts.append(a)
                n += len(a)
        except Exception as e:  # lỗi mô hình → 500 có thông báo
            raise HTTPException(500, f"ZeroTTS lỗi: {e}") from e
    wav = to_wav(np.concatenate(parts) if parts else np.zeros(0, np.float32))
    return {"audio_base64": base64.b64encode(wav).decode("ascii"), "sample_rate": SR, "segments": cues, "speed_applied": False}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
