import { chromium } from "playwright";
const S = process.env.S ?? "tests/.out/ui";
const BASE = "http://localhost:3000";
const PID = "20261101-c8c84b";
const b = await chromium.launch();
const errs = [];
for (const [tag, vp, mobile] of [["pc", { width: 1366, height: 900 }, false], ["dt", { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${tag}: ${e.message}`));
  p.on("response", (r) => r.status() >= 400 && errs.push(`${tag} ${r.status()} ${r.url().slice(0, 140)}`));
  for (const [name, path, wait] of [
    ["home", "/", "Tạo dự án mới"],
    ["nguon", `/p/${PID}/nguon`, null],
    ["phan-tich", `/p/${PID}/phan-tich`, null],
    ["doc", `/p/${PID}/doc`, null],
    ["phong-cach", `/p/${PID}/phong-cach`, null],
    ["giong", `/p/${PID}/giong`, null],
    ["san-xuat", `/p/${PID}/san-xuat`, "Kiểm tra trước khi sản xuất"],
    ["duyet", `/p/${PID}/duyet`, null],
    ["duyet-video", `/p/${PID}/duyet/CAR-L1_MO1_U1.5_1`, "Các cảnh"],
  ]) {
    await p.goto(BASE + path);
    if (wait) await p.getByText(wait).first().waitFor({ timeout: 15000 });
    await p.waitForTimeout(1800);
    const ov = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll("main > *")].map((e) => e.getBoundingClientRect().right)) - w, vp.width);
    if (ov > 0) errs.push(`${tag} ${name}: tràn ngang ${ov}px`);
    await p.screenshot({ path: `${S}/${tag}-${name}.png`, fullPage: !mobile ? false : false });
  }
  if (!mobile) {
    await p.goto(`${BASE}/p/${PID}/san-xuat`);
    await p.getByText("Làm lại một phần").first().click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${S}/${tag}-san-xuat-menu.png` });
    await p.goto(`${BASE}/p/${PID}/phong-cach`);
    await p.waitForTimeout(1500);
    await p.getByText("Font chữ trong video").scrollIntoViewIfNeeded();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${S}/${tag}-font.png` });
    await p.evaluate(() => window.scrollTo(0, 0));
    const img = p.locator("img.shot").first();
    if (await img.count()) { await img.click(); await p.waitForTimeout(500); await p.screenshot({ path: `${S}/${tag}-zoom.png` }); }
  }
  await ctx.close();
}
await b.close();
console.log(errs.join("\n") || "không lỗi");
