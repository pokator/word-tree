import { useCallback, useEffect, useRef, useState } from "react";
import { probeConnection } from "./ankiConnect";
import { dueCount, openBrowser, openReview, pullStatuses, pushBookmarks, syncItemsFor } from "./ankiSync";

const ENABLED_KEY = "word-tree:anki-enabled";
// Coalesces bursts (several bookmarks in a row, a graph expansion adding a
// dozen nodes) into one round of AnkiConnect calls.
const SYNC_DEBOUNCE_MS = 800;

function loadEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function saveEnabled(value) {
  try {
    localStorage.setItem(ENABLED_KEY, String(value));
  } catch {
    // localStorage unavailable -- the user just reconnects next visit
  }
}

/**
 * Keeps Moto and Anki in step while Anki is connected: bookmarks go out as
 * cards (ankiSync.pushBookmarks), study status comes back for every
 * bookmark and every word on the graph (pullStatuses -> applyStatuses,
 * which also saves it to the account so phones see it), plus the due count.
 *
 * Opt-in by design: nothing talks to Anki until the user presses "Connect"
 * once (then remembered per browser). On Chrome/Edge 142+ the first request
 * to 127.0.0.1 raises a "local network access" permission prompt -- that
 * must only ever appear because someone asked to connect, never on page
 * load for someone who doesn't use Anki.
 *
 * `state`: "off" (never connected) | "checking" | "connected" |
 * "unreachable" (Anki closed, AnkiConnect missing, CORS not set up, or the
 * browser permission denied -- indistinguishable from the page).
 */
export function useAnkiSync({ dataset, bookmarks, userTagsFor, graphWords, applyStatuses }) {
  const [enabled, setEnabled] = useState(loadEnabled);
  const [state, setState] = useState(() => (loadEnabled() ? "checking" : "off"));
  const [due, setDue] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Latest inputs, read by the (debounced, async) sync without re-creating
  // it -- and so re-scheduling it -- on every render.
  const inputsRef = useRef(null);
  useEffect(() => {
    inputsRef.current = { dataset, bookmarks, userTagsFor, graphWords, applyStatuses };
  });
  const runningRef = useRef(false);

  const sync = useCallback(async () => {
    const inputs = inputsRef.current;
    if (!inputs || inputs.dataset.loading || runningRef.current) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      const { dataset: ds, bookmarks: bm, userTagsFor: tagsFor, graphWords: gw, applyStatuses: apply } = inputs;
      await pushBookmarks(syncItemsFor(ds, bm, tagsFor));
      const words = [...new Set([...bm.map((b) => b.item_id), ...gw])];
      const statuses = await pullStatuses(words);
      apply([...statuses].map(([word, status]) => [`word:${word}`, status]));
      setDue(await dueCount());
      setLastSynced(new Date());
      setError(null);
      setState("connected");
    } catch (err) {
      const reachable = await probeConnection();
      setState(reachable ? "connected" : "unreachable");
      setError(reachable ? err.message : null);
    } finally {
      runningRef.current = false;
      setSyncing(false);
    }
  }, []);

  const check = useCallback(async () => {
    setState("checking");
    const ok = await probeConnection();
    setState(ok ? "connected" : "unreachable");
    if (ok) await sync();
  }, [sync]);

  const connect = useCallback(async () => {
    setEnabled(true);
    saveEnabled(true);
    await check();
  }, [check]);

  const disconnect = useCallback(() => {
    setEnabled(false);
    saveEnabled(false);
    setState("off");
    setDue(null);
  }, []);

  // On load (if enabled), and whenever the tab regains focus -- the user
  // may just have finished a review session in Anki.
  useEffect(() => {
    if (!enabled) return undefined;
    check();
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, check]);

  // Re-sync (debounced) when bookmarks or the words on the graph change.
  const bookmarkKey = bookmarks.map((b) => b.item_id).join("|");
  const graphKey = graphWords.join("|");
  useEffect(() => {
    if (state !== "connected" || dataset.loading) return undefined;
    const t = setTimeout(sync, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, bookmarkKey, graphKey, dataset.loading, sync]);

  const review = useCallback(() => openReview().catch(() => setState("unreachable")), []);
  const browse = useCallback((query) => openBrowser(query).catch(() => setState("unreachable")), []);

  return { enabled, state, due, lastSynced, error, syncing, connect, disconnect, check, syncNow: sync, review, browse };
}
