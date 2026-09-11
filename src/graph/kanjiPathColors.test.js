import { describe, expect, it } from "vitest";
import { kanjiPathColorMap } from "./kanjiPathColors";

const PALETTE = ["blue", "gold", "violet", "green"];

describe("kanjiPathColorMap", () => {
  it("assigns each unique kanji a color in first-appearance order", () => {
    const map = kanjiPathColorMap("日本語", PALETTE);
    expect(map.get("日")).toBe("blue");
    expect(map.get("本")).toBe("gold");
    expect(map.get("語")).toBe("violet");
  });

  it("dedupes a kanji that appears twice in the same word", () => {
    const map = kanjiPathColorMap("日曜日", PALETTE);
    expect(map.size).toBe(2);
    expect(map.get("日")).toBe("blue");
    expect(map.get("曜")).toBe("gold");
  });

  it("cycles the palette for words with more unique kanji than colors", () => {
    const map = kanjiPathColorMap("一二三四五", PALETTE);
    expect(map.get("四")).toBe("green");
    expect(map.get("五")).toBe("blue"); // wraps back to index 0
  });

  it("ignores kana -- only kanji get colors", () => {
    const map = kanjiPathColorMap("お茶", PALETTE);
    expect(map.size).toBe(1);
    expect(map.get("茶")).toBe("blue");
  });

  it("returns an empty map for a word with no kanji, or no palette", () => {
    expect(kanjiPathColorMap("ひらがな", PALETTE).size).toBe(0);
    expect(kanjiPathColorMap("日本語", []).size).toBe(0);
  });
});
