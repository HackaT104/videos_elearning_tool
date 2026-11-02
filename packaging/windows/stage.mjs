// Gom mã + node_modules đã cài thành thư mục payload cho Inno Setup (gọi từ scripts/package-win.ps1).
// Inno Setup không chép được symlink/junction của pnpm → bỏ qua chúng và ghi vào .cvs-links.json; launcher.mjs tạo lại khi chạy.
// Bỏ phần chỉ dùng khi phát triển (test, bộ nhớ đệm dựng, ffprobe của hệ điều hành khác); giữ tsx vì runtime chạy TypeScript trực tiếp.
//   node packaging/windows/stage.mjs --out packaging/windows/build/payload/app
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INCLUDE = ["package.json", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json", ".env.example", "CLAUDE.md", "README.md", "THIRD-PARTY.md", ".claude", "apps", "packages", "scripts", "node_modules", "packaging/windows"];
/** Đường dẫn tương đối (dấu /) bị bỏ: khớp nguyên đoạn hoặc theo biểu thức. */
const SKIP = [
  /(^|\/)\.git$/,
  /(^|\/)\.turbo$/,
  /(^|\/)\.render-tmp$/,
  /\.tsbuildinfo$/,
  /^apps\/web\/\.next\/cache$/,
  /^apps\/[^/]+\/test$/,
  /^packages\/[^/]+\/test$/,
  /^packages\/engine-rmt\/\.bundle$/,
  /^packages\/themes\/\.cache$/,
  /^packages\/engine-rmt\/remotion\/custom\/[^/]+\.tsx$/,
  /^packaging\/windows\/build$/,
  /^node_modules\/\.cache$/,
  /(^|\/)node_modules\/\.remotion$/,
  // ffprobe-static chứa sẵn bản cho mọi hệ điều hành (~330 MB) – chỉ giữ win32/x64
  /\/ffprobe-static\/bin\/(darwin|linux)$/,
  /\/ffprobe-static\/bin\/win32\/ia32$/,
];
export const skipped = (rel) => SKIP.some((r) => r.test(rel));

/** Duyệt và chép; trả về [link, đích] (tương đối, dấu /) cho mọi liên kết thư mục trong ROOT. */
export function stage(root, out, log = console.log) {
  const links = [];
  let files = 0, bytes = 0;
  const rel = (p) => relative(root, p).split(sep).join("/");
  const walk = (src) => {
    const r = rel(src);
    if (skipped(r)) return;
    const st = lstatSync(src);
    const dst = join(out, ...r.split("/"));
    if (st.isSymbolicLink()) {
      if (!existsSync(src)) return log(`  bỏ liên kết hỏng ${r}`);
      const target = realpathSync(src);
      const tr = rel(target);
      if (tr.startsWith("..") || tr.includes(":")) throw new Error(`Liên kết ra ngoài repo: ${r} → ${target}`);
      if (skipped(tr)) return;
      if (statSync(target).isDirectory()) links.push([r, tr]);
      else (mkdirSync(dirname(dst), { recursive: true }), copyFileSync(target, dst), files++);
      return;
    }
    if (st.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      for (const name of readdirSync(src)) walk(join(src, name));
      return;
    }
    if (st.isFile()) {
      copyFileSync(src, dst);
      files++;
      bytes += st.size;
    }
  };
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const name of INCLUDE) if (existsSync(join(root, name))) walk(join(root, name));
  // đích của liên kết phải nằm trong payload (có thể bị bỏ theo SKIP ở cấp con)
  const kept = links.filter(([, t]) => existsSync(join(out, ...t.split("/"))));
  writeFileSync(join(out, ".cvs-links.json"), JSON.stringify(kept));
  log(`Payload: ${files} tệp, ${(bytes / 1e6).toFixed(0)} MB, ${kept.length} liên kết → ${out}`);
  return { files, bytes, links: kept };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  if (i < 0 || !process.argv[i + 1]) {
    console.error("Cách dùng: node packaging/windows/stage.mjs --out <thư mục>");
    process.exit(2);
  }
  stage(ROOT, resolve(process.argv[i + 1]));
}
