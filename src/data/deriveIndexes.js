// Shared derivation logic so the static fallback fixture and the
// Supabase-fetched dataset can never disagree on index shape.
export function buildIndexes(words) {
  const WORDS_BY_TEXT = Object.fromEntries(words.map((w) => [w.word, w]));

  const WORDS_CONTAINING_KANJI = {};
  for (const w of words) {
    for (const k of w.components) {
      if (!WORDS_CONTAINING_KANJI[k]) WORDS_CONTAINING_KANJI[k] = [];
      WORDS_CONTAINING_KANJI[k].push(w.word);
    }
  }

  return { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI };
}
