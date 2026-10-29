// Sản xuất → duyệt → xuất qua giao diện (cần worker + web đang chạy; CVS_TTS_MOCK=1 nếu không có CIT).
import { chromium } from "playwright";
const S = process.env.S ?? ".";
const BASE = process.env.BASE ?? "http://localhost:3000";
const projects = await (await fetch(`${BASE}/api/projects`)).json();
const pid = projects[0].id;
const KEY = "CAR-L1_MO2_U2.2_1";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${BASE}/p/${pid}/san-xuat`);
const card = p.locator(".card", { hasText: KEY }).first();
const prod = card.getByRole("button", { name: "▶ Sản xuất" });
if (await prod.count()) await prod.click();
await p.waitForTimeout(6000);
await p.screenshot({ path: `${S}/ui-7.png`, fullPage: true });
for (let i = 0; i < 300; i++) {
  const v = (await (await fetch(`${BASE}/api/projects/${pid}/videos`)).json()).find((x) => x.key === KEY);
  if (v.rendered && !v.job) break;
  await p.waitForTimeout(2000);
}
await p.goto(`${BASE}/p/${pid}/duyet/${KEY}`);
await p.getByText("Báo cáo QA").waitFor();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${S}/ui-8.png`, fullPage: true });
await p.getByRole("button", { name: "✓ Duyệt" }).click();
await p.waitForTimeout(800);
await p.goto(`${BASE}/p/${pid}/xuat`);
await p.getByRole("button", { name: /Xuất 1 video/ }).click();
await p.getByText("Đã xuất 1 video").waitFor();
await p.screenshot({ path: `${S}/ui-9.png` });
await p.goto(`${BASE}/p/${pid}/don-dep`);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${S}/ui-10.png` });
console.log("errors", errs);
await b.close();
