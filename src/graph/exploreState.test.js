import { describe, expect, it } from "vitest";
import * as fixture from "../data/japaneseData";
import { createInitialGraph, expandKanji, expandWord, revealLink } from "./buildGraph";
import { exploreUrl, parseExploreUrl, replayGraph } from "./exploreState";

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
