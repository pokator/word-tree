// Visual sizing/color shared between the simulation (collision radius) and
// the SVG renderer, so they never disagree about how big/what color a node
// is. Colors come from the caller (see graph/theme.js) so this stays a pure
// function of its inputs, not a hidden dependency on the DOM.

export function nodeRadius(node) {
  if (node.type === "kanji") return 24;
  const len = node.word?.length ?? 2;
  return Math.min(38, 20 + len * 5);
}

export function nodeFill(node, { root, colors }) {
  if (root) return colors.root;
  return node.type === "kanji" ? colors.kanji : colors.word;
}

// First segment of a "a / b / c" or "a; b; c" style flat gloss string --
// used as the short definition shown at high zoom (see nodeDetailText).
function firstGloss(str) {
  if (!str) return "";
  const sep = [";", "/", ","].find((s) => str.includes(s));
  return (sep ? str.split(sep)[0] : str).trim();
}

// Reading + short definition shown alongside the label once the user has
// zoomed in far enough to want it (see WordTreeGraph's detail tier) -- the
// same reading/meaning data already shown in the dictionary panel, just
// abbreviated to a single line each so it fits next to a small graph node.
export function nodeDetailText(node) {
  if (node.type === "kanji") {
    return {
      reading: node.kunyomi?.[0] || node.onyomi?.[0] || "",
      gloss: firstGloss(node.meaning),
    };
  }
  return {
    reading: node.reading || "",
    gloss: node.senses?.[0]?.gloss?.[0] || firstGloss(node.meaning),
  };
}

const MASTERY_OPACITY = { new: 0.45, learning: 0.75, known: 1 };

// `status` is undefined until mastery tracking is wired up to a node
// (guest/logged-out, or not yet fetched) -- render at full opacity rather
// than assuming "new" in that case, since it isn't actually known yet.
export function nodeOpacity(status) {
  return status ? (MASTERY_OPACITY[status] ?? 1) : 1;
}
