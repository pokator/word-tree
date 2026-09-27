import { extractKanjiComponents } from "../graph/kanji";
import { wordJlptBucket } from "../graph/buildGraph";
import { TAG_ROOT, tagPart } from "../anki/ankiSync";

const JLPT_ORDER = ["n5", "n4", "n3", "n2", "n1"];

/**
 * Your bookmarks, sliced automatically -- the replacement for hand-built
 * groups. Every collection maps 1:1 to an Anki tag (see ankiSync.tagsFor),
 * so the same slice can be browsed or turned into a filtered deck inside
 * Anki. A kanji collection only appears once it links two or more of your
 * words: one word "sharing" a kanji with nothing isn't a collection.
 *
 * Returns [{ kind, key, label, words: string[], ankiTag }], grouped by kind
 * in a fixed order: tags you made, then JLPT, then shared kanji, then where
 * you found them.
 */
export function buildCollections(dataset, bookmarks, userTagsFor = () => []) {
  const byKind = { tag: new Map(), jlpt: new Map(), kanji: new Map(), from: new Map() };
  const add = (kind, key, word) => {
    const map = byKind[kind];
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.includes(word)) list.push(word);
  };

  for (const b of bookmarks) {
    const word = b.item_id;
    if (!dataset.WORDS_BY_TEXT[word]) continue;
    for (const t of userTagsFor(word)) add("tag", t, word);
    const bucket = wordJlptBucket(dataset, word);
    if (bucket !== "unrated") add("jlpt", bucket, word);
    for (const char of new Set(extractKanjiComponents(word))) add("kanji", char, word);
    if (b.found_from && b.found_from !== word) add("from", b.found_from, word);
  }

  const out = [];
  for (const [key, words] of [...byKind.tag].sort(([a], [b]) => a.localeCompare(b))) {
    out.push({ kind: "tag", key, label: key, words, ankiTag: `${TAG_ROOT}::tag::${tagPart(key)}` });
  }
  for (const key of JLPT_ORDER) {
    const words = byKind.jlpt.get(key);
    if (words) out.push({ kind: "jlpt", key, label: key.toUpperCase(), words, ankiTag: `${TAG_ROOT}::jlpt::${key}` });
  }
  for (const [key, words] of [...byKind.kanji].sort(([, a], [, b]) => b.length - a.length)) {
    if (words.length < 2) continue;
    out.push({ kind: "kanji", key, label: key, words, ankiTag: `${TAG_ROOT}::kanji::${key}` });
  }
  for (const [key, words] of byKind.from) {
    out.push({ kind: "from", key, label: `from ${key}`, words, ankiTag: `${TAG_ROOT}::from::${tagPart(key)}` });
  }
  return out;
}
