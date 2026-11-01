// Ảnh chụp giao diện ở cỡ màn hình điện thoại (390×844).
import { chromium } from "playwright";
const S = process.env.S ?? ".";
const BASE = process.env.BASE ?? "http://localhost:3000";
const pid = (await (await fetch(`${BASE}/api/projects`)).json())[0].id;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const [n, path] of [["m1", `/p/${pid}/phong-cach`], ["m2", `/p/${pid}/giong`], ["m3", `/p/${pid}/san-xuat`], ["m4", "/claude"]]) {
  await p.goto(BASE + path);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${S}/${n}.png` });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(n, path, "tràn ngang:", over);
}
await b.close();
