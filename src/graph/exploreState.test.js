import { describe, expect, it } from "vitest";
import * as fixture from "../data/japaneseData";
import { createInitialGraph, expandKanji, expandWord, revealLink } from "./buildGraph";
import { expandOp, exploreUrl, freshGraphState, graphFitsMode, opsNeedFrequency, parseExploreUrl, replayGraph, semanticOpWords } from "./exploreState";

const dataset = fixture;
const ids = (g) => [...g.nodes.keys()].sort();
const links = (g) =>
  g.links.map((l) => `${l.source?.id ?? l.source}-${l.target?.id ?? l.target}`).sort();

describe("explore URLs", () => {
  it("round-trips root, ops, selection and words-per-branch", () => {
    const state = { root: "日本語", ops: ["k:日", "w:毎日", "l:本/日本"], sel: "word:毎日", maxWords: 3 };
    const url = exploreUrl(state);
    // Kanji are percent-encoded (the address bar shows them decoded); the
    // separators stay readable.
    expect(decodeURI(url)).toBe("/explore/日本語?expand=k:日,w:毎日,l:本/日本&sel=w:毎日&n=3");
    const [path, query] = url.split("?");
    expect(parseExploreUrl(path, `?${query}`)).toEqual(state);
  });

  it("keeps the plain root URL short", () => {
    expect(exploreUrl({ root: "学校", sel: "word:学校" })).toBe("/explore/%E5%AD%A6%E6%A0%A1");
    expect(parseExploreUrl("/explore/学校")).toEqual({ root: "学校", ops: [], sel: null, maxWords: null });
  });

  it("ignores other paths and junk", () => {
    expect(parseExploreUrl("/")).toBeNull();
    expect(parseExploreUrl("/kanji/学")).toBeNull();
    expect(parseExploreUrl("/explore/%E0%A4%A")).toBeNull(); // bad escape
    const p = parseExploreUrl("/explore/学校", "?expand=k:学,zzz,k:,<script>&sel=javascript:1&n=9999");
    expect(p.ops).toEqual(["k:学"]);
    expect(p.sel).toBeNull();
    expect(p.maxWords).toBeNull();
  });
});

describe("replayGraph", () => {
  it("rebuilds exactly the graph the same actions made", () => {
    let g = createInitialGraph(dataset, "日本語");
    g = expandKanji(dataset, g, "日", 2);
    g = expandKanji(dataset, g, "日", 2); // the next batch
    const firstWord = [...g.nodes.values()].find((n) => n.type === "word" && !n.isRoot).word;
    g = expandWord(dataset, g, firstWord);
    g = revealLink(dataset, g, { kanjiChar: "本", word: "日本" });

    const replayed = replayGraph(dataset, "日本語", ["k:日", "k:日", `w:${firstWord}`, "l:本/日本"], { maxWords: 2 });
    expect(ids(replayed)).toEqual(ids(g));
    expect(links(replayed)).toEqual(links(g));
  });

  it("skips ops for nodes that aren't there", () => {
    const g = replayGraph(dataset, "日本語", ["k:猫", "w:存在しない"]);
    expect(ids(g)).toEqual(ids(createInitialGraph(dataset, "日本語")));
  });
});

describe("batch sizes", () => {
  it("records a non-default words-per-branch on the op itself", () => {
    expect(expandOp("kanji:日", 8)).toBe("k:日");
    expect(expandOp("kanji:日", 3)).toBe("k:日~3");
    expect(expandOp("kanji:日", Infinity)).toBe("k:日~all");
    expect(expandOp("word:日本", 3)).toBe("w:日本"); // words expand fully anyway
  });

  it("replays each kanji batch at the size it was expanded with", () => {
    const live = expandKanji(dataset, createInitialGraph(dataset, "日本語"), "日", 2);
    // Opened by someone whose own setting is different:
    const replayed = replayGraph(dataset, "日本語", ["k:日~2"], { maxWords: 8 });
    expect(ids(replayed)).toEqual(ids(live));
  });

  it("round-trips 'all' words per branch", () => {
    const url = exploreUrl({ root: "日本", ops: ["k:日~all"], maxWords: Infinity });
    expect(decodeURI(url)).toBe("/explore/日本?expand=k:日~all&n=all");
    const [path, query] = url.split("?");
    expect(parseExploreUrl(path, `?${query}`)).toMatchObject({ ops: ["k:日~all"], maxWords: Infinity });
  });

  it("rejects malformed sizes", () => {
    expect(parseExploreUrl("/explore/日本", "?expand=k:日~0,k:日~abc,k:日~1000,k:日~5").ops).toEqual(["k:日~5"]);
  });
});

describe("meaning mode", () => {
  // A stand-in for data/semantic.js's store, already loaded.
  const NEIGHBOURS = { 学校: [["先生", 70], ["学生", 66], ["小学校", 60]], 先生: [["学生", 72], ["学校", 70]] };
  const semantic = {
    freqOf: (w) => ({ 先生: 400, 学生: 500, 小学校: 3000 })[w],
    neighboursOf: (w) => NEIGHBOURS[w] ?? [],
  };
  const semanticLinks = (g) =>
    g.links.filter((l) => l.kind === "semantic").map((l) => `${l.source}-${l.target}`).sort();

  it("records meaning expansions, batch size and a non-default dial", () => {
    expect(expandOp("word:学校", 8, { mode: "meaning" })).toBe("s:学校");
    expect(expandOp("word:学校", 3, { mode: "meaning", commonness: 90 })).toBe("s:学校~3@90");
    expect(expandOp("word:学校", 8, { mode: "kanji", commonness: 90 })).toBe("w:学校");
    expect(expandOp("kanji:学", 8, { mode: "kanji", commonness: 60 })).toBe("k:学@60");
    expect(expandOp("kanji:学", 8, { mode: "meaning", commonness: 0 })).toBe("k:学");
  });

  it("round-trips mode, start and meaning ops through the URL", () => {
    const state = { root: "学校", ops: ["s:学校~2@90", "k:学@60"], sel: null, maxWords: null, mode: "meaning", start: "word" };
    const url = exploreUrl({ ...state, maxWords: 8 });
    expect(decodeURI(url)).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校~2@90,k:学@60");
    const [path, query] = url.split("?");
    expect(parseExploreUrl(path, `?${query}`)).toEqual(state);
  });

  it("starts a meaning graph from the word alone and replays its expansions", () => {
    const g = replayGraph(dataset, "学校", ["s:学校~2", "s:先生"], { semantic, start: "word" });
    expect(ids(g)).toEqual(["word:先生", "word:学校", "word:学生"]);
    expect(semanticLinks(g)).toEqual(["word:先生-word:学生", "word:学校-word:先生", "word:学校-word:学生"]);
    // 学校 has one neighbour left to show; 先生 has none (学校 is already linked).
    expect(g.nodes.get("word:学校").semanticExpanded).toBe(false);
    expect(g.nodes.get("word:先生").semanticExpanded).toBe(true);
  });

  it("mixes with kanji expansions in one graph", () => {
    const g = replayGraph(dataset, "学校", ["s:学校~1", "w:先生"], { semantic });
    expect(g.nodes.has("kanji:学")).toBe(true); // the root's kanji
    expect(g.nodes.has("kanji:先")).toBe(true); // 先生 expanded into its kanji
    expect(semanticLinks(g)).toEqual(["word:学校-word:先生"]);
  });

  it("lists what a replay needs loaded", () => {
    expect(semanticOpWords(["k:学", "s:学校~3@90", "s:先生"])).toEqual(["学校", "先生"]);
    expect(opsNeedFrequency(["k:学", "w:学校"])).toBe(false);
    expect(opsNeedFrequency(["k:学@60"])).toBe(true);
    expect(opsNeedFrequency(["s:学校"])).toBe(true);
  });
});

describe("freshGraphState", () => {
  it("starts Kanji from the root and its kanji, Meaning from the first neighbours", () => {
    expect(freshGraphState("学校", "kanji")).toEqual({ start: "kanji", ops: [] });
    expect(freshGraphState("学校", "meaning")).toEqual({ start: "word", ops: ["s:学校"] });
  });

  it("records a batch size and dial that differ from the defaults", () => {
    expect(freshGraphState("学校", "meaning", { maxWords: 12, commonness: 90 }).ops).toEqual(["s:学校~12@90"]);
  });
});

describe("graphFitsMode", () => {
  it("accepts a graph holding only its own mode's branches", () => {
    expect(graphFitsMode([], "kanji", "kanji")).toBe(true);
    expect(graphFitsMode(["k:学", "w:学校"], "kanji", "kanji")).toBe(true);
    expect(graphFitsMode(["s:学校"], "word", "meaning")).toBe(true);
  });

  it("rejects a graph mixing in the other mode", () => {
    expect(graphFitsMode(["s:学校"], "kanji", "kanji")).toBe(false);
    expect(graphFitsMode([], "word", "kanji")).toBe(false);
    expect(graphFitsMode(["s:学校"], "kanji", "meaning")).toBe(false);
    expect(graphFitsMode(["s:学校", "k:学"], "word", "meaning")).toBe(false);
  });
});
