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

import { extractKanjiComponents } from "./kanji";
import { wordComponents } from "../data/deriveIndexes";

export const wordNodeId = (word) => `word:${word}`;
export const kanjiNodeId = (char) => `kanji:${char}`;

// Words with no explicit rank (or entries synthesized for an unlisted root
// word's kanji) sort last when a branch is capped -- see expandKanji.
const DEFAULT_RANK = 999;
const rankOf = (dataset, word) => dataset.WORDS_BY_TEXT[word]?.rank ?? DEFAULT_RANK;

function kanjiNode(dataset, char) {
  const entry = dataset.KANJI[char];
  return {
    id: kanjiNodeId(char),
    type: "kanji",
    char,
    meaning: entry?.meaning ?? "",
    onyomi: entry?.onyomi ?? [],
    kunyomi: entry?.kunyomi ?? [],
    jlpt: entry?.jlpt,
    expanded: false,
  };
}

function wordNode(dataset, word, { isRoot = false, expanded = false } = {}) {
  const entry = dataset.WORDS_BY_TEXT[word];
  if (!entry) {
    // Arbitrary word typed by the user that isn't in the loaded corpus --
    // still a valid node, just without dictionary meaning/reading. Its
    // components come straight from its own text (see graph/kanji.js).
    return {
      id: wordNodeId(word),
      type: "word",
      word,
      reading: "",
      meaning: "",
      isRoot,
      expanded,
      isUnlisted: true,
    };
  }
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

/** Build a fresh graph centered on a single root word (any string -- it
 * doesn't need to already be in the dataset, see wordNode above). */
export function createInitialGraph(dataset, rootWord) {
  const wordEntry = dataset.WORDS_BY_TEXT[rootWord];
  const components = wordEntry ? wordComponents(wordEntry) : extractKanjiComponents(rootWord);

  const nodes = new Map();
  const links = [];

  const rootId = wordNodeId(rootWord);
  nodes.set(rootId, wordNode(dataset, rootWord, { isRoot: true, expanded: true }));

  for (const char of components) {
    const kId = kanjiNodeId(char);
    if (!nodes.has(kId)) nodes.set(kId, kanjiNode(dataset, char));
    links.push({ source: rootId, target: kId });
  }

  return { nodes, links };
}

/**
 * Return a NEW graph state with the given kanji expanded: words containing
 * that kanji are added as nodes, linked to the kanji node, most-common
 * first (see data/*.json's `rank`, lower = more common). At most `maxWords`
 * NEW words are revealed per call -- if more remain, the kanji node stays
 * in its "expanded: false" (dashed-ring, click-for-more) state so calling
 * this again reveals the next batch, until every related word is shown.
 * No-ops if already fully expanded.
 */
export function expandKanji(dataset, graph, char, maxWords = Infinity) {
  const kId = kanjiNodeId(char);
  const existing = graph.nodes.get(kId);
  if (!existing || existing.expanded) return graph;

  const nodes = new Map(graph.nodes);
  const links = [...graph.links];

  const alreadyLinked = new Set();
  for (const l of links) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (s === kId) alreadyLinked.add(t);
    else if (t === kId) alreadyLinked.add(s);
  }

  const relatedWords = dataset.WORDS_CONTAINING_KANJI[char] ?? [];
  const notYetLinked = relatedWords.filter((word) => !alreadyLinked.has(wordNodeId(word)));
  const sorted = notYetLinked.slice().sort((a, b) => rankOf(dataset, a) - rankOf(dataset, b));
  const toReveal = sorted.slice(0, maxWords);

  nodes.set(kId, { ...existing, expanded: toReveal.length === notYetLinked.length });

  for (const word of toReveal) {
    const wId = wordNodeId(word);
    if (!nodes.has(wId)) nodes.set(wId, wordNode(dataset, word));
    links.push({ source: kId, target: wId });
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

  const components = entry ? wordComponents(entry) : extractKanjiComponents(word);
  for (const char of components) {
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
