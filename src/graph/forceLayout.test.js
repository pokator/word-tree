import { describe, expect, it } from "vitest";
import { createLayoutState, switchLayoutSlot } from "./forceLayout";

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
