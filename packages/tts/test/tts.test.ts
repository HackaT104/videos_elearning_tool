import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVideo, computeTiming } from "@cvs/core";
import {
  alignSentences, CitClient, CitClientError, CitUnavailableError, decodeToPcm, longestSilence, mockGenerate, mockSpeech,
  pace, probe, quietRuns, rmsEnvelope, SAMPLE_RATE, startMockCit, synthesizeVideo, trimSilence,
} from "../src";

describe("gán mốc câu từ cues", () => {
  it("theo tỉ lệ ký tự trên trục cue", () => {
    const cues = [
      { start: 0.5, end: 2.5, text: "Câu thứ nhất." },
      { start: 3.0, end: 5.0, text: "Câu thứ hai." },
    ];
    const s = alignSentences(["Câu thứ nhất.", "Câu thứ hai."], cues, 5.6);
    expect(s[0]).toEqual({ start: 0.3, end: 2.5 }); // câu đầu bắt đầu ở min(cue0.start, 0.3)
    expect(s[1]).toEqual({ start: 3.0, end: 5.6 }); // câu cuối kết thúc ở cuối file
  });
  it("một cue chứa nhiều câu → nội suy trong cue", () => {
    const s = alignSentences(["Aaaa.", "Bbbb bbbb bbbb."], [{ start: 0, end: 4, text: "Aaaa. Bbbb bbbb bbbb." }], 4);
    expect(s[0].end).toBeCloseTo(1, 2);
    expect(s[1].start).toBeCloseTo(1, 2);
  });
  it("cue chia khác câu, dấu câu khác vẫn khớp", () => {
    const cues = [
      { start: 0.2, end: 1, text: "Một hai" },
      { start: 1.1, end: 2, text: "ba bốn" },
      { start: 2.2, end: 3, text: "năm sáu" },
    ];
    const s = alignSentences(["Một hai ba.", "Bốn năm sáu!"], cues, 3.2);
    expect(s[0].end).toBeGreaterThan(1.1);
    expect(s[0].end).toBeLessThan(2);
    expect(s[1].start).toBeGreaterThanOrEqual(s[0].end);
  });
  it("không có cue → chia theo ký tự", () => {
    const s = alignSentences(["aa", "bb"], [], 4);
    expect(s[0].end).toBeCloseTo(2, 1);
  });
});

describe("cắt im lặng & chèn nhịp", () => {
  const sr = SAMPLE_RATE;
  const tone = (sec: number) => Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => 0.3 * Math.sin(i / 5));
  const sil = (sec: number) => new Float32Array(Math.round(sec * sr));
  const cat = (...a: Float32Array[]) => { const o = new Float32Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

  it("cắt đầu/cuối, giữ 0,05 s đầu và 0,2 s cuối", () => {
    const pcm = cat(sil(0.8), tone(1), sil(1.5));
    const t = trimSilence(pcm, sr);
    expect(t.head).toBeCloseTo(0.75, 2);
    expect(t.tail).toBeCloseTo(1.3, 2);
    expect(t.pcm.length / sr).toBeCloseTo(1.25, 2);
  });
  it("im lặng ngắn hơn 0,15 s ở đầu thì không cắt", () => {
    const t = trimSilence(cat(sil(0.1), tone(1)), sr);
    expect(t.head).toBe(0);
  });
  it("chèn khoảng lặng đúng chỗ ngắt hơi có sẵn", () => {
    const pcm = cat(tone(1), sil(0.15), tone(1));
    const spans = [{ start: 0, end: 1 }, { start: 1.15, end: 2.15 }];
    const p = pace(pcm, sr, spans, 0.8);
    expect(p.inserts).toHaveLength(1);
    expect(p.inserts[0].at).toBeCloseTo(1.075, 2);
    expect(p.inserts[0].added).toBeCloseTo(0.65, 2);
    expect(p.pcm.length / sr).toBeCloseTo(2.15 + 0.65, 2);
    expect(p.spans[1].start).toBeCloseTo(1.8, 2);
    expect(p.spans[0].end).toBe(1);
    const runs = quietRuns(rmsEnvelope(p.pcm, sr), -40, 0.08);
    expect(runs[0].end - runs[0].start).toBeCloseTo(0.8, 1);
  });
  it("không có chỗ ngắt → không chèn giữa từ", () => {
    const pcm = tone(2);
    const p = pace(pcm, sr, [{ start: 0, end: 1 }, { start: 1, end: 2 }], 0.8);
    expect(p.inserts).toEqual([]);
    expect(p.pcm.length).toBe(pcm.length);
  });
  it("chỗ ngắt đã đủ dài → không chèn thêm", () => {
    const p = pace(cat(tone(1), sil(1), tone(1)), sr, [{ start: 0, end: 1 }, { start: 2, end: 3 }], 0.8);
    expect(p.inserts).toEqual([]);
  });
  it("giọng giả lập không có im lặng > 2,5 s", () => {
    const { pcm } = mockSpeech("Một hai ba. Bốn năm sáu, bảy tám chín.");
    expect(longestSilence(pcm, sr)).toBeLessThan(2.5);
  });
});

describe("client CIT", () => {
  let server: Awaited<ReturnType<typeof startMockCit>>;
  const port = 18301;
  beforeAll(async () => { server = await startMockCit(port, { failTimes: 1, apiKey: "k" }); });
  afterAll(() => server.close());
  const client = () => new CitClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: "k", retryDelayMs: 50 });

  it("lấy danh sách giọng có dấu", async () => {
    expect((await client().voices()).map((v) => v.id)).toEqual(["Hải Đăng", "Trúc Ly"]);
  });
  it("lỗi máy chủ → thử lại rồi thành công", async () => {
    const r = await client().generate({ text: "Xin chào các bạn.", voice_id: "Hải Đăng", speed: 0.9 });
    expect(r.audio.length).toBeGreaterThan(1000);
    expect(r.cues.length).toBeGreaterThan(0);
  });
  it("lỗi 4xx → dừng, không thử lại", async () => {
    const before = server.calls;
    await expect(client().generate({ text: "x", voice_id: "Không có", speed: 1 })).rejects.toBeInstanceOf(CitClientError);
    expect(server.calls - before).toBe(1);
  });
  it("sai API key → 401", async () => {
    await expect(new CitClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: "sai" }).voices()).rejects.toBeInstanceOf(CitClientError);
  });
  it("CIT chưa mở → thông báo 'Hãy mở CIT Voice Studio'", async () => {
    const c = new CitClient({ baseUrl: "http://127.0.0.1:18399", retries: 1, retryDelayMs: 10 });
    const err = await c.generate({ text: "x", voice_id: "Hải Đăng", speed: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(CitUnavailableError);
    expect(err.message).toContain("Hãy mở CIT Voice Studio");
    expect((await c.status()).ok).toBe(false);
  });
});

describe("tạo giọng cả video + manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "cvs-vo-"));
  const video = buildVideo({ title: "T", fileName: "MO1_U1_1", scenes: [
    { scriptStart: 0, scriptEnd: 10, title: "a", visual: "", onscreen: [], vo: "Chào mừng các bạn. Hôm nay chúng ta học về tín chỉ carbon." },
    { scriptStart: 10, scriptEnd: 20, title: "b", visual: "", onscreen: [], vo: "Mỗi tín chỉ là một tấn. Hết bài." },
  ] }, { course: "CAR", level: "L2" }, 0);

  it("tạo MP3, mốc câu, và timing thật", async () => {
    let calls = 0;
    const gen = async (t: string, v: any) => { calls++; return mockGenerate(t, v); };
    const m = await synthesizeVideo(video, dir, { generator: gen });
    expect(calls).toBe(2);
    const s1 = m.scenes.s1;
    expect(existsSync(join(dir, s1.file))).toBe(true);
    expect(s1.file).toMatch(/^s1-[0-9a-f]{8}\.mp3$/);
    expect(s1.cues).toHaveLength(2);
    expect(s1.trimmed!.head).toBeGreaterThan(0.2);
    // giãn nhịp trung cấp gap 0,8 s
    expect(s1.paced!.length).toBe(1);
    expect(s1.cues[1] - s1.ends[0]).toBeGreaterThan(0.5);
    const info = await probe(join(dir, s1.file));
    expect(info.streams[0].codec_name).toBe("mp3");
    expect(Math.abs(info.duration - s1.dur)).toBeLessThan(0.08);
    const pcm = await decodeToPcm(join(dir, s1.file));
    expect(longestSilence(pcm, SAMPLE_RATE)).toBeLessThan(2.5);
    const t = computeTiming(video, m);
    expect(t.estimated).toBe(false);
    expect(t.scenes[0].dur).toBeCloseTo(0.7 + s1.dur + 1.2, 2);

    // chạy lại: hash khớp → bỏ qua
    await synthesizeVideo(video, dir, { generator: gen });
    expect(calls).toBe(2);
    // sửa một câu → chỉ tạo lại cảnh đó
    video.scenes[1].sentences[1].tts = "Kết thúc bài học.";
    const m2 = await synthesizeVideo(video, dir, { generator: gen });
    expect(calls).toBe(3);
    expect(m2.scenes.s2.file).not.toBe(m.scenes.s2.file);
    expect(m2.scenes.s1.file).toBe(m.scenes.s1.file);
  });
});
