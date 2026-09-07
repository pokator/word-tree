// Kanji-detection helpers shared by the graph and data layers. Kept
// dependency-free (no dictionary lookup) so "does this word have kanji
// components" never depends on whether those kanji happen to be in the
// loaded dataset -- see buildGraph.js's arbitrary-root-word support.

// CJK Unified Ideographs + Extension A + Compatibility Ideographs. Covers
// every character that appears as a Kanji.text form in JMdict.
export function isKanji(char) {
  const c = char.codePointAt(0);
  return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff);
}

/**
 * The unique kanji characters in a word's text, in first-appearance order
 * (e.g. "日曜日" -> ["日", "曜"], not ["日", "曜", "日"]). This is exactly
 * how this app defines a word's "components" -- see buildIndexes below and
 * README's Assumptions section.
 */
export function extractKanjiComponents(text) {
  const seen = new Set();
  const out = [];
  for (const char of text ?? "") {
    if (isKanji(char) && !seen.has(char)) {
      seen.add(char);
      out.push(char);
    }
  }
  return out;
}

const JAPANESE_RE = /[぀-ヿ㐀-鿿豈-﫿ー]/;

/** True if the text contains at least one hiragana/katakana/kanji character. */
export function containsJapanese(text) {
  return JAPANESE_RE.test(text ?? "");
}
