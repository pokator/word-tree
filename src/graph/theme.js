// Reads the current theme's node colors from CSS custom properties, so
// index.css stays the single source of truth for both palettes -- a theme
// edit there can never drift out of sync with the graph's own colors.
export function readNodeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    root: read("--node-root", "#c33a2e"),
    kanji: read("--node-kanji", "#8a8371"),
    word: read("--node-word", "#56697c"),
    // Keyed by the same "n5".."n1"/"unrated" bucket stored on node.jlptBucket
    // (see graph/buildGraph.js) -- opt-in ring color for the Filters ->
    // "color by difficulty" toggle, see WordTreeGraph.
    jlpt: {
      n5: read("--jlpt-n5", "#4c8c5c"),
      n4: read("--jlpt-n4", "#3f8f8a"),
      n3: read("--jlpt-n3", "#c99a3d"),
      n2: read("--jlpt-n2", "#c2703a"),
      n1: read("--jlpt-n1", "#8659a6"),
      unrated: read("--jlpt-unrated", "#9a9482"),
    },
  };
}
