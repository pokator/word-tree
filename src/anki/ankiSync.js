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
// Keeps each OR-joined search query to a sane length.
const QUERY_CHUNK = 40;

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

// Anki tags can't contain spaces, and "::" is its hierarchy separator.
function tagPart(value) {
  return String(value).trim().replace(/\s+/g, "_").replace(/:+/g, "_");
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
 * One card's study status. Anki's `interval` is in days for review cards
 * (negative seconds while still in learning steps); `type` 0 is a new card
 * that hasn't been studied yet; `queue` -1 is suspended.
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

/**
 * Makes Anki hold exactly one Moto note per bookmarked word, with current
 * tags. Adds the missing ones; retags existing ones (tags change as a word
 * joins collections). Never deletes -- un-bookmarking a word leaves its
 * Anki card and review history alone.
 * `items`: [{ entry, componentKanji, tags }]. Returns { added, retagged }.
 */
export async function pushBookmarks(items) {
  await ensureModelAndDeck();
  const noteIds = await invoke("findNotes", { query: `note:${quoteSearch(MODEL_NAME)}` });
  const infos = noteIds.length ? await invoke("notesInfo", { notes: noteIds }) : [];
  const existing = new Map(infos.map((n) => [n.fields.Word?.value, n]));

  const toAdd = [];
  const retag = [];
  for (const { entry, componentKanji, tags } of items) {
    const note = existing.get(escapeHtml(entry.word));
    if (!note) {
      toAdd.push({
        deckName: DECK_NAME,
        modelName: MODEL_NAME,
        fields: noteFields(entry, componentKanji),
        tags,
        options: { allowDuplicate: false, duplicateScope: "deck" },
      });
    } else {
      const want = [...tags].sort().join(" ");
      const have = [...note.tags].filter((t) => t === TAG_ROOT || t.startsWith(`${TAG_ROOT}::`)).sort().join(" ");
      if (want !== have) retag.push({ note: note.noteId, tags });
    }
  }

  if (toAdd.length) await invoke("addNotes", { notes: toAdd });
  if (retag.length) {
    // Replaces only the moto:: tags -- anything the user tagged the note
    // with by hand inside Anki is kept.
    const byId = new Map(infos.map((n) => [n.noteId, n.tags]));
    await invoke("multi", {
      actions: retag.map(({ note, tags }) => ({
        action: "updateNoteTags",
        params: {
          note,
          tags: [...byId.get(note).filter((t) => t !== TAG_ROOT && !t.startsWith(`${TAG_ROOT}::`)), ...tags],
        },
      })),
    });
  }
  return { added: toAdd.length, retagged: retag.length };
}

/**
 * Study status for each of `words`, read from Anki. Looks at Moto's own
 * notes AND the first field of every other note type -- the conventional
 * "expression" field -- so words already being studied in other decks
 * (a core deck, a mining deck) light up too, without any setup.
 * Returns Map(word -> "new" | "learning" | "known") for words Anki has.
 */
export async function pullStatuses(words) {
  const unique = [...new Set(words)].filter(Boolean);
  const result = new Map();
  if (unique.length === 0) return result;

  const models = await invoke("modelNames");
  const firstFields = new Map();
  for (const model of models) {
    const fields = model === MODEL_NAME ? ["Word"] : await invoke("modelFieldNames", { modelName: model });
    if (fields[0]) firstFields.set(model, fields[0]);
  }
  const fieldNames = [...new Set(firstFields.values())];
  if (fieldNames.length === 0) return result;

  for (const chunk of chunks(unique, QUERY_CHUNK)) {
    const terms = [];
    for (const field of fieldNames) {
      // Wildcards on both sides: a field often wraps the word in HTML
      // (<b>本当</b>) or furigana markup, which an exact field match would
      // miss. Over-matches (本当に) are dropped below by comparing the
      // field's plain text exactly.
      for (const w of chunk) terms.push(`${field.replace(/[\s:"]/g, "_")}:*${quoteSearch(w).slice(1, -1)}*`);
    }
    const cardIds = await invoke("findCards", { query: terms.map((t) => `"${t}"`).join(" OR ") });
    if (cardIds.length === 0) continue;
    const cards = await invoke("cardsInfo", { cards: cardIds });
    const wanted = new Set(chunk);
    for (const card of cards) {
      const field = firstFields.get(card.modelName);
      const raw = card.fields?.[field]?.value ?? "";
      const word = raw.replace(/<[^>]*>/g, "").trim();
      if (!wanted.has(word)) continue;
      result.set(word, bestStatus(result.get(word), statusFromCard(card)));
    }
  }
  return result;
}

/** How many Moto cards are due for review right now. */
export async function dueCount() {
  const ids = await invoke("findCards", { query: `deck:${quoteSearch(DECK_NAME)} is:due` });
  return ids.length;
}

/** Opens Anki's reviewer on the Moto deck. */
export function openReview() {
  return invoke("guiDeckReview", { name: DECK_NAME });
}

/** Opens Anki's card browser on a search (e.g. one collection's tag). */
export function openBrowser(query) {
  return invoke("guiBrowse", { query });
}

export function collectionQuery(tag) {
  return `tag:${tag}`;
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
