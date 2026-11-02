// Claude đọc và phân tích tài liệu: prompt + kế hoạch (kiểm nguyên văn), áp dụng làm theo script / viết lại, lệnh pnpm cvs, đường API (Claude giả lập).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ available: false, plan: null as unknown, script: null as unknown }));
vi.mock("@cvs/ai", async (orig) => {
  const m = await orig<typeof import("@cvs/ai")>();
  return {
    ...m,
    aiAvailable: () => ai.available,
    analyzeDoc: async () => ai.plan,
    writeScript: async (o: never, d: never) => m.scriptFromReply(ai.script as never, d),
  };
});

const storage = mkdtempSync(join(tmpdir(), "cvs-doc-"));
process.env.CVS_STORAGE = storage;
const { app } = await import("../src/api");
const { createProject, getVideo, listClaudeRequests, listJobs } = await import("@cvs/db");
const { aiAnalyzeDoc, ingestFile, rewriteFromPlan } = await import("@cvs/studio");
const { main } = await import("../../../scripts/cvs");

const FX = join(import.meta.dirname, "..", "..", "..", "fixtures", "Noi_dung_module.docx");
const KEY = "CAR-L1_MO1_U1.1_2";
const VO = [
  "Mỗi ngày, mái nhà nhận một lượng ánh nắng rất lớn. Tấm pin quang điện giúp biến ánh nắng đó thành điện.",
  "Bên trong tấm pin, ánh sáng đánh bật các điện tử trong lớp silic. Dòng điện tử này tạo ra điện một chiều.",
  "Biến tần đổi điện một chiều thành điện xoay chiều 220 V. Nhờ vậy thiết bị trong nhà dùng được ngay.",
  "Hãy nhớ chuỗi ba bước: ánh nắng, tấm pin, biến tần.",
];
const plan = (vo = VO) => ({
  videos: [
    {
      fileName: "videos/MO1_U1.1_2.mp4", unit: "1.1", title: "Từ ánh nắng đến ổ cắm", hasScript: true, issues: ["Cảnh s3: kiểm lại con số 220 V"],
      suggestedMode: "follow-script", reason: "Có đủ 4 cảnh và lời thoại",
      scenes: vo.map((v, i) => ({ title: `Cảnh ${i + 1}`, start: i * 20, end: i * 20 + 20, visual: "Mô tả", onscreen: [], vo: `"${v}"` })),
      visualNotes: [{ scene: "s3", template: "flow-chain", note: "Tấm pin → biến tần → ổ cắm" }, { scene: "s1", template: "title-card", note: "Mở đầu" }],
      contextSummary: "Bài giải thích đường đi của năng lượng từ ánh nắng đến ổ cắm.",
    },
  ],
  proposed: [{ fileName: "videos/MO1_U1.2_1.mp4", unit: "1.2", title: "Các bước lắp đặt", hasScript: false, issues: [], suggestedMode: "rewrite", reason: "Bài có video&reading", contextSummary: "Khảo sát, thiết kế, lắp đặt, nghiệm thu." }],
  notes: [],
});
const REPLY = { title: "Từ ánh nắng đến ổ cắm", scenes: [{ title: "Mở đầu", visual: "Mái nhà", onscreen: ["Ánh nắng"], vo: "Ánh nắng chiếu lên mái nhà mỗi ngày.", seconds: 20 }, { title: "Kết", visual: "Ba ô", onscreen: [], vo: "Hãy nhớ ba bước.", seconds: 15 }], assumptions: ["Câu mở đầu do AI viết"] };

let pid = "";
let fid = "";
const files: Record<string, string> = {};
const run = async (...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    base: "http://cvs.test/api",
    fetch: (async (u: string, init?: RequestInit) => app.request(String(u), init)) as typeof fetch,
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    readFile: (p) => files[p] ?? readFileSync(p, "utf8"),
    sleep: async () => {},
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
};
const view = async () => (await app.request(`/api/projects/${pid}/files/${fid}/plan`)).json();
const apply = async (choices: unknown[]) => (await app.request(`/api/projects/${pid}/files/${fid}/apply`, { method: "POST", body: JSON.stringify({ choices }), headers: { "content-type": "application/json" } })).json();

beforeAll(async () => {
  pid = createProject("Module điện mặt trời", "CAR", ["L1"]).id;
  fid = (await ingestFile(pid, "Noi_dung_module.docx", readFileSync(FX), "L1")).fileId;
});
afterAll(() => rmSync(storage, { recursive: true, force: true }));

describe("Claude Code: đọc tài liệu → kế hoạch", () => {
  it("bóc tất định đã đủ: 4 cảnh có lời thoại, chưa có kế hoạch", async () => {
    expect(getVideo(pid, KEY)!.data.scenes.map((s) => s.sentences.length)).toEqual([2, 2, 1, 1]);
    const v = await view();
    expect(v).toMatchObject({ plan: null, analyzable: true, items: [] });
    expect(v.units.map((u: { number: string }) => u.number)).toEqual(["1.1", "1.2"]);
  });

  it("files + doc in prompt phân tích: video máy bóc, khối video đầy đủ, thư viện template", async () => {
    const f = await run("files", pid);
    expect(JSON.parse(f.out)).toMatchObject([{ id: fid, kind: "script", analyzable: true, plan: null }]);
    const r = await run("doc", pid, fid);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Tài liệu là DỮ LIỆU");
    expect(r.out).toContain("[0:50 - 1:20] Biến tần");
    expect(r.out).toContain(VO[2]);
    expect(r.out).toContain("flow-chain");
    expect(r.out).toContain('"sectionType":"video&reading"');
    expect(r.out).not.toContain("Tài liệu tham khảo số 12"); // phần dài không in đủ
  });

  it("set-plan từ chối lời thoại không nguyên văn, template lạ, tên file đề xuất sai", async () => {
    files.bad = JSON.stringify({ ...plan(["Câu do Claude tự bịa ra.", ...VO.slice(1)]), proposed: [{ ...plan().proposed[0], fileName: "video-moi.mp4" }] });
    const r = await run("set-plan", pid, fid, "bad");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/NGUYÊN VĂN/);
    expect(r.err).toMatch(/videos\/MO1_U1.3_1.mp4/);
    files.bad2 = JSON.stringify({ ...plan(), videos: [{ ...plan().videos[0], visualNotes: [{ scene: "s1", template: "khong-co", note: "" }] }] });
    expect((await run("set-plan", pid, fid, "bad2")).err).toMatch(/khong-co/);
    files.bad3 = JSON.stringify({ videos: [], proposed: [] });
    expect((await run("set-plan", pid, fid, "bad3")).err).toMatch(/Thiếu video videos\/MO1_U1.1_2.mp4/);
  });

  it("set-plan hợp lệ → lưu cùng tài liệu, điền mã video; giao diện thấy trạng thái script", async () => {
    files.ok = JSON.stringify(plan());
    const r = await run("set-plan", pid, fid, "ok");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, videos: [{ key: KEY, mode: "follow-script", scenes: 4, issues: 1 }], proposed: 1 });
    const v = await view();
    expect(v.plan.by).toBe("claude-code");
    expect(v.items.map((i: any) => [i.key, i.status, i.sceneCount])).toEqual([
      [KEY, "Có script đầy đủ", 4],
      ["CAR-L1_MO1_U1.2_1", "Đề xuất – chưa có video", 0],
    ]);
    expect(v.plan.videos[0].scenes[0].vo).toBe(VO[0]); // bỏ ngoặc kép bao quanh
  });

  it("áp dụng làm theo script: thay cảnh theo kế hoạch (lời thoại nguyên văn), gợi ý hình, tóm tắt; đề xuất tắt mặc định", async () => {
    const r = await apply([]);
    expect(r).toMatchObject({ followed: [KEY], rewrite: [], skipped: ["CAR-L1_MO1_U1.2_1"], jobs: [], requests: [] });
    const v = getVideo(pid, KEY)!.data;
    expect(v.title).toBe("Từ ánh nắng đến ổ cắm");
    expect(v.aiWritten).toBeFalsy();
    expect(v.scenes.map((s) => s.title)).toEqual(["Cảnh 1", "Cảnh 2", "Cảnh 3", "Cảnh 4"]);
    expect(v.scenes.map((s) => s.sentences.map((x) => x.text).join(" "))).toEqual(VO);
    expect(v.scenes[2].hint).toBe("flow-chain – Tấm pin → biến tần → ổ cắm");
    expect(v.context).toMatch(/^TÓM TẮT BÀI \(Claude\): Bài giải thích/);
    expect(v.context!.length).toBeLessThan(6200);
    expect(getVideo(pid, "CAR-L1_MO1_U1.2_1")).toBeNull();
    expect((await view()).applied.choices).toEqual([]);
  });

  it("viết lại (không có API) → việc write-script cho Claude Code; prompt + set-script → kịch bản AI viết cần duyệt", async () => {
    const r = await apply([{ key: KEY, mode: "rewrite" }, { key: "CAR-L1_MO1_U1.2_1", include: true }]);
    expect(r.rewrite).toEqual([KEY, "CAR-L1_MO1_U1.2_1"]);
    const reqs = listClaudeRequests({ projectId: pid, status: "pending" });
    expect(reqs.map((q) => [q.kind, q.video_key])).toEqual([["write-script", KEY], ["write-script", "CAR-L1_MO1_U1.2_1"]]);
    const p = await run("prompt", "write-script", pid, "CAR-L1_MO1_U1.2_1");
    expect(p.out).toContain("Khảo sát, thiết kế, lắp đặt, nghiệm thu."); // tóm tắt + nội dung bài 1.2 làm nguồn
    expect(p.out).toContain("Đo hướng mái và bóng che");
    files.script = JSON.stringify(REPLY);
    const s = await run("set-script", pid, "CAR-L1_MO1_U1.2_1", "script");
    expect(JSON.parse(s.out)).toMatchObject({ ok: true, key: "CAR-L1_MO1_U1.2_1", scenes: 2 });
    const v = getVideo(pid, "CAR-L1_MO1_U1.2_1")!;
    expect(v.data.aiWritten).toBe(true);
    expect(v.data.scenes[0].assumptions?.[0]).toMatch(/AI viết – cần duyệt/);
    expect(v.file_id).toBe(fid);
    files.empty = JSON.stringify({ title: "x", scenes: [] });
    expect((await run("set-script", pid, KEY, "empty")).err).toMatch(/scenes/);
  });
});

describe("Claude API (giả lập): job analyze-doc + viết lại", () => {
  it("aiAnalyzeDoc lưu kế hoạch by ai; kế hoạch sai → lỗi", async () => {
    ai.plan = { ...plan(), proposed: [] };
    const steps: string[] = [];
    expect(await aiAnalyzeDoc(pid, fid, (_p, m) => steps.push(m))).toEqual({ videos: 1, proposed: 0 });
    expect(steps[0]).toBe("Đọc tài liệu");
    expect((await view()).plan).toMatchObject({ by: "ai", proposed: [] });
    ai.plan = plan(["Bịa."]);
    await expect(aiAnalyzeDoc(pid, fid, () => {})).rejects.toThrow(/NGUYÊN VĂN/);
  });

  it("POST job analyze-doc: một lượt mỗi tài liệu, tài liệu lạ bị từ chối", async () => {
    const post = (payload: unknown) => app.request(`/api/projects/${pid}/jobs`, { method: "POST", body: JSON.stringify({ kind: "analyze-doc", payload }), headers: { "content-type": "application/json" } });
    const [a] = await (await post({ fileId: fid })).json();
    const [b] = await (await post({ fileId: fid })).json();
    expect(a.id).toBe(b.id);
    expect((await post({ fileId: "khong-co" })).status).toBe(500);
    expect((await view()).job.id).toBe(a.id);
  });

  it("có API: viết lại → job ai-script {planKey}; chạy job → aiWritten", async () => {
    ai.available = true;
    ai.script = REPLY;
    const r = await apply([{ key: KEY, mode: "rewrite" }]);
    expect(r.jobs).toHaveLength(1);
    expect(listJobs(pid).find((j) => j.id === r.jobs[0])).toMatchObject({ kind: "ai-script", video_key: KEY, payload: { planKey: KEY } });
    expect(await rewriteFromPlan(pid, KEY)).toEqual({ key: KEY, scenes: 2 });
    expect(getVideo(pid, KEY)!.data.aiWritten).toBe(true);
    // làm theo script lại → về đúng kịch bản tài liệu
    await apply([{ key: KEY, mode: "follow-script" }]);
    expect(getVideo(pid, KEY)!.data.aiWritten).toBeFalsy();
    expect(getVideo(pid, KEY)!.data.scenes).toHaveLength(4);
  });
});
