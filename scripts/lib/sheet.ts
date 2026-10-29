// Ảnh ghép khung hình (contact sheet) – dựng bằng Chromium để không cần thư viện ảnh native.
import { readFileSync } from "node:fs";
import type { Browser } from "playwright";

export async function contactSheet(frames: { file: string; label?: string }[], out: string, browser: Browser, cols = 3, w = 640) {
  const h = Math.round((w * 9) / 16);
  const rows = Math.ceil(frames.length / cols);
  const page = await browser.newPage({ viewport: { width: cols * w, height: rows * (h + 34) } });
  const cells = frames
    .map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f.file).toString("base64")}"><figcaption>${(f.label ?? "").replace(/</g, "&lt;")}</figcaption></figure>`)
    .join("");
  await page.setContent(
    `<style>body{margin:0;display:grid;grid-template-columns:repeat(${cols},${w}px);background:#222;font:16px sans-serif;color:#eee}figure{margin:0}img{width:${w}px;height:${h}px;display:block}figcaption{height:34px;line-height:34px;padding:0 8px;overflow:hidden;white-space:nowrap}</style>${cells}`,
  );
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  return out;
}
