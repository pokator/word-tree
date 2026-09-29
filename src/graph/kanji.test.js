import { describe, expect, it } from "vitest";
import { containsJapanese, extractKanjiComponents, isKanji } from "./kanji";

describe("isKanji", () => {
  it("recognizes kanji outside the Basic Multilingual Plane", () => {
    expect(isKanji("𠮟")).toBe(true); // U+20B9F, a jōyō kanji
    expect(extractKanjiComponents("𠮟る")).toEqual(["𠮟"]);
  });
  it("still rejects kana and Latin", () => {
    for (const ch of ["か", "カ", "a", "ー"]) expect(isKanji(ch), ch).toBe(false);
    expect(extractKanjiComponents("日本語")).toEqual(["日", "本", "語"]);
  });
});

describe("containsJapanese", () => {
  it("accepts a lone kanji from outside the BMP, as search needs", () => {
    expect(containsJapanese("𠮟")).toBe(true);
    expect(containsJapanese("abc")).toBe(false);
    expect(containsJapanese("ーか")).toBe(true);
  });
});
