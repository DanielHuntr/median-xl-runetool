import { chromium } from "playwright";
const b = await chromium.launch({ channel: "msedge" });
for (const [tag, vp] of [["desktop", { width: 1400, height: 900 }], ["phone", { width: 390, height: 844 }], ["tablet", { width: 800, height: 1000 }]]) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:5198/#runewords"); await p.waitForSelector(".tour-card");
  const check = () => p.evaluate(() => {
    const t = document.querySelector("#tour-title").textContent, spot = document.querySelector(".tour-spot"), el = document.querySelector("[data-tour-target]");
    if (!spot || !el) return { t, why: `outline ${!!spot}, target ${!!el}` };
    const s = spot.getBoundingClientRect(), r = el.getBoundingClientRect(), vh = innerHeight;
    const want = [r.left - 4, Math.max(r.top, 0) - 4, r.width + 8, Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) + 8];
    const off = Math.max(...[s.left, s.top, s.width, s.height].map((v, i) => Math.abs(v - want[i])));
    const onScreen = r.bottom > 0 && r.top < vh && r.width > 0;
    return { t, off: Math.round(off), onScreen, visible: getComputedStyle(spot).opacity === "1" };
  });
  const bad = [];
  await p.locator(".tour-next").click();
  for (let i = 1; i < 32; i++) {
    await p.waitForTimeout(1000); const a = await check();
    await p.waitForTimeout(1800); const z = await check();
    for (const [when, r] of [["arrival", a], ["after demo", z]]) if (r.why || r.off > 1 || !r.onScreen || !r.visible) bad.push(`${i + 1} ${r.t} (${when}): ${r.why || `off by ${r.off}px, on screen ${r.onScreen}, visible ${r.visible}`}`);
    await p.locator(".tour-next").click();
  }
  console.log(tag, bad.length ? "\n  " + bad.join("\n  ") : "every outline aligned and visible", errs);
}
await b.close();
