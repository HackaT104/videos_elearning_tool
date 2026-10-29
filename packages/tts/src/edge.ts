// Dự phòng: Edge TTS (Python edge-tts, lấy WordBoundary để có mốc từng chữ). Mặc định luôn dùng CIT.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Cue } from "@cvs/core";

const PY_SCRIPT = String.raw`
import asyncio, json, sys
import edge_tts

async def main(text_file, voice, rate, out_mp3, out_json):
    text = open(text_file, encoding="utf-8").read()
    try:
        comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:
        comm = edge_tts.Communicate(text, voice, rate=rate)
    cues = []
    with open(out_mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                cues.append({"start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7, "text": chunk["text"]})
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(cues, f, ensure_ascii=False)

asyncio.run(main(*sys.argv[1:6]))
`;

export function pythonBin(): string {
  return process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
}

export async function edgeGenerate(text: string, voice: string, speed: number): Promise<{ audio: Buffer; cues: Cue[]; format: "mp3" }> {
  const dir = mkdtempSync(join(tmpdir(), "cvs-edge-"));
  try {
    const script = join(dir, "edge.py");
    writeFileSync(script, PY_SCRIPT);
    writeFileSync(join(dir, "text.txt"), text, "utf8");
    const pct = Math.round((speed - 1) * 100);
    const rate = `${pct >= 0 ? "+" : ""}${pct}%`;
    const out = join(dir, "out.mp3");
    const cuesFile = join(dir, "cues.json");
    await new Promise<void>((resolve, reject) => {
      const p = spawn(pythonBin(), ["-I", script, join(dir, "text.txt"), voice, rate, out, cuesFile], { windowsHide: true });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.on("error", (e) => reject(new Error(`Không chạy được Python (${pythonBin()}): ${e.message}. Cài: pip install edge-tts`)));
      p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`edge-tts lỗi: ${err.split("\n").slice(-4).join(" ")}`))));
    });
    return { audio: readFileSync(out), cues: JSON.parse(readFileSync(cuesFile, "utf8")), format: "mp3" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
