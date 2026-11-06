import { describe, expect, it } from "vitest";
import { createLayoutState, createSimulation, releaseLayoutHomes, switchLayoutSlot } from "./forceLayout";

const place = (state, id, x, y) => state.nodes.set(id, { id, x, y, vx: 3, vy: 3 });

describe("switchLayoutSlot", () => {
  it("brings a graph's nodes back where they were, at rest", () => {
    const state = createLayoutState();
    place(state, "word:a", 10, 20);
    state.originParent.set("word:a", "word:root");

    expect(switchLayoutSlot(state, "a:meaning", "a:kanji")).toBe(false);
    state.nodes.get("word:a").x = 999;
    state.nodes.delete("word:a");
    place(state, "kanji:b", 1, 1);
    state.originParent.clear();

    expect(switchLayoutSlot(state, "a:kanji", "a:meaning")).toBe(true);
    expect([...state.nodes.keys()]).toEqual(["word:a"]);
    expect(state.nodes.get("word:a")).toMatchObject({ x: 10, y: 20, vx: 0, vy: 0 });
    expect(state.originParent.get("word:a")).toBe("word:root");
  });

  it("keeps the current nodes when there's nothing saved to return to", () => {
    const state = createLayoutState();
    place(state, "word:a", 10, 20);
    expect(switchLayoutSlot(state, "one", "two")).toBe(false);
    expect(state.nodes.get("word:a").x).toBe(10);
  });

  it("doesn't share node objects between a saved layout and the live one", () => {
    const state = createLayoutState();
    place(state, "word:a", 10, 20);
    switchLayoutSlot(state, "one", "two");
    state.nodes.get("word:a").x = 500;
    switchLayoutSlot(state, "two", "one");
    expect(state.nodes.get("word:a").x).toBe(10);
  });

  it("keeps the Maps consumers hold refs to", () => {
    const state = createLayoutState();
    const { nodes, originParent } = state;
    place(state, "word:a", 1, 1);
    switchLayoutSlot(state, "one", "two");
    switchLayoutSlot(state, "two", "one");
    expect(state.nodes).toBe(nodes);
    expect(state.originParent).toBe(originParent);
  });

  it("forgets the oldest graphs past its limit", () => {
    const state = createLayoutState();
    for (let i = 0; i < 10; i++) switchLayoutSlot(state, `g${i}`, `g${i + 1}`);
    expect(state.slots.size).toBe(8);
    expect(state.slots.has("g0")).toBe(false);
    expect(state.slots.has("g9")).toBe(true);
  });
});

describe("releaseLayoutHomes", () => {
  it("frees organized nodes and leaves the rest alone", () => {
    const state = createLayoutState();
    place(state, "word:homed", 1, 1);
    Object.assign(state.nodes.get("word:homed"), { homeX: 1, homeY: 1, fx: 1, fy: 1 });
    place(state, "word:dragged", 2, 2);
    Object.assign(state.nodes.get("word:dragged"), { fx: 2, fy: 2 });

    releaseLayoutHomes(state);

    expect(state.nodes.get("word:homed")).toMatchObject({ homeX: null, homeY: null, fx: null, fy: null, x: 1 });
    expect(state.nodes.get("word:dragged")).toMatchObject({ fx: 2, fy: 2 });
  });
});

describe("the simulation with homes", () => {
  const run = (sim) => {
    for (let i = 0; i < 300; i++) sim.tick();
  };
  const hub = (state) => {
    const nodes = [
      { id: "kanji:日", type: "kanji", char: "日", x: 300, y: 300 },
      { id: "word:甲", type: "word", word: "甲", x: 450, y: 300 },
      { id: "word:乙", type: "word", word: "乙", x: 300, y: 450 },
    ];
    for (const n of nodes) state.nodes.set(n.id, n);
    return nodes;
  };
  const LINKS = [
    { source: "kanji:日", target: "word:甲" },
    { source: "kanji:日", target: "word:乙" },
  ];
  const start = (state, nodes) => {
    const sim = createSimulation(state, 800, 600).stop();
    sim.nodes(nodes);
    sim.force("link").links(LINKS.map((l) => ({ ...l })));
    return sim;
  };

  it("rests a homed layout where it is, despite the forces", () => {
    const state = createLayoutState();
    const nodes = hub(state);
    for (const n of nodes) Object.assign(n, { homeX: n.x, homeY: n.y });
    const sim = start(state, nodes);
    sim.alpha(0.5);
    run(sim);
    for (const n of nodes) {
      expect(Math.hypot(n.x - n.homeX, n.y - n.homeY)).toBeLessThan(25);
    }
  });

  it("lets a homed node be pushed, and brings it back", () => {
    const state = createLayoutState();
    const nodes = hub(state);
    for (const n of nodes) Object.assign(n, { homeX: n.x, homeY: n.y });
    const sim = start(state, nodes);
    const word = nodes[1];
    const offHome = () => Math.hypot(word.x - word.homeX, word.y - word.homeY);
    word.x += 120;
    sim.alpha(0.5);
    sim.tick();
    expect(offHome()).toBeGreaterThan(50);
    run(sim);
    expect(offHome()).toBeLessThan(25);
  });

  it("leaves a node with no home to the usual forces", () => {
    const state = createLayoutState();
    const nodes = hub(state);
    const sim = start(state, nodes);
    const before = nodes[1].x;
    sim.alpha(0.5);
    run(sim);
    expect(nodes[1].x).not.toBe(before);
  });
});
