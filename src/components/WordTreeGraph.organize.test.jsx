import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { organizeLayout } from "../graph/organizeLayout";
import WordTreeGraph from "./WordTreeGraph";

beforeAll(() => {
  // No animation to wait out.
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGraph(words = ["日本", "日常", "毎日"]) {
  const nodes = new Map([
    ["word:日本語", { id: "word:日本語", type: "word", word: "日本語", isRoot: true, expanded: true }],
    ["kanji:日", { id: "kanji:日", type: "kanji", char: "日", expanded: true }],
  ]);
  const links = [{ source: "word:日本語", target: "kanji:日" }];
  for (const w of words) {
    nodes.set(`word:${w}`, { id: `word:${w}`, type: "word", word: w, expanded: false });
    links.push({ source: "kanji:日", target: `word:${w}` });
  }
  return { nodes, links };
}

const props = { selectedId: "word:日本語", onNodeClick: () => {}, onNodeExpand: () => {} };
const nodeEl = (label) =>
  [...document.querySelectorAll("[data-node]")].find((g) => g.querySelector(".graph-node__label")?.textContent === label);
const where = (label) => {
  const m = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(nodeEl(label).getAttribute("transform"));
  return { x: Number(m[1]), y: Number(m[2]) };
};
// A spring holds it near there, not exactly on it.
const NEAR_HOME = 25;
const distanceFrom = (label, p) => {
  const at = where(label);
  return Math.hypot(at.x - p.x, at.y - p.y);
};
const expectAt = (label, p) => expect(distanceFrom(label, p)).toBeLessThan(NEAR_HOME);
const organize = () => fireEvent.click(screen.getByRole("button", { name: "Organize graph" }));

describe("WordTreeGraph Organize", () => {
  it("moves every node to the organized layout, and it rests there", async () => {
    const graph = makeGraph();
    render(<WordTreeGraph {...props} graph={graph} />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());

    organize();
    const targets = organizeLayout(graph, { width: 800, height: 600 });
    await waitFor(() => expectAt("毎日", targets.get("word:毎日")));

    await sleep(1200); // long enough for forces with nothing holding them to pull it apart
    expectAt("日", targets.get("kanji:日"));
    expectAt("毎日", targets.get("word:毎日"));
  });

  it("keeps holding as the graph grows, and leaves new nodes free", async () => {
    const graph = makeGraph();
    const { rerender } = render(<WordTreeGraph {...props} graph={graph} />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    organize();
    const targets = organizeLayout(graph, { width: 800, height: 600 });
    await waitFor(() => expectAt("毎日", targets.get("word:毎日")));

    rerender(<WordTreeGraph {...props} graph={makeGraph(["日本", "日常", "毎日", "今日"])} />);
    await waitFor(() => expect(nodeEl("今日")).toBeTruthy());
    const placedAt = where("今日");
    await sleep(300);
    expectAt("毎日", targets.get("word:毎日"));
    expect(where("今日")).not.toEqual(placedAt);
  });

  it("lets go once nodes leave the graph", async () => {
    const graph = makeGraph();
    const { rerender } = render(<WordTreeGraph {...props} graph={graph} />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    organize();
    const targets = organizeLayout(graph, { width: 800, height: 600 });
    await waitFor(() => expectAt("毎日", targets.get("word:毎日")));

    rerender(<WordTreeGraph {...props} graph={makeGraph(["毎日"])} />);
    await sleep(300);
    expect(where("毎日")).not.toEqual(targets.get("word:毎日"));
  });

  it("lets go on returning to a graph that has lost nodes since", async () => {
    const graph = makeGraph();
    const { rerender } = render(<WordTreeGraph {...props} graph={graph} layoutSlot="a" />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    organize();
    const targets = organizeLayout(graph, { width: 800, height: 600 });
    await waitFor(() => expectAt("毎日", targets.get("word:毎日")));

    rerender(<WordTreeGraph {...props} graph={makeGraph(["他"])} layoutSlot="b" />);
    await waitFor(() => expect(nodeEl("他")).toBeTruthy());
    rerender(<WordTreeGraph {...props} graph={makeGraph(["毎日"])} layoutSlot="a" />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    await sleep(300);
    expect(where("毎日")).not.toEqual(targets.get("word:毎日"));
  });

  it("isn't moved by a tap that wobbles a little", async () => {
    const graph = makeGraph();
    render(<WordTreeGraph {...props} graph={graph} />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    organize();
    const target = organizeLayout(graph, { width: 800, height: 600 }).get("word:毎日");
    await waitFor(() => expectAt("毎日", target));

    const pointer = { pointerType: "mouse", pointerId: 1, button: 0 };
    fireEvent.pointerDown(nodeEl("毎日"), { ...pointer, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { ...pointer, clientX: 301, clientY: 300 });
    fireEvent.pointerUp(window, { ...pointer, clientX: 301, clientY: 300 });
    await sleep(200);
    expectAt("毎日", target);
  });

  it("stays alive: a drag tugs the neighbours, which settle back, and the node stays where it's dropped", async () => {
    const graph = makeGraph();
    render(<WordTreeGraph {...props} graph={graph} />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    organize();
    const targets = organizeLayout(graph, { width: 800, height: 600 });
    await waitFor(() => expectAt("日", targets.get("kanji:日")));
    await sleep(600);

    const root = targets.get("word:日本語");
    const pointer = { pointerType: "mouse", pointerId: 1, button: 0 };
    fireEvent.pointerDown(nodeEl("日"), { ...pointer, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { ...pointer, clientX: 500, clientY: 400 });
    await sleep(300);
    expect(distanceFrom("日本語", root)).toBeGreaterThan(3);
    const dropped = where("日");

    fireEvent.pointerUp(window, { ...pointer, clientX: 500, clientY: 400 });
    await sleep(1500);
    expect(distanceFrom("日", dropped)).toBeLessThan(NEAR_HOME);
    expect(distanceFrom("日本語", root)).toBeLessThan(NEAR_HOME);
  });

  it("flows outward along only the selected node's lines, whichever way round they run", async () => {
    const { rerender } = render(<WordTreeGraph {...props} graph={makeGraph()} selectedId="kanji:日" />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    const flows = () => [...document.querySelectorAll(".graph-link-flow")];
    // Where the gradient on a flow starts, which is the end it flows from.
    const flowStart = (flow) => {
      const id = /url\(#(.+)\)/.exec(flow.getAttribute("stroke"))[1];
      const gradient = document.getElementById(id);
      return { x: Number(gradient.getAttribute("x1")), y: Number(gradient.getAttribute("y1")) };
    };
    // Selected 日: one link arrives from 日本語, three leave for its words, so
    // the first runs the other way round from the rest.
    expect(flows()).toHaveLength(4);
    for (const flow of flows()) expect(flowStart(flow)).toEqual(where("日"));

    rerender(<WordTreeGraph {...props} graph={makeGraph()} selectedId="word:毎日" />);
    // The only link runs 日 -> 毎日, into the selected node.
    expect(flows()).toHaveLength(1);
    expect(flowStart(flows()[0])).toEqual(where("毎日"));
  });

  it("starts the flow only once the selected node, and so its glow, is on the graph", async () => {
    const stops = () => document.querySelectorAll(".graph-link-flow__stop");
    const { rerender } = render(<WordTreeGraph {...props} graph={makeGraph()} selectedId="word:not-here-yet" />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    expect(stops()).toHaveLength(0);
    expect(document.querySelector(".graph-node__select-glow")).toBeNull();

    rerender(<WordTreeGraph {...props} graph={makeGraph()} selectedId="word:毎日" />);
    expect(stops().length).toBeGreaterThan(0);
    expect(document.querySelector(".graph-node__select-glow")).toBeTruthy();
    // The first stop is at the selected node's end, and starts with the breath.
    expect(stops()[0].style.animationDelay).toBe("260ms");
  });

  it("ends a drag still going on, so its release can't save bad positions", async () => {
    const graph = makeGraph();
    render(<WordTreeGraph {...props} graph={graph} />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());

    const pointer = { pointerType: "mouse", pointerId: 1, button: 0 };
    fireEvent.pointerDown(nodeEl("日"), { ...pointer, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { ...pointer, clientX: 340, clientY: 340 });
    organize();
    fireEvent.pointerUp(window, { ...pointer, clientX: 340, clientY: 340 });

    const targets = organizeLayout(graph, { width: 800, height: 600 });
    await sleep(1200);
    expectAt("日本語", targets.get("word:日本語"));
    expectAt("日", targets.get("kanji:日"));
    expectAt("毎日", targets.get("word:毎日"));
  });

  it("marks the selected node's own lines", async () => {
    const { rerender } = render(<WordTreeGraph {...props} graph={makeGraph()} selectedId="kanji:日" />);
    await waitFor(() => expect(nodeEl("毎日")).toBeTruthy());
    expect(document.querySelectorAll(".graph-link--incident")).toHaveLength(4);
    rerender(<WordTreeGraph {...props} graph={makeGraph()} selectedId="word:毎日" />);
    expect(document.querySelectorAll(".graph-link--incident")).toHaveLength(1);
  });
});
