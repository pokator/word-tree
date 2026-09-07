// Reads the current theme's node colors from CSS custom properties, so
// index.css stays the single source of truth for both palettes -- a theme
// edit there can never drift out of sync with the graph's own colors.
export function readNodeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    root: read("--node-root", "#c33a2e"),
    kanji: read("--node-kanji", "#3f4b63"),
    word: read("--node-word", "#4b6355"),
  };
}
