// Pure, framework-agnostic logic for building/expanding the "word tree"
// graph. Kept separate from rendering so the data model is easy to reason
// about and swap out (e.g. for a different language dataset later).
//
// Every function takes a `dataset` ({ KANJI, WORDS_BY_TEXT,
// WORDS_CONTAINING_KANJI }, see src/data/useWordData.js) as its first
// argument rather than importing one directly, so the graph logic doesn't
// care whether the data came from Supabase or the static fallback fixture.
//
// Node ids are namespaced so a word and a kanji can never collide:
//   word:<word text>   e.g. "word:日本語"
//   kanji:<char>        e.g. "kanji:語"

export const wordNodeId = (word) => `word:${word}`;
export const kanjiNodeId = (char) => `kanji:${char}`;

function kanjiNode(dataset, char) {
  return {
    id: kanjiNodeId(char),
    type: "kanji",
    char,
    meaning: dataset.KANJI[char]?.meaning ?? "",
    onyomi: dataset.KANJI[char]?.onyomi ?? [],
    kunyomi: dataset.KANJI[char]?.kunyomi ?? [],
    expanded: false,
  };
}

function wordNode(dataset, word, { isRoot = false, expanded = false } = {}) {
  const entry = dataset.WORDS_BY_TEXT[word];
  return {
    id: wordNodeId(word),
    type: "word",
    word: entry.word,
    reading: entry.reading,
    meaning: entry.meaning,
    isRoot,
    expanded,
  };
}

/** Build a fresh graph centered on a single root word. */
export function createInitialGraph(dataset, rootWord) {
  const wordEntry = dataset.WORDS_BY_TEXT[rootWord];
  if (!wordEntry) {
    throw new Error(`Unknown word: ${rootWord}`);
  }

  const nodes = new Map();
  const links = [];

  const rootId = wordNodeId(rootWord);
  nodes.set(rootId, wordNode(dataset, rootWord, { isRoot: true, expanded: true }));

  for (const char of wordEntry.components) {
    const kId = kanjiNodeId(char);
    if (!nodes.has(kId)) nodes.set(kId, kanjiNode(dataset, char));
    links.push({ source: rootId, target: kId });
  }

  return { nodes, links };
}

/**
 * Return a NEW graph state with the given kanji expanded: every word
 * containing that kanji is added as a node, linked to the kanji node.
 * No-ops if already expanded.
 */
export function expandKanji(dataset, graph, char) {
  const kId = kanjiNodeId(char);
  const existing = graph.nodes.get(kId);
  if (!existing || existing.expanded) return graph;

  const nodes = new Map(graph.nodes);
  const links = [...graph.links];

  nodes.set(kId, { ...existing, expanded: true });

  const relatedWords = dataset.WORDS_CONTAINING_KANJI[char] ?? [];
  for (const word of relatedWords) {
    const wId = wordNodeId(word);
    if (!nodes.has(wId)) nodes.set(wId, wordNode(dataset, word));
    if (!links.some((l) => linkKey(l) === linkKey({ source: kId, target: wId }))) {
      links.push({ source: kId, target: wId });
    }
  }

  return { nodes, links };
}

/**
 * Return a NEW graph state with the given word expanded: its component
 * kanji are added as nodes, linked to the word. No-ops if already expanded.
 */
export function expandWord(dataset, graph, word) {
  const wId = wordNodeId(word);
  const existing = graph.nodes.get(wId);
  if (!existing || existing.expanded) return graph;

  const entry = dataset.WORDS_BY_TEXT[word];
  const nodes = new Map(graph.nodes);
  const links = [...graph.links];

  nodes.set(wId, { ...existing, expanded: true });

  for (const char of entry.components) {
    const kId = kanjiNodeId(char);
    if (!nodes.has(kId)) nodes.set(kId, kanjiNode(dataset, char));
    if (!links.some((l) => linkKey(l) === linkKey({ source: wId, target: kId }))) {
      links.push({ source: wId, target: kId });
    }
  }

  return { nodes, links };
}

function linkKey(l) {
  const s = typeof l.source === "object" ? l.source.id : l.source;
  const t = typeof l.target === "object" ? l.target.id : l.target;
  return [s, t].sort().join("::");
}
