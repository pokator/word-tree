import { describe, expect, it } from "vitest";
import { buildAnkiTsv } from "./exportFile";

const DATASET = { KANJI: { 本: { char: "本", meaning: "Book", onyomi: ["ほん"], kunyomi: ["もと"] } } };

describe("buildAnkiTsv", () => {
  const lines = buildAnkiTsv(
    [
      { word: "本", reading: "ほん", meaning: "book", senses: [{ gloss: ["book"], pos: ["noun (common) (futsuumeishi)"] }] },
      { word: "ねこ", reading: "ねこ", meaning: "cat" },
    ],
    DATASET
  ).split("\n");

  it("tells Anki's importer the file is tab-separated HTML", () => {
    expect(lines.slice(0, 2)).toEqual(["#separator:Tab", "#html:true"]);
  });

  it("writes one note per line with a bold front and the full card on the back", () => {
    expect(lines).toHaveLength(4);
    const [front, back] = lines[2].split("\t");
    expect(front).toBe('"<b>本</b>"');
    expect(back).toContain("<b>book</b>");
    expect(back).toMatch(/>On<\/span><span [^>]*>ほん</);
    expect(back).toMatch(/>Kun<\/span><span [^>]*>もと</);
  });

  it("doubles quotes inside fields, and omits the kanji section for kana words", () => {
    const [, back] = lines[2].split("\t");
    expect(back).toContain('class=""moto-pos""');
    expect(lines[3]).not.toContain("<hr>");
  });
});
