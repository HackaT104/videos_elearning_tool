// Worker: hàng đợi job trên SQLite (không cần Redis). Tối đa CVS_WORKER_CONCURRENCY job song song (mặc định 4),
// render tối đa CVS_RENDER_CONCURRENCY (mặc định 1). Đóng cửa sổ/tắt CIT giữa chừng → job chạy lại, bỏ qua phần đã xong.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { claimNextJob, getDb, getJob, getProject, paths, requeueStale, STORAGE, updateJob, type Job } from "@cvs/db";
import { startApi } from "./api";
import { aiWriteScript, JOB_STEPS, makeCustomScene, reviseWithNote, runSteps, Stopped, STEP_LABELS, stylePreview, voiceSamples, type Ctx, type StepName } from "@cvs/studio";

const MAX = Number(process.env.CVS_WORKER_CONCURRENCY ?? 4);
const MAX_RENDER = Number(process.env.CVS_RENDER_CONCURRENCY ?? 1);
const running = new Map<number, Job>();
let rendering = 0;
const renderWaiters: (() => void)[] = [];

async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (rendering >= MAX_RENDER) await new Promise<void>((r) => renderWaiters.push(r));
  rendering++;
  try {
    return await fn();
  } finally {
    rendering--;
    renderWaiters.shift()?.();
  }
}

function logFile(job: Job) {
  const dir = join(STORAGE, "logs");
  mkdirSync(dir, { recursive: true });
  return join(dir, `job-${job.id}.log`);
}

async function run(job: Job) {
  const project = getProject(job.project_id);
  if (!project) {
    updateJob(job.id, { status: "failed", error: "Dự án không còn tồn tại" });
    return;
  }
  const lf = logFile(job);
  const log = (s: string) => appendFileSync(lf, s);
  const steps = JOB_STEPS[job.kind] ?? [];
  const ctx: Ctx = {
    projectId: job.project_id,
    key: job.video_key ?? "",
    settings: project.settings,
    log,
    shouldStop: () => {
      const s = getJob(job.id)?.status;
      return s === "paused" || s === "canceled";
    },
    progress: (step: StepName, pct: number, message?: string) => {
      const idx = Math.max(0, steps.indexOf(step));
      const total = Math.max(1, steps.length);
      updateJob(job.id, { step, progress: Math.round(((idx + pct / 100) / total) * 100), message: `${STEP_LABELS[step]}${message ? ` – ${message}` : ""}` });
    },
  };
  log(`[${new Date().toISOString()}] Bắt đầu job ${job.id} ${job.kind} ${job.video_key ?? ""}\n`);
  try {
    let result: unknown = null;
    switch (job.kind) {
      case "produce":
      case "voice":
      case "visual":
      case "render":
      case "design": {
        const before = steps.filter((s) => s !== "render");
        await runSteps(ctx, before, job.payload ?? {});
        if (steps.includes("render")) {
          updateJob(job.id, { message: "Render – chờ lượt" });
          await withRenderSlot(() => runSteps(ctx, ["render"]));
        }
        break;
      }
      case "revise":
        await reviseWithNote(ctx, job.payload.scene, job.payload.note);
        break;
      case "ai-script":
        if (job.payload.custom) await makeCustomScene(ctx, job.payload.scene);
        else result = await aiWriteScript(job.project_id, job.payload);
        break;
      case "theme-preview":
        result = await stylePreview(job.project_id, job.video_key, job.payload?.scene);
        break;
      case "voice-sample":
        result = await voiceSamples(job.payload.text, job.payload.voices);
        break;
    }
    const st = getJob(job.id)?.status;
    if (st === "running") updateJob(job.id, { status: "done", progress: 100, message: "Xong", result });
  } catch (e) {
    if (e instanceof Stopped) {
      log("Dừng theo yêu cầu\n");
      return;
    }
    const msg = (e as Error).message;
    log(`LỖI: ${(e as Error).stack}\n`);
    updateJob(job.id, { status: "failed", error: msg, message: `Lỗi ở bước ${STEP_LABELS[(getJob(job.id)?.step as StepName) ?? "voice"] ?? ""}` });
  }
}

async function loop() {
  getDb();
  requeueStale();
  console.log(`Worker sẵn sàng · ${MAX} job song song · render ${MAX_RENDER} · lưu trữ: ${STORAGE}`);
  for (;;) {
    while (running.size < MAX) {
      const job = claimNextJob([...running.values()]);
      if (!job) break;
      running.set(job.id, job);
      console.log(`→ job ${job.id} ${job.kind} ${job.video_key ?? ""}`);
      run(job).finally(() => {
        running.delete(job.id);
        console.log(`✓ job ${job.id} ${getJob(job.id)?.status}`);
      });
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

void paths;
if (process.env.CVS_NO_API !== "1") startApi();
loop();
