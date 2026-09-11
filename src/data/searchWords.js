// Pure, framework-agnostic search matching -- kept separate from
// SearchBar.jsx so it's easy to unit test and reason about independent of
// any rendering concerns.
//
// Typing romaji (e.g. "shitsumon") should find words by their reading
// (質問, しつもん) the same way a real IME would, not just literal
// hiragana/katakana/kanji typed directly. wanakana converts romaji to kana
// as the user types; a syllable with no vowel yet (e.g. "shitsum", still
// typing toward "shitsumo") is left as trailing romaji rather than guessed
// at, so it just doesn't match yet -- the next keystroke resolves it, same
// as a real IME's preedit. Deliberately NOT wanakana's IMEMode option:
// that additionally holds a trailing single "n" as literal romaji (waiting
// to see whether a second "n" or a vowel follows), which is correct for
// live preedit text but wrong here -- a search box has no separate
// "confirm" step, so a query typed all the way to "shitsumon" needs its
// trailing ん to resolve immediately, not stay stuck as "しつもn" forever.
// Converted to BOTH hiragana and katakana (not just hiragana) since a
// loanword's `reading` is stored in katakana (e.g. コーヒー), matching how
// it's actually written -- see the dataset's `reading` field.
import { toHiragana, toKatakana } from "wanakana";
import { containsJapanese } from "../graph/kanji";

const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_RANK = 999;

function romajiKanaForms(query) {
  if (!query || containsJapanese(query)) return null;
  const hiragana = toHiragana(query);
  const katakana = toKatakana(query);
  // Nothing actually converted (e.g. the query is punctuation, or already
  // kana) -- no extra forms worth matching against.
  if (hiragana === query && katakana === query) return null;
  return { hiragana, katakana };
}

function matchScore(word, q, qLower, romajiKana) {
  if (word.word === q) return 0;
  if (word.word.startsWith(q)) return 1;
  if (
    word.reading.startsWith(qLower) ||
    (romajiKana && (word.reading.startsWith(romajiKana.hiragana) || word.reading.startsWith(romajiKana.katakana)))
  ) {
    return 2;
  }
  if (word.word.includes(q)) return 3;
  if (
    word.reading.includes(qLower) ||
    (romajiKana && (word.reading.includes(romajiKana.hiragana) || word.reading.includes(romajiKana.katakana)))
  ) {
    return 4;
  }
  return 5; // meaning-only match
}

/**
 * Returns the best `maxResults` matches for `query` against `words`, most
 * relevant first (exact word match, then word-prefix, then reading-prefix
 * -- including romaji-converted forms -- then substring matches, then
 * meaning-only matches, each tier broken by `rank`, lower = more common).
 */
export function searchWords(words, query, { maxResults = DEFAULT_MAX_RESULTS } = {}) {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const romajiKana = romajiKanaForms(q);

  return words
    .filter(
      (w) =>
        w.word.includes(q) ||
        w.reading.includes(qLower) ||
        w.meaning.toLowerCase().includes(qLower) ||
        (romajiKana && (w.reading.includes(romajiKana.hiragana) || w.reading.includes(romajiKana.katakana)))
    )
    .sort((a, b) => {
      const scoreDiff = matchScore(a, q, qLower, romajiKana) - matchScore(b, q, qLower, romajiKana);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.rank ?? DEFAULT_RANK) - (b.rank ?? DEFAULT_RANK);
    })
    .slice(0, maxResults);
}
