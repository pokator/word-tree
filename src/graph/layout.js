// Visual sizing/color shared between the simulation (collision radius) and
// the SVG renderer, so they never disagree about how big a node is.

export function nodeRadius(node) {
  if (node.type === "kanji") return 24;
  const len = node.word?.length ?? 2;
  return Math.min(38, 20 + len * 5);
}

export function nodeFill(node, { selected, root }) {
  if (root) return "#b45309"; // amber-700: the word you searched for
  if (node.type === "kanji") return selected ? "#1d4ed8" : "#2563eb"; // blue: kanji component
  return selected ? "#0f766e" : "#0d9488"; // teal: compound word
}
