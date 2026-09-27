// Talks to AnkiConnect (https://foosoft.net/projects/anki-connect/), the
// Anki desktop add-on that exposes a local HTTP API. Requires Anki desktop
// open with AnkiConnect installed and this app's origin allowed in its
// webCorsOriginList config -- see BookmarksPanel for the user-facing setup
// copy. Chrome/Edge 142+ also ask the user for "local network access" the
// first time a public site calls 127.0.0.1; until that's allowed (or if it's
// denied) requests fail exactly as if Anki weren't running, so the UI
// explains both together. The TSV fallback in exportFile.js exists for when
// none of this is available.

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const DECK_NAME = "元";
// Long enough for a slow collection query, short enough that an
// unanswered permission prompt or a dead port doesn't hang the UI.
const TIMEOUT_MS = 8000;

export async function invoke(action, params = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.result;
  } finally {
    clearTimeout(timer);
  }
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

export { DECK_NAME };
