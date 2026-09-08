// Talks to AnkiConnect (https://foosoft.net/projects/anki-connect/), the
// Anki desktop add-on that exposes a local HTTP API. Requires Anki desktop
// open with AnkiConnect installed and this app's origin allowed in its
// webCorsOriginList config -- see SavedWordsPanel for the user-facing setup
// copy. A page served over HTTPS calling http://127.0.0.1 can also hit
// mixed-content/Private Network Access restrictions in some browsers; the
// TSV fallback in exportFile.js exists specifically for when this fails.

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const DECK_NAME = "元";

async function invoke(action, params = {}) {
  const res = await fetch(ANKI_CONNECT_URL, {
    method: "POST",
    body: JSON.stringify({ action, version: 6, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

/** Resolves true/false -- never throws, since "not reachable" is expected. */
export async function probeConnection() {
  try {
    await invoke("version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Pushes one Anki note per word into the "元" deck using the
 * built-in Basic note type, so there's no createModel schema to manage.
 * Skips exact duplicates already in the deck.
 */
export async function exportWords(words) {
  await invoke("createDeck", { deck: DECK_NAME }); // idempotent
  const notes = words.map((w) => ({
    deckName: DECK_NAME,
    modelName: "Basic",
    fields: { Front: w.word, Back: `${w.reading} — ${w.meaning}` },
    options: { allowDuplicate: false, duplicateScope: "deck" },
  }));
  return invoke("addNotes", { notes });
}

export { DECK_NAME };
