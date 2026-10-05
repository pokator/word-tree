// The shipped words.gzjson leaves out `meaning` on every entry that has
// `senses`: it's exactly `senses` flattened to one string, so storing both
// shipped ~20% more bytes than the data needed. Every visitor downloads this
// file, so those bytes are paid in bandwidth on every first visit.
// scripts/compress-offline-dataset.mjs writes with slimWord, and the dataset
// worker rebuilds the field with restoreMeaning before anything reads it.

export const meaningFromSenses = (senses) => senses.map((s) => s.gloss.join(", ")).join("; ");

export function slimWord(word) {
  if (!word.senses?.length) return word;
  const { meaning: _meaning, ...rest } = word;
  return rest;
}

/** Fills in `meaning` in place: 228k entries, so no copies. */
export function restoreMeaning(word) {
  if (word.meaning == null && word.senses?.length) word.meaning = meaningFromSenses(word.senses);
  return word;
}
