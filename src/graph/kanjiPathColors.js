// Assigns each unique kanji component of a word one color from the
// kanji-path palette (see graph/theme.js's colors.kanjiPath), cycling if a
// word has more unique kanji than the palette has colors -- rare (most
// words are 1-3 kanji), and a repeated color on a 5th+ component is a
// mild ambiguity, not a broken one, since the label glyph and its own
// link are still colored together.
import { extractKanjiComponents } from "./kanji";

/** word (string) -> Map(kanjiChar -> color string), using `colors.kanjiPath`. */
export function kanjiPathColorMap(word, kanjiPath) {
  const map = new Map();
  if (!kanjiPath?.length) return map;
  extractKanjiComponents(word).forEach((char, i) => {
    map.set(char, kanjiPath[i % kanjiPath.length]);
  });
  return map;
}

/**
 * Local x-offset for character index `i` of `charCount` total, spacing
 * them evenly around 0 at `glyphWidth` apart -- used to lay out both a
 * word label's per-character tspans and the kanji-path identity marks
 * above them (see WordTreeGraph's showKanjiMarks) from the exact same
 * model, rather than trying to measure real rendered glyph positions.
 * Safe specifically for Japanese text: kanji/hiragana/katakana all render
 * "full-width" (one roughly-square em box each) per the East Asian Width
 * convention, unlike Latin text, so equal-width spacing is a reasonable
 * approximation here rather than a general text-layout hack.
 */
export function charOffsetX(i, charCount, glyphWidth) {
  return (i - (charCount - 1) / 2) * glyphWidth;
}
