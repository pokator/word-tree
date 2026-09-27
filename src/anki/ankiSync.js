// Anki is Moto's only review scheduler (it runs FSRS itself). This module
// is the whole two-way bridge, over AnkiConnect (see ankiConnect.js):
//   - out: every bookmarked word becomes a note in the "元" deck, using a
//     dedicated Moto note type, tagged with its automatic collections;
//   - back: each word's study status is read off its Anki card's interval,
//     including words already in the user's OTHER decks.
// Everything here is plain async functions over `invoke`, so it's testable
// against a fake AnkiConnect without a running Anki.

import { invoke, DECK_NAME } from "./ankiConnect";
import { extractKanjiComponents } from "../graph/kanji";
import { wordJlptBucket } from "../graph/buildGraph";

export const MODEL_NAME = "Moto (元)";
export const TAG_ROOT = "moto";
// A card counts as known once Anki is spacing it three weeks or more apart
// -- the same threshold Migaku uses for "known".
export const KNOWN_INTERVAL_DAYS = 21;
// Keeps each OR-joined search query to a sane length (each word adds a
// few terms per note type).
const QUERY_CHUNK = 25;
const NOTE_CHUNK = 200;

const FIELDS = ["Word", "Reading", "Meaning", "Kanji"];

const FRONT = `<div class="moto-word">{{Word}}</div>`;
const BACK = `{{FrontSide}}
<hr id="answer">
<div class="moto-reading">{{Reading}}</div>
<div class="moto-meaning">{{Meaning}}</div>
{{#Kanji}}<div class="moto-kanji">{{Kanji}}</div>{{/Kanji}}`;
const CSS = `.card { font-family: "Hiragino Sans", "Noto Sans CJK JP", "Yu Gothic", sans-serif; text-align: center; color: #1c1a14; background: #e7e2d1; }
.night_mode .card { color: #f5f6fa; background: #0b0c10; }
.moto-word { font-size: 56px; margin: 24px 0 8px; }
.moto-reading { font-size: 26px; margin-top: 12px; }
.moto-meaning { font-size: 20px; margin-top: 8px; }
.moto-kanji { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 16px; margin-top: 20px; font-size: 15px; opacity: 0.85; }
.moto-kanji b { font-size: 22px; font-weight: 500; margin-right: 4px; }`;

// Anki tags can't contain spaces, and "::" is its hierarchy separator;
// quotes, backslashes and * are search syntax, so they go too.
export function tagPart(value) {
  return String(value).trim().replace(/\s+/g, "_").replace(/:+/g, "_").replace(/["\\*]/g, "_");
}

/**
 * The automatic collections a bookmark belongs to, as Anki tags -- so any
 * slice (all your words with 日, your N5 words, what you found exploring
 * 日本語) is one tag search away inside Anki too.
 */
export function tagsFor({ kanji = [], jlpt = null, foundFrom = null, userTags = [] }) {
  const tags = [TAG_ROOT];
  for (const char of kanji) tags.push(`${TAG_ROOT}::kanji::${char}`);
  if (jlpt) tags.push(`${TAG_ROOT}::jlpt::${jlpt}`);
  if (foundFrom) tags.push(`${TAG_ROOT}::from::${tagPart(foundFrom)}`);
  for (const t of userTags) tags.push(`${TAG_ROOT}::tag::${tagPart(t)}`);
  return [...new Set(tags)];
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** Note fields for one word -- the kanji breakdown is what ties a review
 * back to the graph: each component kanji with its core meaning. */
export function noteFields(entry, componentKanji = []) {
  return {
    Word: escapeHtml(entry.word),
    Reading: escapeHtml(entry.reading ?? ""),
    Meaning: escapeHtml(entry.meaning ?? ""),
    Kanji: componentKanji
      .map((k) => `<span><b>${escapeHtml(k.char)}</b>${escapeHtml((k.meaning ?? "").split(";")[0])}</span>`)
      .join(""),
  };
}

/**
 * Plain text of an Anki field, for matching a word however it's formatted
 * there: HTML stripped, entities decoded (including the stray &nbsp; Anki's
 * editor leaves behind), furigana brackets (日本語[にほんご]) and all
 * whitespace removed. Used on both sides of every comparison -- Moto's own
 * notes (which the user may have edited inside Anki) and other decks'.
 */
export function plainField(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, "");
}

/**
 * One card's study status, from AnkiConnect's cardsInfo: `interval` is the
 * current interval in days (0 while still in learning steps), `type` 0 is
 * a new card that hasn't been studied yet, `queue` -1 is suspended.
 */
export function statusFromCard(card) {
  if (!card) return null;
  if (card.type === 0 || card.queue === 0) return "new";
  if (card.queue === -1 && card.interval <= 0) return "new";
  return card.interval >= KNOWN_INTERVAL_DAYS ? "known" : "learning";
}

const STATUS_RANK = { new: 0, learning: 1, known: 2 };

/** A word can have several cards (several decks, or a note type with more
 * than one template) -- its status is the best of them. */
function bestStatus(a, b) {
  if (!a) return b;
  if (!b) return a;
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Anki search syntax: double quotes delimit, and backslash escapes a quote
// or backslash; * and _ are wildcards and : separates a field name.
function quoteSearch(value) {
  return `"${String(value).replace(/([\\"*_:])/g, "\\$1")}"`;
}
function escapeSearch(value) {
  return quoteSearch(value).slice(1, -1);
}

/** AnkiConnect's `multi`: one request, one result per action, each either
 * { result } or { error }. Sub-actions need their own `version`. */
async function multi(actions) {
  const results = await invoke("multi", { actions: actions.map((a) => ({ version: 6, ...a })) });
  return results.map((r) => (r && typeof r === "object" && "error" in r ? r : { result: r, error: null }));
}

/** Creates the Moto note type and deck if they don't exist yet. Safe to
 * call before every sync. */
export async function ensureModelAndDeck() {
  const models = await invoke("modelNames");
  if (!models.includes(MODEL_NAME)) {
    await invoke("createModel", {
      modelName: MODEL_NAME,
      inOrderFields: FIELDS,
      css: CSS,
      isCloze: false,
      cardTemplates: [{ Name: "Recognition", Front: FRONT, Back: BACK }],
    });
  }
  await invoke("createDeck", { deck: DECK_NAME });
}

const isMotoTag = (t) => t.toLowerCase() === TAG_ROOT || t.toLowerCase().startsWith(`${TAG_ROOT}::`);

/**
 * Makes Anki hold one Moto note per bookmarked word, with current tags.
 * Adds the missing ones; retags existing ones (tags change as a word joins
 * collections). Never deletes -- un-bookmarking a word leaves its Anki card
 * and review history alone. Words in `skipWords` get no new card (already
 * studied in another deck, or marked known -- see useAnkiSync).
 *
 * Existing notes are matched on their Word field's plain text, so one the
 * user reformatted inside Anki is still recognised rather than re-added.
 * New notes are checked with canAddNotes first: addNotes fails the WHOLE
 * batch if any one note is a duplicate, which would otherwise block every
 * other bookmark on every sync.
 * `items`: [{ entry, componentKanji, tags }]. Returns { added, retagged }.
 */
export async function pushBookmarks(items, { skipWords = new Set() } = {}) {
  await ensureModelAndDeck();
  const noteIds = await invoke("findNotes", { query: `note:${quoteSearch(MODEL_NAME)}` });
  const infos = noteIds.length ? await invoke("notesInfo", { notes: noteIds }) : [];
  const existing = new Map();
  for (const n of infos) {
    const key = plainField(n.fields.Word?.value);
    if (!existing.has(key)) existing.set(key, n);
  }

  const candidates = [];
  const retag = [];
  for (const { entry, componentKanji, tags } of items) {
    const note = existing.get(plainField(entry.word));
    if (!note) {
      if (skipWords.has(entry.word)) continue;
      candidates.push({
        deckName: DECK_NAME,
        modelName: MODEL_NAME,
        fields: noteFields(entry, componentKanji),
        tags,
        options: { allowDuplicate: false, duplicateScope: "deck" },
      });
    } else {
      // Case-insensitive: Anki keeps a tag's existing capitalisation, so a
      // case-only difference would otherwise retag on every sync forever.
      const want = tags.map((t) => t.toLowerCase()).sort().join(" ");
      const have = note.tags.filter(isMotoTag).map((t) => t.toLowerCase()).sort().join(" ");
      if (want !== have) retag.push({ note: note.noteId, tags, userTags: note.tags.filter((t) => !isMotoTag(t)) });
    }
  }

  let added = 0;
  if (candidates.length) {
    const ok = await invoke("canAddNotes", { notes: candidates });
    const addable = candidates.filter((_, i) => ok[i]);
    if (addable.length) {
      const ids = await invoke("addNotes", { notes: addable });
      added = ids.filter(Boolean).length;
    }
  }
  if (retag.length) {
    // Replaces only the moto:: tags -- anything the user tagged the note
    // with by hand inside Anki is kept.
    const results = await multi(
      retag.map(({ note, tags, userTags }) => ({ action: "updateNoteTags", params: { note, tags: [...userTags, ...tags] } }))
    );
    const failed = results.filter((r) => r.error);
    if (failed.length) console.warn("Some Anki notes couldn't be retagged:", failed.map((r) => r.error));
  }
  return { added, retagged: retag.length };
}

/**
 * Study status for each of `words`, read from Anki -- from Moto's own notes
 * AND the first field of every other note type (the conventional
 * "expression" field), so words already studied in other decks (a core
 * deck, a mining deck) light up too, without any setup.
 *
 * Two steps, so the expensive call only ever sees real matches: a narrow
 * search for notes whose first field is the word -- exactly, wrapped in
 * HTML, followed by furigana, or padded with &nbsp; -- then an exact
 * plain-text check on those notes' fields, then card info for just the
 * notes that passed.
 *
 * Returns { statuses: Map(word -> status), foreign: Set(word) } -- foreign
 * being the words that have a card outside Moto's own note type.
 */
export async function pullStatuses(words) {
  const unique = [...new Set(words)].filter(Boolean);
  const statuses = new Map();
  const foreign = new Set();
  if (unique.length === 0) return { statuses, foreign };

  const models = await invoke("modelNames");
  const others = models.filter((m) => m !== MODEL_NAME);
  const fieldLists = others.length ? await multi(others.map((m) => ({ action: "modelFieldNames", params: { modelName: m } }))) : [];
  const firstFields = new Map([[MODEL_NAME, "Word"]]);
  others.forEach((m, i) => {
    const first = fieldLists[i]?.result?.[0];
    if (first) firstFields.set(m, first);
  });
  const fieldNames = [...new Set(firstFields.values())].map((f) => f.replace(/[\s:"]/g, "_"));

  for (const chunk of chunks(unique, QUERY_CHUNK)) {
    const terms = [];
    for (const field of fieldNames) {
      for (const w of chunk) {
        const e = escapeSearch(w);
        terms.push(`${field}:${e}`, `${field}:*>${e}<*`, `${field}:${e}[*`, `${field}:${e}&nbsp;*`, `${field}:*&nbsp;${e}`);
      }
    }
    const noteIds = await invoke("findNotes", { query: terms.map((t) => `"${t}"`).join(" OR ") });
    if (noteIds.length === 0) continue;

    const wanted = new Set(chunk);
    const wordByNote = new Map();
    for (const idChunk of chunks(noteIds, NOTE_CHUNK)) {
      const infos = await invoke("notesInfo", { notes: idChunk });
      for (const n of infos) {
        const field = firstFields.get(n.modelName);
        const word = field ? plainField(n.fields?.[field]?.value) : null;
        if (!word || !wanted.has(word)) continue;
        wordByNote.set(n.noteId, word);
        if (n.modelName !== MODEL_NAME) foreign.add(word);
      }
    }
    if (wordByNote.size === 0) continue;

    const cardIds = await invoke("findCards", { query: `nid:${[...wordByNote.keys()].join(",")}` });
    const cards = cardIds.length ? await invoke("cardsInfo", { cards: cardIds }) : [];
    for (const card of cards) {
      const word = wordByNote.get(card.note);
      if (word) statuses.set(word, bestStatus(statuses.get(word), statusFromCard(card)));
    }
  }
  return { statuses, foreign };
}

/** What Anki's deck list shows for the Moto deck: new + learning + review
 * cards available today (within the deck's daily limits) -- so the count
 * isn't empty right after bookmarking, when every card is still new. */
export async function dueCount() {
  const stats = await invoke("getDeckStats", { decks: [DECK_NAME] });
  const deck = Object.values(stats ?? {}).find((d) => d.name === DECK_NAME);
  return deck ? deck.new_count + deck.learn_count + deck.review_count : 0;
}

/** Opens Anki's reviewer on the Moto deck. */
export function openReview() {
  return invoke("guiDeckReview", { name: DECK_NAME });
}

/** Opens Anki's card browser on a search (e.g. one collection's tag). */
export function openBrowser(query) {
  return invoke("guiBrowse", { query });
}

/** Browser search for one collection's tag -- quoted, since a user tag can
 * contain characters Anki's search treats as syntax. */
export function collectionQuery(tag) {
  return `"tag:${String(tag).replace(/(["\\])/g, "\\$1")}"`;
}

/**
 * Turns bookmarks into what pushBookmarks needs: each word's dictionary
 * entry, its component kanji (for the card's breakdown and its
 * moto::kanji:: tags), its JLPT level, where it was found, and any tags the
 * user gave it. `bookmarks`: [{ item_id, found_from }]; `userTagsFor`:
 * word -> string[].
 */
export function syncItemsFor(dataset, bookmarks, userTagsFor = () => []) {
  const items = [];
  for (const b of bookmarks) {
    const entry = dataset.WORDS_BY_TEXT[b.item_id];
    if (!entry) continue;
    const componentKanji = extractKanjiComponents(entry.word)
      .map((c) => dataset.KANJI[c])
      .filter(Boolean);
    const bucket = wordJlptBucket(dataset, entry.word);
    items.push({
      entry,
      componentKanji,
      tags: tagsFor({
        kanji: componentKanji.map((k) => k.char),
        jlpt: bucket === "unrated" ? null : bucket,
        foundFrom: b.found_from && b.found_from !== entry.word ? b.found_from : null,
        userTags: userTagsFor(entry.word),
      }),
    });
  }
  return items;
}
