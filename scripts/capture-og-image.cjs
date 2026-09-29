// Regenerates public/og-image.png (the link-preview image): the 学校 graph
// with both kanji expanded, light theme, rendered at 1440x756 and scaled
// to 1200x630. Needs Playwright + ffmpeg, which aren't project deps:
//   npm run build && npx vite preview --port 4317 --strictPort
//   npm i --no-save playwright
//   node scripts/capture-og-image.cjs og-big.png 1440 756
//   ffmpeg -i og-big.png -vf scale=1200:630:flags=lanczos public/og-image.png
// (without ffmpeg: node scripts/capture-og-image.cjs public/og-image.png --
// the default 1200x630 viewport crops the graph a little)
const { chromium } = require("playwright");
const [,, out, w = "1200", h = "630"] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.addInitScript(() => localStorage.setItem("word-tree:theme", "light"));
  await p.goto("http://localhost:4317/");
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
  await p.getByLabel("Zoom out").click();
  await p.waitForTimeout(800);
  await p.evaluate(() => document.activeElement?.blur());
  await p.mouse.move(0, 0);
  await p.screenshot({ path: out });
  await b.close();
})();
