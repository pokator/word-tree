import { describe, expect, it } from "vitest";
import { commonnessLabel, logFrequency, rankKanjiWords, rankNeighbours } from "./commonness";

// 学校's real neighbours, a common, an everyday and a rare one.
const FREQ = { 生徒: 900, 補習: 30_000, 養護教諭: 200_000 };
const freqOf = (w) => FREQ[w];
const NEIGHBOURS = [
  ["生徒", 70],
  ["補習", 62],
  ["養護教諭", 55],
];

describe("rankNeighbours", () => {
  it("Familiar puts the common word first, Adventurous the rare one", () => {
    expect(rankNeighbours(NEIGHBOURS, 0, freqOf)).toEqual(["生徒", "補習", "養護教諭"]);
    expect(rankNeighbours(NEIGHBOURS, 100, freqOf)).toEqual(["養護教諭", "補習", "生徒"]);
  });

  it("the middle of the dial is pure similarity", () => {
    expect(rankNeighbours(NEIGHBOURS, 50, freqOf)).toEqual(["生徒", "補習", "養護教諭"]);
  });

  it("treats a word chiVe doesn't know as rarest", () => {
    expect(logFrequency(undefined)).toBe(1);
    expect(rankNeighbours([["生徒", 70], ["未知語", 40]], 100, freqOf)[0]).toBe("未知語");
  });
});

describe("rankKanjiWords", () => {
  const rank = { 大学: 1, 学校: 2, 学級: 20 };
  const rankOf = (w) => rank[w] ?? 999;
  const freq = { 大学: 200, 学校: 366, 学級: 9_000, 新聞学: 300_000 };
  const words = ["新聞学", "学級", "学校", "大学"];

  it("keeps the original most-common-first order at Familiar", () => {
    expect(rankKanjiWords(words, 0, rankOf, () => undefined)).toEqual(["大学", "学校", "学級", "新聞学"]);
  });

  it("aims at rarer words as the dial moves", () => {
    expect(rankKanjiWords(words, 100, rankOf, (w) => freq[w])[0]).toBe("新聞学");
    expect(rankKanjiWords(words, 60, rankOf, (w) => freq[w])[0]).toBe("学級");
  });
});

it("names the dial's position", () => {
  expect([0, 30, 50, 70, 100].map(commonnessLabel)).toEqual([
    "Familiar",
    "Mostly familiar",
    "Balanced",
    "Mostly adventurous",
    "Adventurous",
  ]);
});
