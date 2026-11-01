// Máy chủ CIT GIẢ LẬP (chỉ cho test/demo): cùng API với CIT Voice Studio.
import { createServer, type Server } from "node:http";
import { mockSpeech } from "./mock";
import { pcmToWav } from "./ffmpeg";

export const MOCK_VOICES = [
  { voice_id: "Hải Đăng", name: "Hải Đăng", gender: "male" },
  { voice_id: "Trúc Ly", name: "Trúc Ly", gender: "female" },
];

export function startMockCit(port = 8001, opts: { failTimes?: number; apiKey?: string } = {}): Promise<Server & { calls: number }> {
  let fails = opts.failTimes ?? 0;
  const server = createServer((req, res) => {
    (server as any).calls++;
    if (opts.apiKey && req.headers["x-api-key"] !== opts.apiKey) {
      res.writeHead(401).end("bad key");
      return;
    }
    if (req.method === "GET" && req.url === "/voices") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(MOCK_VOICES));
      return;
    }
    if (req.method === "POST" && req.url === "/api/tts/generate-with-subtitles") {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        if (fails > 0) {
          fails--;
          res.writeHead(503).end("busy");
          return;
        }
        const j = JSON.parse(body);
        if (!MOCK_VOICES.some((v) => v.voice_id === j.voice_id)) {
          res.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ detail: "voice not found" }));
          return;
        }
        const { pcm, cues } = mockSpeech(j.text, j.speed ?? 1);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ audio_base64: pcmToWav(pcm).toString("base64"), cues }));
      });
      return;
    }
    res.writeHead(404).end("not found");
  }) as Server & { calls: number };
  server.calls = 0;
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

/** Máy chủ ZeroTTS GIẢ LẬP (chỉ cho test/demo): cùng API với packages/tts/zerotts/server.py, WAV 48 kHz, không áp dụng speed. */
export function startMockZerotts(port = 8002, opts: { failTimes?: number } = {}): Promise<Server & { calls: number; bodies: any[] }> {
  let fails = opts.failTimes ?? 0;
  const ids = ["maichi", "baotrang", "kimoanh", "hamy", "giahuy", "huuduc", "quangminh", "tiendat"];
  const server = createServer((req, res) => {
    const s = server as Server & { calls: number; bodies: any[] };
    s.calls++;
    const json = (code: number, j: unknown) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(j));
    if (req.method === "GET" && req.url === "/health") return json(200, { status: "ok", sample_rate: 48000, fake: true });
    if (req.method === "GET" && req.url === "/v1/voices") return json(200, { object: "list", data: ids.map((id, i) => ({ id, name: id, gender: i < 4 ? "nữ" : "nam", tags: ["trẻ"] })) });
    if (req.method === "POST" && req.url === "/v1/audio/speech-with-segments") {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        if (fails > 0) {
          fails--;
          res.writeHead(503).end("busy");
          return;
        }
        const j = JSON.parse(body);
        s.bodies.push(j);
        if (!ids.includes(j.voice)) return json(400, { detail: `Không có giọng '${j.voice}'` });
        const { pcm, cues } = mockSpeech(String(j.input ?? ""), 1, 48000);
        json(200, { audio_base64: pcmToWav(pcm, 48000).toString("base64"), sample_rate: 48000, segments: cues, speed_applied: false });
      });
      return;
    }
    res.writeHead(404).end("not found");
  }) as Server & { calls: number; bodies: any[] };
  server.calls = 0;
  server.bodies = [];
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
