// An in-memory stand-in for Anki + AnkiConnect, installed as `fetch`, for
// tests. Implements just the actions ankiSync.js uses, with enough of
// Anki's search syntax (note:"X", deck:"X", is:due, "Field:value" OR ...)
// for those queries. Assertions run against the resulting collection, not
// against a list of mocked calls.

function unquote(term) {
  let t = term.trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t.replace(/\\(.)/g, "$1");
}

const REGEX_SPECIAL = /[.+?^${}()|[\]\\]/g;

function globMatch(pattern, text) {
  const source = pattern
    .split("*")
    .map((part) => part.replace(REGEX_SPECIAL, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "s").test(text);
}

export function createFakeAnki({ models = {}, decks = [], notes = [] } = {}) {
  let nextId = 1000;
  const state = {
    // modelName -> fields[]
    models: { Basic: ["Front", "Back"], ...models },
    decks: new Set(["Default", ...decks]),
    // { noteId, modelName, deck, fields: {name: value}, tags: [], cards: [{cardId, interval, type, queue, due}] }
    notes: notes.map((n) => ({
      noteId: nextId++,
      tags: [],
      ...n,
      cards: (n.cards ?? [{ interval: 0, type: 0, queue: 0 }]).map((c) => ({ cardId: nextId++, due: false, ...c })),
    })),
    calls: [],
  };

  function allCards() {
    return state.notes.flatMap((n) => n.cards.map((c) => ({ note: n, card: c })));
  }

  function matchesTerm(note, card, term) {
    if (term === "is:due") return card.due;
    const colon = term.indexOf(":");
    const key = term.slice(0, colon);
    const value = unquote(term.slice(colon + 1));
    if (key === "note") return note.modelName === value;
    if (key === "deck") return note.deck === value;
    if (key === "tag") return note.tags.includes(value);
    const field = Object.keys(note.fields).find((f) => f.toLowerCase() === key.toLowerCase());
    if (!field) return false;
    // Anki field search: whole-field match, with * as a wildcard.
    return globMatch(value, note.fields[field]);
  }

  // Supports `A OR B OR ...` of single terms, or space-separated AND terms.
  function search(query) {
    const orParts = query.split(/\s+OR\s+/);
    return allCards().filter(({ note, card }) =>
      orParts.some((part) => {
        const unwrapped = part.trim().startsWith('"') ? [unquote(part)] : part.trim().split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/);
        return unwrapped.every((t) => matchesTerm(note, card, t));
      })
    );
  }

  const actions = {
    version: () => 6,
    modelNames: () => Object.keys(state.models),
    modelFieldNames: ({ modelName }) => state.models[modelName],
    createModel: ({ modelName, inOrderFields }) => {
      state.models[modelName] = inOrderFields;
      return {};
    },
    createDeck: ({ deck }) => {
      state.decks.add(deck);
      return 1;
    },
    findNotes: ({ query }) => [...new Set(search(query).map(({ note }) => note.noteId))],
    notesInfo: ({ notes }) =>
      notes.map((id) => {
        const n = state.notes.find((x) => x.noteId === id);
        return {
          noteId: n.noteId,
          modelName: n.modelName,
          tags: [...n.tags],
          fields: Object.fromEntries(Object.entries(n.fields).map(([k, v], i) => [k, { value: v, order: i }])),
        };
      }),
    addNotes: ({ notes }) =>
      notes.map((n) => {
        const noteId = nextId++;
        state.notes.push({
          noteId,
          modelName: n.modelName,
          deck: n.deckName,
          fields: { ...n.fields },
          tags: [...(n.tags ?? [])],
          cards: [{ cardId: nextId++, interval: 0, type: 0, queue: 0, due: false }],
        });
        return noteId;
      }),
    updateNoteTags: ({ note, tags }) => {
      state.notes.find((n) => n.noteId === note).tags = [...tags];
      return null;
    },
    findCards: ({ query }) => search(query).map(({ card }) => card.cardId),
    cardsInfo: ({ cards }) =>
      cards.map((id) => {
        const { note, card } = allCards().find(({ card: c }) => c.cardId === id);
        return {
          cardId: card.cardId,
          note: note.noteId,
          modelName: note.modelName,
          deckName: note.deck,
          interval: card.interval,
          type: card.type,
          queue: card.queue,
          fields: Object.fromEntries(Object.entries(note.fields).map(([k, v], i) => [k, { value: v, order: i }])),
        };
      }),
    guiDeckReview: () => true,
    guiBrowse: () => [],
  };

  async function run(action, params) {
    state.calls.push(action);
    if (action === "multi") {
      return params.actions.map((a) => {
        try {
          return { result: actions[a.action](a.params ?? {}), error: null };
        } catch (e) {
          return { result: null, error: e.message };
        }
      });
    }
    if (!actions[action]) throw new Error(`unsupported action ${action}`);
    return actions[action](params ?? {});
  }

  const fetch = async (_url, init) => {
    const { action, params } = JSON.parse(init.body);
    try {
      const result = await run(action, params);
      return { json: async () => ({ result, error: null }) };
    } catch (e) {
      return { json: async () => ({ result: null, error: e.message }) };
    }
  };

  return { state, fetch };
}
