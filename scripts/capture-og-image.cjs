// Regenerates public/og-image.png, the 1200x630 link-preview card: a
// headline + call to action on the left, the real 学校 graph (both kanji
// expanded, light theme) on the right. Colors/type follow DESIGN.md.
// Needs Playwright, which isn't a project dep:
//   npm run build && npx vite preview --port 4319 --strictPort
//   npm i --no-save playwright
//   node scripts/capture-og-image.cjs public/og-image.png [http://localhost:4319/]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const out = process.argv[2] || "public/og-image.png";
const APP = process.argv[3] || "http://localhost:4319/";
const logo = fs
  .readFileSync(path.join(__dirname, "../public/moto_logo_light.svg"), "utf8")
  .replace(/^<\?xml[^>]*>/, "")
  .replace(/width="400"\s+height="400"/, 'width="100%" height="100%"');

async function captureGraph(browser) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.addInitScript(() => localStorage.setItem("word-tree:theme", "light"));
  await p.goto(APP);
  await p.waitForTimeout(3000);
  await p.getByPlaceholder("Search...").fill("学校");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1500);
  for (const k of ["学", "校"]) {
    await p.locator("svg text.graph-node__label", { hasText: new RegExp(`^${k}$`) }).first().dblclick({ force: true });
    await p.waitForTimeout(1500);
  }
  await p.locator("svg text.graph-node__label", { hasText: /^学校$/ }).first().click({ force: true });
  await p.waitForTimeout(2500);
  await p.getByLabel("Reset zoom").click();
  await p.waitForTimeout(1500);
  await p.getByLabel("Zoom out").click(); // room for the outer ring of words
  await p.waitForTimeout(1000);
  // Only the graph itself: no legend, zoom buttons, or hover states.
  await p.addStyleTag({ content: ".graph-legend, .graph-zoom-controls { display: none !important; }" });
  await p.mouse.move(0, 0);
  // The graph canvas is the panel's largest svg (the rest are toolbar icons).
  await p.evaluate(() => {
    const svgs = [...document.querySelectorAll(".graph-panel svg")];
    const area = (s) => s.getBoundingClientRect().width * s.getBoundingClientRect().height;
    svgs.sort((a, b) => area(b) - area(a))[0].setAttribute("data-og-canvas", "");
  });
  const png = await p.locator("[data-og-canvas]").screenshot();
  await p.close();
  return png.toString("base64");
}

function card(graphB64) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Shippori+Mincho:wght@500;600&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #e7e2d1; color: #1c1a14;
    font-family: "Instrument Sans", sans-serif; display: flex; overflow: hidden; }
  .copy { width: 560px; padding: 64px 0 64px 64px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 12px; font-family: "Shippori Mincho", serif;
    font-size: 28px; font-weight: 500; }
  .brand .mark { width: 44px; height: 44px; }
  h1 { font-family: "Shippori Mincho", serif; font-weight: 500; font-size: 58px; line-height: 1.12;
    letter-spacing: -1.7px; margin-top: 56px; }
  p { font-size: 24px; line-height: 1.45; color: #4a4438; margin-top: 24px; max-width: 460px; }
  .cta { margin-top: auto; display: flex; align-items: center; gap: 20px; }
  .btn { background: #c33a2e; color: #fff; font-weight: 600; font-size: 24px; padding: 16px 28px;
    border-radius: 6px; }
  .url { font-size: 20px; color: #4a4438; }
  .graph { flex: 1; margin: 40px 40px 40px 8px; border-radius: 8px; border: 1px solid #c9c2ac;
    background: url(data:image/png;base64,${graphB64}) center / cover no-repeat; }
</style></head><body>
  <div class="copy">
    <div class="brand"><span class="mark">${logo}</span>Moto 元</div>
    <h1>Every Japanese word is a web.</h1>
    <p>Type a word, see its kanji, and every word that shares them.</p>
    <div class="cta"><span class="btn">Explore free →</span><span class="url">moto.souravbanerjee.com</span></div>
  </div>
  <div class="graph"></div>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const graph = await captureGraph(browser);
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(card(graph), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out });
  await browser.close();
})();
