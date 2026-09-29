import { describe, expect, it } from "vitest";
import { fitTransform, overlayInsets } from "./fitTransform";

const kanji = (x, y) => ({ type: "kanji", x, y }); // radius 24

// Where a graph point lands on screen under transform t.
const screen = (t, x, y) => [t.x + t.k * x, t.y + t.k * y];

describe("fitTransform", () => {
  it("returns null with no placed nodes", () => {
    expect(fitTransform([], 400, 600)).toBeNull();
    expect(fitTransform([{ type: "kanji", x: NaN, y: 1 }], 400, 600)).toBeNull();
  });

  it("centers a small graph without zooming in past 1:1", () => {
    // Laid out around (400, 300) -- the pre-measure 800x600 default -- on a
    // 390px-wide phone, which is what pushed nodes off the right edge.
    const t = fitTransform([kanji(360, 300), kanji(440, 300)], 390, 600);
    expect(t.k).toBe(1);
    expect(screen(t, 400, 300)).toEqual([195, 300]);
  });

  it("zooms out so every node, radius included, clears the padding", () => {
    const nodes = [kanji(0, 0), kanji(600, 0), kanji(300, 800)]; // k stays above the 0.3 floor
    const pad = { left: 30, right: 70, top: 20, bottom: 140 };
    const t = fitTransform(nodes, 390, 600, { pad });
    expect(t.k).toBeLessThan(1);
    for (const n of nodes) {
      const [sx, sy] = screen(t, n.x, n.y);
      expect(sx - 24 * t.k).toBeGreaterThanOrEqual(pad.left - 1e-9);
      expect(sx + 24 * t.k).toBeLessThanOrEqual(390 - pad.right + 1e-9);
      expect(sy - 24 * t.k).toBeGreaterThanOrEqual(pad.top - 1e-9);
      expect(sy + 24 * t.k).toBeLessThanOrEqual(600 - pad.bottom + 1e-9);
    }
  });

  it("centers in the space the padding leaves", () => {
    const t = fitTransform([kanji(0, 0)], 400, 600, { pad: { left: 100, right: 0, top: 0, bottom: 200 } });
    expect(screen(t, 0, 0)).toEqual([250, 200]);
  });

  it("never zooms out past the floor", () => {
    const t = fitTransform([kanji(0, 0), kanji(100000, 0)], 390, 600, { minK: 0.3 });
    expect(t.k).toBe(0.3);
  });
});

describe("overlayInsets", () => {
  // a 400x600 graph at (0, 100)
  const graph = { left: 0, right: 400, top: 100, bottom: 700, width: 400, height: 600 };
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

  it("clears a narrow side column sideways and a wide top bar downward", () => {
    const zoomColumn = rect(350, 400, 390, 690); // tall + narrow, right edge
    const toolbar = rect(10, 110, 390, 150); // wide, top edge
    expect(overlayInsets(graph, [zoomColumn, toolbar])).toEqual({ left: 0, right: 58, top: 58, bottom: 0 });
  });

  it("clears a squat bottom corner box downward when that's cheaper", () => {
    const legend = rect(10, 650, 300, 690); // wide + short, bottom-left
    expect(overlayInsets(graph, [legend])).toEqual({ left: 0, right: 0, top: 0, bottom: 58 });
  });

  it("ignores hidden overlays and ones outside the graph", () => {
    const hidden = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    expect(overlayInsets(graph, [hidden, rect(0, 20, 50, 90), rect(0, 700, 50, 760)])).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });
});
