import { describe, expect, it } from "vitest";
import * as fixture from "../data/japaneseData";
import { luckyCandidates, planLuckyGraph } from "./lucky";
import { replayGraph } from "./exploreState";

const dataset = fixture;

// A seeded generator, so each plan is repeatable.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// An already-loaded stand-in for data/semantic.js's store.
const NEIGHBOURS = {
  学校: [["先生", 70], ["学生", 66], ["小学校", 60], ["中学校", 58], ["社会", 50], ["会社", 49], ["電車", 45], ["日本語", 44], ["外国語", 43], ["国語", 42]],
  先生: [["学生", 72], ["学校", 70]],
  学生: [["先生", 72], ["学校", 66]],
};
const semantic = {
  freqOf: () => 1000,
  hasNeighbours: (w) => w in NEIGHBOURS,
  neighboursOf: (w) => NEIGHBOURS[w] ?? [],
};
const load = async () => {};

describe("luckyCandidates", () => {
  it("keeps short all-kanji words whose kanji have families", () => {
    const words = luckyCandidates({
      ...dataset,
      WORDS: [
        { word: "学校", rank: 1 },
        { word: "学ぶ", rank: 1 }, // has kana
        { word: "学生", rank: undefined }, // unranked
      ],
      WORDS_CONTAINING_KANJI: { 学: Array(9).fill("x"), 校: Array(9).fill("x") },
    });
    expect(words).toEqual(["学校"]);
  });
});

describe("planLuckyGraph", () => {
  const base = { candidates: ["学校"], semantic, loadSemantic: load };

  it("plans a kanji graph that opens every root kanji and goes one step further", async () => {
    const plan = await planLuckyGraph(dataset, { ...base, flavour: "kanji", random: seeded(1) });
    expect(plan).toMatchObject({ root: "学校", mode: "kanji", start: "kanji" });
    expect(plan.ops.slice(0, 2)).toEqual(["k:学~5", "k:校~5"]);
    // Every op names its batch size, so the graph doesn't follow the viewer's setting.
    expect(plan.ops.every((op) => !op.startsWith("k:") || /~\d/.test(op))).toBe(true);
  });

  it("plans a meaning graph that opens neighbours with their own lists", async () => {
    const plan = await planLuckyGraph(dataset, { ...base, flavour: "meaning", random: seeded(2) });
    expect(plan).toMatchObject({ root: "学校", mode: "meaning", start: "word" });
    expect(plan.ops[0]).toBe("s:学校~9");
    for (const op of plan.ops.slice(1)) expect(["s:先生~5", "s:学生~5"]).toContain(op);
  });

  it("plans a mixed graph with both kinds of links", async () => {
    const plan = await planLuckyGraph(dataset, { ...base, flavour: "mixed", random: seeded(3) });
    expect(plan).toMatchObject({ mode: "meaning", start: "kanji" });
    const g = replayGraph(dataset, plan.root, plan.ops, { semantic, start: plan.start });
    expect(g.links.some((l) => l.kind === "semantic")).toBe(true);
    expect([...g.nodes.values()].filter((n) => n.type === "kanji").length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to kanji when the meaning data won't load", async () => {
    const failing = async () => {
      throw new Error("offline");
    };
    const plan = await planLuckyGraph(dataset, { ...base, loadSemantic: failing, flavour: "meaning", random: seeded(4) });
    expect(plan.mode).toBe("kanji");
  });

  it("replays to the same graph every time", async () => {
    const plan = await planLuckyGraph(dataset, { ...base, flavour: "kanji", random: seeded(5) });
    const a = replayGraph(dataset, plan.root, plan.ops, { maxWords: 3 });
    const b = replayGraph(dataset, plan.root, plan.ops, { maxWords: 40 });
    expect([...a.nodes.keys()].sort()).toEqual([...b.nodes.keys()].sort());
  });
});
