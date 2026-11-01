// Client ZeroTTS – giọng thứ hai (MIT, https://github.com/zeroweight-ai/ZeroTTS), máy chủ cục bộ packages/tts/zerotts/server.py
// tại http://127.0.0.1:8002. Trả về cùng dạng với CIT: WAV + mốc theo câu (cues) để align.ts/silence.ts xử lý tiếp.
// ZeroTTS không có tham số tốc độ → giãn bằng ffmpeg atempo ở đây. Thẻ CIT: [nghỉ 2s] → khoảng lặng; thẻ khác bị bỏ.

import { Agent, fetch } from "undici";
import { TTS_TAG_RE, type Cue } from "@cvs/core";
import { atempo, pcmToWav, wavToPcm } from "./ffmpeg";

export const ZEROTTS_DEFAULT_URL = `http://127.0.0.1:${process.env.CVS_ZEROTTS_PORT || 8002}`;
export const ZEROTTS_URL = (process.env.CVS_ZEROTTS_URL || ZEROTTS_DEFAULT_URL).replace(/\/+$/, "");
export const ZEROTTS_REPO = "https://github.com/zeroweight-ai/ZeroTTS";
/** Khoảng lặng tối đa chèn từ thẻ [nghỉ …] (ứng dụng không cho im lặng quá 2,5 s). */
const MAX_PAUSE = 2.4;

export type ZerottsVoice = { id: string; name: string; gender?: string; description?: string };

/** 8 giọng có sẵn của ZeroTTS (docs/VOICES.md) – hiện được cả khi chưa cài. */
export const ZEROTTS_VOICES: ZerottsVoice[] = [
  { id: "maichi", name: "Mai Chi", gender: "female", description: "Nữ · trẻ · kể chuyện · nhẹ nhàng, thân thiện" },
  { id: "baotrang", name: "Bảo Trang", gender: "female", description: "Nữ · trưởng thành · tin tức · rõ ràng, trung tính" },
  { id: "kimoanh", name: "Kim Oanh", gender: "female", description: "Nữ · trung niên · kể chuyện · ấm áp, truyền cảm" },
  { id: "hamy", name: "Hà My", gender: "female", description: "Nữ · trẻ · hoạt hình · cao, biểu cảm" },
  { id: "giahuy", name: "Gia Huy", gender: "male", description: "Nam · trẻ · kể chuyện · trầm ấm, tâm tình" },
  { id: "huuduc", name: "Hữu Đức", gender: "male", description: "Nam · lớn tuổi · kể chuyện · trầm, điềm đạm" },
  { id: "quangminh", name: "Quang Minh", gender: "male", description: "Nam · trẻ · tin tức · rõ ràng, dứt khoát" },
  { id: "tiendat", name: "Tiến Đạt", gender: "male", description: "Nam · trẻ · bình luận · sôi nổi, năng lượng cao" },
];

export class ZerottsUnavailableError extends Error {
  constructor(public cause?: unknown) {
    super("Không kết nối được ZeroTTS. Vào trang Giọng đọc, chọn ZeroTTS để cài hoặc khởi động lại, rồi bấm Thử lại.");
    this.name = "ZerottsUnavailableError";
  }
}
export class ZerottsClientError extends Error {
  constructor(public status: number, body: string) {
    super(`ZeroTTS từ chối yêu cầu (HTTP ${status}): ${body.slice(0, 300)}`);
    this.name = "ZerottsClientError";
  }
}

export type ZerottsOptions = { baseUrl?: string; timeoutMs?: number; retries?: number; retryDelayMs?: number };
export type ZerottsGenerateRequest = { text: string; voice: string; speed: number; temperature?: number; seed?: number | null };

/** Tách thẻ: [nghỉ 2s] / [nghỉ 500ms] → khoảng lặng; [cười], [thở dài]… → bỏ. */
export function splitPauses(text: string): ({ text: string } | { pause: number })[] {
  const out: ({ text: string } | { pause: number })[] = [];
  let buf = "";
  let last = 0;
  for (const m of text.matchAll(TTS_TAG_RE)) {
    buf += text.slice(last, m.index) + " ";
    last = m.index! + m[0].length;
    const p = m[0].match(/^\[\s*nghỉ\s+(\d+(?:[.,]\d+)?)\s*(ms|s|giây)?\s*\]$/iu);
    if (!p) continue;
    const sec = Number(p[1].replace(",", ".")) / (p[2]?.toLowerCase() === "ms" ? 1000 : 1);
    if (buf.trim()) out.push({ text: buf.replace(/\s+/g, " ").trim() });
    buf = "";
    if (sec > 0) out.push({ pause: Math.min(MAX_PAUSE, sec) });
  }
  buf += text.slice(last);
  if (buf.trim()) out.push({ text: buf.replace(/\s+/g, " ").trim() });
  return out;
}

const genderOf = (g: unknown) => (/^(f|nữ|nu)/i.test(String(g ?? "")) ? "female" : /^(m|nam)/i.test(String(g ?? "")) ? "male" : undefined);

export class ZerottsClient {
  readonly baseUrl: string;
  private timeoutMs: number;
  private retries: number;
  private retryDelayMs: number;
  private dispatcher: Agent;

  constructor(opts: ZerottsOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? ZEROTTS_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 15 * 60_000;
    this.retries = opts.retries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 3000;
    this.dispatcher = new Agent({ headersTimeout: this.timeoutMs, bodyTimeout: this.timeoutMs, connectTimeout: 10_000 });
  }

  private async request(path: string, init: { method: string; body?: string; timeoutMs?: number }) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? this.timeoutMs);
    try {
      return await fetch(this.baseUrl + path, {
        method: init.method,
        body: init.body,
        headers: init.body ? { "Content-Type": "application/json" } : {},
        signal: ctl.signal,
        dispatcher: this.dispatcher,
      });
    } catch (e) {
      throw new ZerottsUnavailableError(e);
    } finally {
      clearTimeout(timer);
    }
  }

  /** /health – chỉ trả lời sau khi máy chủ đã nạp xong mô hình. */
  async health(timeoutMs = 4000): Promise<{ ok: boolean; sampleRate?: number; fake?: boolean; error?: string }> {
    try {
      const r = await this.request("/health", { method: "GET", timeoutMs });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      const j: any = await r.json();
      return { ok: j.status === "ok", sampleRate: Number(j.sample_rate) || undefined, fake: !!j.fake };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Kiểm tra trạng thái (đèn xanh/đỏ) – cùng dạng với CitClient.status(). */
  async status(): Promise<{ ok: boolean; voices?: number; fake?: boolean; error?: string }> {
    const h = await this.health();
    if (!h.ok) return { ok: false, error: h.error };
    try {
      return { ok: true, voices: (await this.voices(4000)).length, fake: h.fake };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async voices(timeoutMs = 15_000): Promise<ZerottsVoice[]> {
    const r = await this.request("/v1/voices", { method: "GET", timeoutMs });
    if (!r.ok) throw new ZerottsClientError(r.status, await r.text());
    const j: any = await r.json();
    const list: any[] = Array.isArray(j) ? j : (j.data ?? j.voices ?? []);
    return list.map((v) => {
      const id = String(v.id ?? v.name);
      const known = ZEROTTS_VOICES.find((x) => x.id === id);
      const tags = Array.isArray(v.tags) ? v.tags.join(", ") : "";
      const gender = genderOf(v.gender) ?? known?.gender;
      const name = v.name && String(v.name) !== id ? String(v.name) : (known?.name ?? id);
      return { id, name, gender, description: known?.description ?? ([gender === "female" ? "Nữ" : gender === "male" ? "Nam" : "", tags].filter(Boolean).join(" · ") || undefined) };
    });
  }

  /** Một lần gọi máy chủ: WAV → PCM + mốc từng đoạn (theo câu, tính từ số mẫu). Thử lại khi lỗi máy chủ/kết nối; 4xx dừng ngay. */
  async speech(input: string, voice: string, o: { temperature?: number; seed?: number | null } = {}): Promise<{ pcm: Float32Array; sampleRate: number; cues: Cue[] }> {
    const body = JSON.stringify({ input, voice, ...(o.temperature !== undefined ? { temperature: o.temperature } : {}), ...(o.seed !== undefined && o.seed !== null ? { seed: o.seed } : {}) });
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryDelayMs));
      try {
        const r = await this.request("/v1/audio/speech-with-segments", { method: "POST", body });
        if (r.status >= 400 && r.status < 500) throw new ZerottsClientError(r.status, await r.text());
        if (!r.ok) {
          lastErr = new Error(`ZeroTTS lỗi máy chủ HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
          continue;
        }
        const j: any = await r.json();
        if (!j.audio_base64) throw new Error("ZeroTTS không trả về audio_base64");
        const { pcm, sampleRate } = wavToPcm(Buffer.from(String(j.audio_base64), "base64"));
        const cues: Cue[] = (j.segments ?? []).map((c: any) => ({ start: Number(c.start ?? 0), end: Number(c.end ?? 0), text: String(c.text ?? "") }));
        return { pcm, sampleRate: Number(j.sample_rate) || sampleRate, cues };
      } catch (e) {
        if (e instanceof ZerottsClientError) throw e;
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Đọc cả đoạn (có thể chứa thẻ CIT) → WAV + cues, đã áp dụng tốc độ. Cùng dạng CitClient.generate(). */
  async generate(req: ZerottsGenerateRequest): Promise<{ audio: Buffer; cues: Cue[]; format: "wav" }> {
    const parts: (Float32Array | number)[] = []; // số = khoảng lặng (giây), dựng sau khi biết tần số mẫu
    const cues: Cue[] = [];
    let sr = 0;
    let t = 0;
    for (const part of splitPauses(req.text)) {
      if ("pause" in part) {
        parts.push(part.pause);
        t += part.pause;
        continue;
      }
      if (!/[\p{L}\p{N}]/u.test(part.text)) continue;
      const r = await this.speech(part.text, req.voice, req);
      if (sr && r.sampleRate !== sr) throw new Error("ZeroTTS trả về tần số mẫu không nhất quán");
      sr = r.sampleRate;
      for (const c of r.cues) cues.push({ start: t + c.start, end: t + c.end, text: c.text });
      parts.push(r.pcm);
      t += r.pcm.length / sr;
    }
    if (!cues.length) throw new ZerottsClientError(400, "Văn bản không có chữ để đọc");
    const chunks = parts.map((p) => (typeof p === "number" ? new Float32Array(Math.round(p * sr)) : p));
    let pcm: Float32Array = new Float32Array(chunks.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of chunks) {
      pcm.set(p, o);
      o += p.length;
    }
    const speed = Number.isFinite(req.speed) && req.speed > 0 ? req.speed : 1;
    if (Math.abs(speed - 1) >= 1e-3) {
      pcm = await atempo(pcm, sr, speed);
      for (const c of cues) {
        c.start /= speed;
        c.end /= speed;
      }
    }
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { audio: pcmToWav(pcm, sr), cues: cues.map((c) => ({ start: r3(c.start), end: r3(c.end), text: c.text })), format: "wav" };
  }
}
