// The "Commonness" dial (Filters), shared by both exploration modes: 0 is
// Familiar, 100 is Adventurous. It decides WHICH words a reveal picks when
// there are more candidates than "words per branch" lets through -- it
// never hides anything already on screen.
//
// The commonness signal is chiVe's corpus frequency (see
// scripts/semantic/build_neighbours.py): its vocabulary is in frequency
// order, so a word's index there is how common it is in real Japanese web
// text. Unlike JMdict's `rank` (only ~13% of entries have one), that covers
// ~82k words. A word chiVe doesn't know is treated as rarer than any word
// it does. Loaded lazily (src/data/semantic.js), so `freqOf` returns
// undefined for every word until then.

export const CHIVE_VOCAB_SIZE = 410_533;
const LOG_VOCAB = Math.log(CHIVE_VOCAB_SIZE);

// Kanji mode defaults to Familiar, which is exactly the old most-common-
// first order. Meaning mode starts a little toward Adventurous, so the first
// reveal already mixes in a few less obvious words.
export const DEFAULT_COMMONNESS = { kanji: 0, meaning: 40 };

/** 0 (most frequent) .. 1 (rarest, or unknown to chiVe). */
export function logFrequency(freq) {
  return freq == null ? 1 : Math.min(1, Math.log(freq + 1) / LOG_VOCAB);
}

// How hard the dial pulls against similarity in meaning mode. Neighbour
// similarities span ~0.35-0.8, and log frequency ~0.35-1, so at 2 either
// end of the dial clearly wins over closeness in meaning, while the middle
// (50) is pure similarity.
const MEANING_PULL = 2;

/**
 * Order meaning-mode neighbours for a reveal. `neighbours` is
 * [[word, similarity*100], ...]; returns the words, best first.
 */
export function rankNeighbours(neighbours, commonness, freqOf) {
  const lean = (2 * commonness) / 100 - 1; // -1 familiar .. +1 adventurous
  return neighbours
    .map(([word, sim], i) => ({ word, i, score: sim / 100 + MEANING_PULL * lean * logFrequency(freqOf(word)) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((n) => n.word);
}

/**
 * Order the words containing a kanji for a reveal. At 0 (the default) this
 * is the original order: JMdict rank, most common first. Above 0 it aims at
 * a band of the frequency scale -- the dial's position -- and picks the
 * words closest to it, so the middle of the dial gives mid-frequency words
 * rather than the two extremes. Ties fall back to rank.
 */
export function rankKanjiWords(words, commonness, rankOf, freqOf) {
  if (!commonness) return words.slice().sort((a, b) => rankOf(a) - rankOf(b));
  const target = 0.3 + (0.68 * commonness) / 100;
  const dist = new Map(words.map((w) => [w, Math.abs(logFrequency(freqOf(w)) - target)]));
  return words.slice().sort((a, b) => dist.get(a) - dist.get(b) || rankOf(a) - rankOf(b));
}

/** The dial's position in words, for Filters; the exact number isn't meaningful. */
export function commonnessLabel(value) {
  if (value < 20) return "Familiar";
  if (value < 40) return "Mostly familiar";
  if (value <= 60) return "Balanced";
  if (value <= 80) return "Mostly adventurous";
  return "Adventurous";
}
