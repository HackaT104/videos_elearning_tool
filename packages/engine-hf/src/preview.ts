// Xem trước: harness Playwright nạp index.html, nạp từng cảnh vào host, seek(t) mọi timeline, chụp PNG; đo bố cục.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import type { LayoutIssue, PreviewResult } from "@cvs/engine";
import { HARNESS_JS } from "./harness";
import { serveDir, type StaticServer } from "./server";

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const executablePath = process.env.CVS_CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath, args: ["--disable-web-security", "--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"] });
}

export type HfPage = { page: Page; server: StaticServer; errors: string[]; close(): Promise<void> };

export async function openComposition(browser: Browser, workDir: string): Promise<HfPage> {
  const server = await serveDir(workDir);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript({ content: HARNESS_JS });
  await page.goto(`${server.url}/index.html`, { waitUntil: "load" });
  await page.evaluate(() => (window as any).__cvs.mount());
  const pageErrors: string[] = await page.evaluate(() => (window as any).__cvs.errors.slice());
  errors.push(...pageErrors);
  return {
    page,
    server,
    errors,
    async close() {
      await page.close();
      await server.close();
    },
  };
}

export async function seek(page: Page, t: number) {
  await page.evaluate((tt) => (window as any).__cvs.seek(tt), t);
}

export async function hfPreview(workDir: string, times: { t: number; scene?: string; label?: string }[], outDir: string, opts: { browser?: Browser } = {}): Promise<PreviewResult> {
  mkdirSync(outDir, { recursive: true });
  const browser = opts.browser ?? (await launchBrowser());
  const hp = await openComposition(browser, workDir);
  const frames: PreviewResult["frames"] = [];
  const layout: LayoutIssue[] = [];
  try {
    for (const [i, x] of times.entries()) {
      await seek(hp.page, x.t);
      const file = join(outDir, `f${String(i).padStart(3, "0")}_${x.t.toFixed(2)}s.png`);
      await hp.page.screenshot({ path: file, type: "png" });
      frames.push({ t: x.t, file, scene: x.scene, label: x.label });
      if (x.scene) {
        const issues: Omit<LayoutIssue, "scene" | "t">[] = await hp.page.evaluate((sid) => (window as any).__cvs.layout(sid), x.scene);
        for (const is of issues) layout.push({ ...is, scene: x.scene, t: x.t });
      }
    }
  } finally {
    await hp.close();
    if (!opts.browser) await browser.close();
  }
  // gộp lỗi bố cục trùng (cùng phần tử, cùng loại)
  const seen = new Set<string>();
  const uniq = layout.filter((l) => {
    const k = `${l.scene}|${l.kind}|${l.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { frames, errors: [...new Set(hp.errors)], layout: uniq };
}
