// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadSeoData } from "../../api/seo.js";
import { renderGraphPreview } from "./graphPreview.js";

const data = loadSeoData();
const labels = (svg) =>
  [...svg.matchAll(/class="graph-node__label"[^>]*>(.*?)<\/text>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ""))
    .sort();

describe("graph previews", () => {
  it("shows exactly the graph Explore opens: 学校 with 学 and 校 expanded", () => {
    const svg = renderGraphPreview(data, { root: "学校", kanji: ["学", "校"] });
    const shown = labels(svg);
    // The root, its two kanji, and each kanji's 8 most common words
    // (words-per-branch default), minus 学校 itself.
    expect(shown).toContain("学校");
    expect(shown).toContain("学");
    expect(shown).toContain("校");
    const top = (c) => data.kanji[c].words.map((w) => w[0]).filter((w) => w !== "学校").slice(0, 8);
    for (const w of [...top("学"), ...top("校")]) expect(shown, w).toContain(w);
    expect(new Set(shown).size).toBe(3 + new Set([...top("学"), ...top("校")]).size);
  });

  it("draws the selected root the way the explorer does", () => {
    const svg = renderGraphPreview(data, { root: "学校", kanji: ["学", "校"] });
    expect(svg.match(/graph-link--kanji-path/g)).toHaveLength(2); // root -> each kanji
    expect(svg.match(/graph-node--kanji-path-target/g)).toHaveLength(2);
    expect(svg.match(/graph-node__select-glow/g)).toHaveLength(1);
    expect(svg.match(/graph-node__kanji-mark/g)).toHaveLength(2);
    expect(svg).toMatch(/graph-node__expand-ring/); // words still have more
  });

  it("is deterministic, so the edge cache and crawlers see one layout", () => {
    const a = renderGraphPreview(data, { root: "生", kanji: ["生"] });
    const b = renderGraphPreview(data, { root: "生", kanji: ["生"] });
    expect(a).toBe(b);
    expect(a).toMatch(/^<svg class="gp" viewBox="[-\d. ]+"/);
  });
});
