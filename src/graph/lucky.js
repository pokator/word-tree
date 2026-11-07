// "Feeling lucky": a random word, already explored a couple of steps out, so
// the graph shows off what Moto does before you've clicked anything.
//
// The result is an ordinary graph state ({ root, mode, start, ops }), so it
// replays like any other: the URL it lands on can be shared or reloaded and
// shows the same graph. Every op carries an explicit batch size (~N, never the
// default 8) so the graph doesn't change with the viewer's words-per-branch.
//
// Three flavours, picked at random:
//   kanji    the root's kanji, a handful of words from each, then one of those
//            words broken into its kanji and one new kanji opened up
//   meaning  the root's meaning neighbours, then three of them opened up too
//   mixed    the root's kanji with words from one, plus its meaning neighbours
//            and one of those opened up
// Meaning and mixed need the semantic data; if it won't load, the plan falls
// back to kanji.

import { wordComponents } from "../data/deriveIndexes.js";
import { kanjiNodeId, wordNodeId } from "./buildGraph.js";
import { replayGraph } from "./exploreState.js";

export const LUCKY_FLAVOURS = ["kanji", "meaning", "mixed"];

// Enough words share a kanji for its branch to look like one.
const MIN_KANJI_FAMILY = 6;
const MIN_NEIGHBOURS = 10;
const MAX_TRIES = 40;

const pick = (items, random) => items[Math.floor(random() * items.length)];

function shuffled(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Words worth landing on: common (JMdict-ranked), 2-4 characters, made of two
 * or three kanji, each of which has a real family of words to show.
 */
export function luckyCandidates(dataset) {
  const out = [];
  for (const entry of dataset.WORDS) {
    if (entry.rank == null) continue;
    const w = entry.word;
    if (w.length < 2 || w.length > 4) continue;
    const kanji = wordComponents(entry);
    if (kanji.length < 2 || kanji.length > 3 || kanji.length !== w.length) continue;
    if (!kanji.every((k) => dataset.KANJI[k] && (dataset.WORDS_CONTAINING_KANJI[k]?.length ?? 0) >= MIN_KANJI_FAMILY)) {
      continue;
    }
    out.push(w);
  }
  return out;
}

const wordsLinkedFrom = (graph, fromId, kind) => {
  const out = [];
  for (const l of graph.links) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (s === fromId && (kind ? l.kind === kind : !l.kind) && t.startsWith("word:")) out.push(t.slice(5));
  }
  return out;
};

function planKanji(dataset, root, ctx) {
  const { random } = ctx;
  const kanji = wordComponents(dataset.WORDS_BY_TEXT[root]);
  const batch = kanji.length >= 3 ? 4 : 5;
  const ops = kanji.map((k) => `k:${k}~${batch}`);
  const graph = replay(dataset, root, ops, "kanji", ctx);

  // One revealed word with a kanji the graph doesn't have yet: break it into
  // its kanji, then open that new kanji up a little.
  const words = shuffled(kanji.flatMap((k) => wordsLinkedFrom(graph, kanjiNodeId(k))), random);
  for (const w of words) {
    const entry = dataset.WORDS_BY_TEXT[w];
    if (!entry) continue;
    const fresh = wordComponents(entry).filter(
      (k) => !graph.nodes.has(kanjiNodeId(k)) && (dataset.WORDS_CONTAINING_KANJI[k]?.length ?? 0) >= MIN_KANJI_FAMILY
    );
    if (fresh.length === 0) continue;
    ops.push(`w:${w}`, `k:${pick(fresh, random)}~4`);
    break;
  }
  return { root, mode: "kanji", start: "kanji", ops };
}

async function planMeaning(dataset, root, ctx) {
  // Neighbours often share neighbours, so each opened one adds fewer new
  // words than its batch size; three of them keep the graph from looking thin.
  const ops = [`s:${root}~9`];
  const graph = replay(dataset, root, ops, "word", ctx);
  const next = await openNeighbours(graph, root, 3, ctx);
  return { root, mode: "meaning", start: "word", ops: [...ops, ...next.map((w) => `s:${w}~5`)] };
}

async function planMixed(dataset, root, ctx) {
  const kanji = wordComponents(dataset.WORDS_BY_TEXT[root]);
  const ops = [`s:${root}~6`, `k:${pick(kanji, ctx.random)}~5`];
  const graph = replay(dataset, root, ops, "kanji", ctx);
  const next = await openNeighbours(graph, root, 1, ctx);
  return { root, mode: "meaning", start: "kanji", ops: [...ops, ...next.map((w) => `s:${w}~4`)] };
}

/** Up to `count` of `root`'s revealed meaning neighbours that have neighbours
 * of their own, with their shards loaded. */
async function openNeighbours(graph, root, count, { semantic, loadSemantic, random }) {
  const options = shuffled(wordsLinkedFrom(graph, wordNodeId(root), "semantic"), random).filter((w) =>
    semantic.hasNeighbours(w, graph.nodes.get(wordNodeId(w))?.rank)
  );
  const chosen = options.slice(0, count);
  if (chosen.length) await loadSemantic(chosen);
  return chosen;
}

function replay(dataset, root, ops, start, { semantic, isJlptAllowed }) {
  return replayGraph(dataset, root, ops, { semantic, isJlptAllowed, start });
}

/**
 * Plan a random graph. `semantic` is the store from data/semantic.js and
 * `loadSemantic(words)` loads into it (rejecting on failure); `candidates` is
 * luckyCandidates(dataset), passed in so it's worked out once.
 */
export async function planLuckyGraph(
  dataset,
  { candidates, semantic, loadSemantic, isJlptAllowed, random = Math.random, flavour = pick(LUCKY_FLAVOURS, random) }
) {
  if (!candidates.length) return null;
  const ctx = { semantic, loadSemantic, isJlptAllowed, random };

  if (flavour !== "kanji") {
    try {
      await loadSemantic([]);
    } catch {
      flavour = "kanji";
    }
  }

  for (let i = 0; i < MAX_TRIES; i++) {
    const root = pick(candidates, random);
    if (isJlptAllowed && !isJlptAllowed("word", root)) continue;
    if (flavour === "kanji") return planKanji(dataset, root, ctx);
    const entry = dataset.WORDS_BY_TEXT[root];
    if (!semantic.hasNeighbours(root, entry?.rank)) continue;
    try {
      await loadSemantic([root]);
    } catch {
      return planKanji(dataset, root, ctx);
    }
    if ((semantic.neighboursOf(root)?.length ?? 0) < MIN_NEIGHBOURS) continue;
    try {
      return flavour === "meaning" ? await planMeaning(dataset, root, ctx) : await planMixed(dataset, root, ctx);
    } catch {
      return planKanji(dataset, root, ctx);
    }
  }
  return planKanji(dataset, pick(candidates, random), ctx);
}
