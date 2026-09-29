import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WordTreeGraph from "./WordTreeGraph";

// jsdom has no SVG geometry; d3-zoom reads the svg's width/height baseVal
// to find its viewport, so give it one.
const baseVal = (v) => ({ get: () => ({ baseVal: { value: v } }), configurable: true });
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, "width", baseVal(800));
  Object.defineProperty(SVGSVGElement.prototype, "height", baseVal(600));
});
afterAll(() => {
  delete SVGSVGElement.prototype.width;
  delete SVGSVGElement.prototype.height;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGraph() {
  const nodes = new Map([
    ["w:日本", { id: "w:日本", type: "word", word: "日本", isRoot: true, expanded: true }],
    ["k:日", { id: "k:日", type: "kanji", char: "日", expanded: false }],
  ]);
  return { nodes, links: [{ source: "w:日本", target: "k:日" }] };
}

describe("WordTreeGraph auto-framing", () => {
  it("re-frames when viewKey changes (graph Reset / tour), after the user moved the view", async () => {
    const props = { graph: makeGraph(), selectedId: "w:日本", onNodeClick: () => {}, onNodeExpand: () => {} };
    const { container, rerender } = render(<WordTreeGraph {...props} viewKey={0} />);
    const canvas = () => [...container.querySelectorAll("svg")].find((s) => s.querySelector("[data-node]"));
    // The zoom layer: the canvas's top-level <g>.
    const view = () => canvas()?.querySelector(":scope > g")?.getAttribute("transform") ?? null;

    // Auto-fit runs once the layout settles.
    await waitFor(() => expect(view()).toMatch(/translate/), { timeout: 8000 });
    await sleep(800); // let the fit transition finish

    fireEvent.wheel(canvas(), { deltaY: -400, clientX: 400, clientY: 300 });
    await sleep(300);
    const moved = view();
    await sleep(1500);
    expect(view()).toBe(moved); // the user's view sticks

    // Same graph, same root -- only the key says "start over".
    rerender(<WordTreeGraph {...props} viewKey={1} />);
    await waitFor(() => expect(view()).not.toBe(moved), { timeout: 8000 });
  }, 20000);
});
