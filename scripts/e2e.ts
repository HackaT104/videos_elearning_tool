// Kiểm tra đầu-cuối không cần giao diện: dự án → bóc fixture → sản xuất 1 video → xuất.
//   CVS_TTS_MOCK=1 dùng giọng giả lập khi không có CIT Voice Studio.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createProject, getVideo, listVideos, setVideoFlags } from "@cvs/db";
import { exportProject, ingestFile, runSteps, type Ctx } from "@cvs/studio";

const engine = (process.argv[2] ?? "hyperframes") as "hyperframes" | "remotion";
const p = createProject("E2E", "CAR", ["L1"], { engine, aiDesign: false, aiVision: false });
const r = await ingestFile(p.id, "Kich_ban_L1.docx", readFileSync(join(import.meta.dirname, "..", "fixtures", "Kich_ban_L1.docx")), "L1");
console.log("videos", r.result.videos.map((v) => v.key));
const key = listVideos(p.id)[1].key;
const ctx: Ctx = { projectId: p.id, key, settings: p.settings, log: (s) => process.stdout.write("  " + s), shouldStop: () => false, progress: (s, pct, m) => pct % 50 === 0 && console.log(`  [${s}] ${pct}% ${m ?? ""}`) };
const t0 = Date.now();
await runSteps(ctx, ["voice", "design", "qa", "render"]);
const row = getVideo(p.id, key)!;
const qa = row.qa as any;
console.log("QA ok:", qa.ok, qa.items);
setVideoFlags(p.id, key, { approved: true });
const ex = await exportProject(p.id);
console.log("export", ex.files, ex.skipped, ex.catalog, (Date.now() - t0) / 1000, "s");
console.log(JSON.stringify(readFileSync(ex.catalog, "utf8")));
