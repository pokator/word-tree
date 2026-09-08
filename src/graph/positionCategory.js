// Where a kanji sits in a word changes what role it's playing (leading a
// compound vs. modifying one) -- shared between the layout (useForceSimulation,
// which spaces sibling nodes out by this) and the renderer (WordTreeGraph,
// which color-codes links by it) so the two can never disagree about which
// category a word falls into.
export function kanjiPositionCategory(word, kanjiChar) {
  const idx = word.indexOf(kanjiChar);
  if (idx <= 0) return "start";
  if (idx === word.length - 1) return "end";
  return "middle";
}

export const POSITION_ORDER = ["start", "middle", "end"];
