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
