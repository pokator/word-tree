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
