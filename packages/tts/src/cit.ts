// Client CIT Voice Studio (chạy cục bộ tại http://127.0.0.1:8001) – mục 5.1.

import { Agent, fetch } from "undici";
import type { Cue } from "@cvs/core";

export const CIT_DEFAULT_URL = "http://127.0.0.1:8001";

export class CitUnavailableError extends Error {
  constructor(public cause?: unknown) {
    super("Không kết nối được CIT Voice Studio. Hãy mở CIT Voice Studio rồi bấm Thử lại.");
    this.name = "CitUnavailableError";
  }
}
export class CitClientError extends Error {
  constructor(public status: number, body: string) {
    super(`CIT Voice Studio từ chối yêu cầu (HTTP ${status}): ${body.slice(0, 300)}`);
    this.name = "CitClientError";
  }
}

export type CitVoice = { id: string; name: string; gender?: string; region?: string; description?: string; cloned?: boolean; raw?: unknown };

export type CitOptions = {
  baseUrl?: string;
  apiKey?: string;
  /** Thời gian chờ mỗi yêu cầu (ms) – mặc định 10 phút. */
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export type CitGenerateRequest = {
  text: string;
  voice_id: string;
  speed: number;
  temperature?: number;
  format?: "wav" | "mp3";
  use_pronunciation_dict?: boolean;
  seed?: number;
  language?: string;
};

export type CitGenerateResult = { audio: Buffer; cues: Cue[]; format: string };

export class CitClient {
  readonly baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;
  private retries: number;
  private retryDelayMs: number;
  private dispatcher: Agent;

  constructor(opts: CitOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.CIT_TTS_BASE_URL ?? CIT_DEFAULT_URL).replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? process.env.CIT_TTS_API_KEY ?? undefined;
    this.timeoutMs = opts.timeoutMs ?? 10 * 60_000;
    this.retries = opts.retries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 5000;
    // undici mặc định chỉ chờ header 300 s – nâng lên theo timeout
    this.dispatcher = new Agent({ headersTimeout: this.timeoutMs, bodyTimeout: this.timeoutMs, connectTimeout: 10_000 });
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    return h;
  }

  private async request(path: string, init: { method: string; body?: string; timeoutMs?: number }) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? this.timeoutMs);
    try {
      return await fetch(this.baseUrl + path, {
        method: init.method,
        body: init.body,
        headers: this.headers(!!init.body),
        signal: ctl.signal,
        dispatcher: this.dispatcher,
      });
    } catch (e) {
      throw new CitUnavailableError(e);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Kiểm tra trạng thái (đèn xanh/đỏ). */
  async status(): Promise<{ ok: boolean; voices?: number; error?: string }> {
    try {
      const voices = await this.voices(4000);
      return { ok: true, voices: voices.length };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async voices(timeoutMs = 15_000): Promise<CitVoice[]> {
    const r = await this.request("/voices", { method: "GET", timeoutMs });
    if (!r.ok) throw new CitClientError(r.status, await r.text());
    const j: any = await r.json();
    const list: any[] = Array.isArray(j) ? j : (j.voices ?? j.data ?? Object.values(j));
    return list.map((v) =>
      typeof v === "string"
        ? { id: v, name: v }
        : { id: String(v.voice_id ?? v.id ?? v.name), name: String(v.name ?? v.voice_id ?? v.id), gender: v.gender, region: v.region, description: v.description, cloned: !!v.isCloned, raw: v },
    );
  }

  /**
   * POST /api/tts/generate-with-subtitles → { audio_base64, cues }.
   * Thử lại 3 lần × 5 s; lỗi 4xx dừng ngay; "fetch failed" → CitUnavailableError.
   */
  async generate(req: CitGenerateRequest): Promise<CitGenerateResult> {
    const body = JSON.stringify({ format: "wav", use_pronunciation_dict: true, ...req });
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryDelayMs));
      try {
        const r = await this.request("/api/tts/generate-with-subtitles", { method: "POST", body });
        if (r.status >= 400 && r.status < 500) throw new CitClientError(r.status, await r.text());
        if (!r.ok) {
          lastErr = new Error(`CIT lỗi máy chủ HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
          continue;
        }
        const j: any = await r.json();
        const b64: string = j.audio_base64 ?? j.audio ?? "";
        if (!b64) throw new Error("CIT không trả về audio_base64");
        const cues: Cue[] = (j.cues ?? j.subtitles ?? []).map((c: any) => ({
          start: Number(c.start ?? c.start_time ?? 0),
          end: Number(c.end ?? c.end_time ?? 0),
          text: String(c.text ?? ""),
        }));
        return { audio: Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64"), cues, format: req.format ?? "wav" };
      } catch (e) {
        if (e instanceof CitClientError) throw e;
        lastErr = e;
      }
    }
    if (lastErr instanceof CitUnavailableError) throw lastErr;
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
