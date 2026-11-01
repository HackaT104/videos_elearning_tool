import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVideo, defaultVoiceFor, sceneVoiceHash } from "@cvs/core";
import {
  decodeToPcm, longestSilence, pcmToWav, SAMPLE_RATE, splitPauses, startMockZerotts, synthesizeVideo, wavToPcm, ZEROTTS_SERVER_PY, ZerottsClient,
  ZerottsClientError, ZerottsUnavailableError,
} from "../src";

describe("ZeroTTS – thẻ CIT và WAV", () => {
  it("[nghỉ 2s] → khoảng lặng, [cười] bị bỏ", () => {
    expect(splitPauses("Xin chào. [nghỉ 2s] Bắt đầu [cười] nhé. [nghỉ 500ms]")).toEqual([
      { text: "Xin chào." },
      { pause: 2 },
      { text: "Bắt đầu nhé." },
      { pause: 0.5 },
    ]);
    expect(splitPauses("[nghỉ 9s]a")).toEqual([{ pause: 2.4 }, { text: "a" }]); // không quá 2,4 s
  });
  it("WAV 16-bit đọc lại đúng", () => {
    const pcm = Float32Array.from({ length: 480 }, (_, i) => 0.5 * Math.sin(i / 7));
    const r = wavToPcm(pcmToWav(pcm, 48000));
    expect(r.sampleRate).toBe(48000);
    expect(r.pcm.length).toBe(480);
    expect(Math.abs(r.pcm[100] - pcm[100])).toBeLessThan(1e-3);
  });
  it("hash giọng gồm nhà cung cấp; giọng mặc định ZeroTTS", () => {
    const scene = { sentences: [{ text: "a", tts: "a" }] };
    expect(sceneVoiceHash({ provider: "zerotts", voiceId: "maichi", speed: 1 }, scene)).not.toBe(sceneVoiceHash({ provider: "cit", voiceId: "maichi", speed: 1 }, scene));
    expect(defaultVoiceFor("L2", 0, "zerotts")).toMatchObject({ provider: "zerotts", voiceId: "quangminh" });
  });
});

describe("client ZeroTTS (máy chủ giả lập)", () => {
  let server: Awaited<ReturnType<typeof startMockZerotts>>;
  const port = 18402;
  beforeAll(async () => { server = await startMockZerotts(port, { failTimes: 1 }); });
  afterAll(() => server.close());
  const client = () => new ZerottsClient({ baseUrl: `http://127.0.0.1:${port}`, retryDelayMs: 20 });

  it("trạng thái + 8 giọng, giới tính chuẩn hoá", async () => {
    expect(await client().status()).toMatchObject({ ok: true, voices: 8 });
    const v = await client().voices();
    expect(v.find((x) => x.id === "maichi")).toMatchObject({ gender: "female", name: "Mai Chi" });
    expect(v.find((x) => x.id === "tiendat")?.gender).toBe("male");
  });
  it("lỗi máy chủ → thử lại; thẻ được xử lý trước khi gửi; mốc dời theo khoảng lặng", async () => {
    server.bodies.length = 0;
    const r = await client().generate({ text: "Chào các bạn. [nghỉ 1s] Bài học [cười] bắt đầu.", voice: "maichi", speed: 1, temperature: 0.7, seed: 5 });
    expect(server.bodies.map((b) => b.input)).toEqual(["Chào các bạn.", "Bài học bắt đầu."]);
    expect(server.bodies[0]).toMatchObject({ voice: "maichi", temperature: 0.7, seed: 5 });
    const { pcm, sampleRate } = wavToPcm(r.audio);
    expect(sampleRate).toBe(48000);
    expect(r.cues.map((c) => c.text)).toEqual(["Chào các bạn.", "Bài học bắt đầu."]);
    // phần 1 dài d1 → phần 2 bắt đầu sau d1 + 1 s im lặng
    const first = await client().speech("Chào các bạn.", "maichi");
    const d1 = first.pcm.length / 48000;
    expect(r.cues[1].start).toBeCloseTo(d1 + 1 + 0.4, 2); // mockSpeech im lặng 0,4 s ở đầu mỗi phần
    expect(pcm.length / sampleRate).toBeGreaterThan(d1 + 1);
  });
  it("speed ≠ 1 → ffmpeg atempo, mốc co lại tương ứng", async () => {
    const a = await client().generate({ text: "Một hai ba bốn năm sáu bảy tám.", voice: "giahuy", speed: 1 });
    const b = await client().generate({ text: "Một hai ba bốn năm sáu bảy tám.", voice: "giahuy", speed: 1.25 });
    const da = wavToPcm(a.audio).pcm.length / 48000;
    const db = wavToPcm(b.audio).pcm.length / 48000;
    expect(db).toBeCloseTo(da / 1.25, 1);
    expect(b.cues[0].end).toBeCloseTo(a.cues[0].end / 1.25, 2);
  });
  it("giọng sai → 4xx, không thử lại", async () => {
    const before = server.calls;
    await expect(client().generate({ text: "x", voice: "khongco", speed: 1 })).rejects.toBeInstanceOf(ZerottsClientError);
    expect(server.calls - before).toBe(1);
  });
  it("chưa chạy → thông báo tiếng Việt", async () => {
    const c = new ZerottsClient({ baseUrl: "http://127.0.0.1:18499", retries: 1, retryDelayMs: 10 });
    const err = await c.generate({ text: "x", voice: "maichi", speed: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ZerottsUnavailableError);
    expect(err.message).toContain("ZeroTTS");
    expect((await c.status()).ok).toBe(false);
  });

  it("tạo giọng cả video với provider zerotts → mốc câu khớp, manifest ghi nguồn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cvs-zvo-"));
    const video = buildVideo({ title: "T", fileName: "MO1_U1_1", scenes: [
      { scriptStart: 0, scriptEnd: 10, title: "a", visual: "", onscreen: [], vo: "Chào mừng các bạn. Hôm nay chúng ta học về tín chỉ carbon." },
    ] }, { course: "CAR", level: "L2" }, 0);
    video.voice = { provider: "zerotts", voiceId: "kimoanh", speed: 0.9 };
    const m = await synthesizeVideo(video, dir, { zerotts: client() });
    const s1 = m.scenes.s1;
    expect(s1.provider).toBe("zerotts");
    expect(existsSync(join(dir, s1.file))).toBe(true);
    expect(s1.cues).toHaveLength(2);
    expect(s1.ends[0]).toBeGreaterThan(s1.cues[0]);
    expect(s1.cues[1]).toBeGreaterThanOrEqual(s1.ends[0]);
    expect(s1.cues[1] - s1.ends[0]).toBeGreaterThan(0.5); // giãn nhịp gap 0,8 s tại chỗ ngắt có sẵn
    expect(s1.ends[1]).toBeCloseTo(s1.dur, 2);
    expect(longestSilence(await decodeToPcm(join(dir, s1.file)), SAMPLE_RATE)).toBeLessThan(2.5);
  });
});

// Đầu-cuối với server.py thật (mô hình giả CVS_ZEROTTS_FAKE=1). Chạy khi có venv đã cài zerotts fastapi uvicorn:
//   CVS_ZEROTTS_TEST_PYTHON=/đường/dẫn/.venv/bin/python npx vitest run packages/tts/test/zerotts.test.ts
const PY = process.env.CVS_ZEROTTS_TEST_PYTHON;
describe.skipIf(!PY)("server.py (Python thật, mô hình giả)", () => {
  let proc: ChildProcess;
  const port = 18403;
  const client = new ZerottsClient({ baseUrl: `http://127.0.0.1:${port}`, retries: 0 });
  beforeAll(async () => {
    proc = spawn(PY!, ["-I", ZEROTTS_SERVER_PY], { env: { ...process.env, CVS_ZEROTTS_FAKE: "1", CVS_ZEROTTS_PORT: String(port) }, stdio: "ignore" });
    for (let i = 0; i < 120 && !(await client.health()).ok; i++) await new Promise((r) => setTimeout(r, 250));
  }, 60_000);
  afterAll(() => proc?.kill());

  it("health, 8 giọng, mốc theo câu từ số mẫu, chuẩn hoá số", async () => {
    expect((await client.health()).ok).toBe(true);
    expect((await client.voices()).map((v) => v.id).sort()).toEqual(["baotrang", "giahuy", "hamy", "huuduc", "kimoanh", "maichi", "quangminh", "tiendat"]);
    const r = await client.speech("Xin chào các bạn. Ngày 01/01/2027 bắt đầu!", "maichi", { seed: 1 });
    expect(r.sampleRate).toBe(48000);
    expect(r.cues.map((c) => c.text)).toEqual(["Xin chào các bạn.", "Ngày 01/01/2027 bắt đầu!"]);
    expect(r.cues[1].start).toBeCloseTo(r.cues[0].end + 0.15, 2);
    expect(r.cues[1].end).toBeCloseTo(r.pcm.length / 48000, 2);
    await expect(client.speech("x", "khongco")).rejects.toBeInstanceOf(ZerottsClientError);
  });
});
