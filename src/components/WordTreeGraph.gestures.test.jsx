import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WordTreeGraph, { LONG_PRESS_MS } from "./WordTreeGraph";

function makeGraph() {
  const nodes = new Map([
    ["w:日本", { id: "w:日本", type: "word", word: "日本", isRoot: true, expanded: true }],
    ["k:日", { id: "k:日", type: "kanji", char: "日", expanded: false }],
  ]);
  return { nodes, links: [{ source: "w:日本", target: "k:日" }] };
}

// Nodes appear once the force simulation's first tick re-renders (driven by
// d3-timer), so mount on real timers and only then freeze time for the
// press/hold timing itself.
async function renderGraph() {
  const onNodeClick = vi.fn();
  const onNodeExpand = vi.fn();
  const utils = render(
    <WordTreeGraph graph={makeGraph()} selectedId="w:日本" onNodeClick={onNodeClick} onNodeExpand={onNodeExpand} />
  );
  const kanji = () =>
    [...utils.container.querySelectorAll("[data-node]")].find(
      (g) => g.textContent.includes("日") && !g.textContent.includes("本")
    );
  await waitFor(() => expect(kanji()).toBeTruthy());
  vi.useFakeTimers();
  return { onNodeClick, onNodeExpand, kanji };
}

function press(el, pointerType, { x = 0, y = 0 } = {}) {
  fireEvent.pointerDown(el, { pointerType, clientX: x, clientY: y, pointerId: 1 });
}
function release(pointerType, { x = 0, y = 0 } = {}) {
  fireEvent.pointerUp(window, { pointerType, clientX: x, clientY: y, pointerId: 1 });
}

describe("WordTreeGraph node gestures", () => {
  afterEach(() => vi.useRealTimers());

  it("a tap selects without expanding", async () => {
    const { onNodeClick, onNodeExpand, kanji } = await renderGraph();
    press(kanji(), "touch");
    release("touch");
    expect(onNodeClick).toHaveBeenCalledWith("k:日");
    expect(onNodeExpand).not.toHaveBeenCalled();
  });

  it("a double tap expands", async () => {
    const { onNodeExpand, kanji } = await renderGraph();
    press(kanji(), "touch");
    release("touch");
    act(() => vi.advanceTimersByTime(150));
    press(kanji(), "touch");
    release("touch");
    expect(onNodeExpand).toHaveBeenCalledOnce();
    expect(onNodeExpand).toHaveBeenCalledWith("k:日");
  });

  it("press and hold expands once, and the release isn't counted as another tap", async () => {
    const { onNodeClick, onNodeExpand, kanji } = await renderGraph();
    press(kanji(), "touch");
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onNodeExpand).toHaveBeenCalledOnce();
    release("touch");
    expect(onNodeClick).toHaveBeenCalledOnce();
    // A quick tap right after doesn't pair with the hold into a double-tap.
    press(kanji(), "touch");
    release("touch");
    expect(onNodeExpand).toHaveBeenCalledOnce();
  });

  it("a hold that turns into a drag doesn't expand", async () => {
    const { onNodeExpand, kanji } = await renderGraph();
    press(kanji(), "touch");
    fireEvent.pointerMove(window, { pointerType: "touch", clientX: 40, clientY: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    release("touch", { x: 40 });
    expect(onNodeExpand).not.toHaveBeenCalled();
  });

  it("holding still with a mouse doesn't expand (desktop drag is unchanged)", async () => {
    const { onNodeExpand, kanji } = await renderGraph();
    press(kanji(), "mouse");
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    release("mouse");
    expect(onNodeExpand).not.toHaveBeenCalled();
  });
});
