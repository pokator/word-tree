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
      n4: read("--jlpt-n4", "#8f7419"),
      n3: read("--jlpt-n3", "#a85f2e"),
      n2: read("--jlpt-n2", "#b23f2e"),
      n1: read("--jlpt-n1", "#7a2020"),
      unrated: read("--jlpt-unrated", "#9a9482"),
    },
    // Cycled by extractKanjiComponents' first-appearance order within the
    // selected word -- see graph/kanjiPathColors.js -- not keyed by
    // anything semantic like the JLPT ramp above.
    kanjiPath: [
      read("--kanji-path-1", "#3a7ca5"),
      read("--kanji-path-2", "#a8681f"),
      read("--kanji-path-3", "#7a5cc9"),
      read("--kanji-path-4", "#2b7a52"),
    ],
  };
}
