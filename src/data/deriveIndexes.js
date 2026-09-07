import { extractKanjiComponents } from "../graph/kanji";

// Shared derivation logic so the static fallback fixture, the bundled local
// dataset, and the Supabase-fetched dataset can never disagree on index
// shape. `components` is optional on a word entry -- when absent (the
// bundled local dataset omits it to save space) it's computed from the
// word's own text instead, which is exactly what a stored `components`
// array already always equalled anyway (see graph/kanji.js).
export function wordComponents(word) {
  return word.components?.length ? word.components : extractKanjiComponents(word.word);
}

export function buildIndexes(words) {
  const WORDS_BY_TEXT = Object.fromEntries(words.map((w) => [w.word, w]));

  const WORDS_CONTAINING_KANJI = {};
  for (const w of words) {
    for (const k of wordComponents(w)) {
      if (!WORDS_CONTAINING_KANJI[k]) WORDS_CONTAINING_KANJI[k] = [];
      WORDS_CONTAINING_KANJI[k].push(w.word);
    }
  }

  return { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI };
}
