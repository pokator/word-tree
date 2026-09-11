import { describe, expect, it } from "vitest";
import { searchWords } from "./searchWords";

const WORDS = [
  { word: "質問", reading: "しつもん", meaning: "question, inquiry", rank: 1 },
  { word: "日本語", reading: "にほんご", meaning: "Japanese language", rank: 2 },
  { word: "日本", reading: "にほん", meaning: "Japan", rank: 1 },
  { word: "パン", reading: "パン", meaning: "bread", rank: 1 },
  { word: "猫", reading: "ねこ", meaning: "cat", rank: 2 },
];

describe("searchWords", () => {
  it("finds a word by its romaji reading, fully typed", () => {
    const results = searchWords(WORDS, "shitsumon");
    expect(results[0].word).toBe("質問");
  });

  it("finds a word by a partial, in-progress romaji reading (as-you-type)", () => {
    const results = searchWords(WORDS, "shitsu");
    expect(results.map((r) => r.word)).toContain("質問");
  });

  it("still matches literal hiragana/kanji input the same as before", () => {
    expect(searchWords(WORDS, "にほんご")[0].word).toBe("日本語");
    expect(searchWords(WORDS, "日本")[0].word).toBe("日本");
  });

  it("matches a katakana-reading loanword by its romaji", () => {
    const results = searchWords(WORDS, "pan");
    expect(results.map((r) => r.word)).toContain("パン");
  });

  it("still falls back to a meaning match for plain English", () => {
    const results = searchWords(WORDS, "cat");
    expect(results.map((r) => r.word)).toContain("猫");
  });

  it("breaks a tie between two romaji-reading-prefix matches by rank", () => {
    const results = searchWords(WORDS, "nihon");
    expect(results.map((r) => r.word)).toEqual(["日本", "日本語"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchWords(WORDS, "   ")).toEqual([]);
  });
});
