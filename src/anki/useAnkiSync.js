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

function friendlyError(err) {
  if (err?.name === "AbortError") return "Anki took too long to respond. Try Sync now in a moment.";
  return err?.message || "Something went wrong talking to Anki.";
}

/**
 * Keeps Moto and Anki in step while Anki is connected: study status comes
 * back for every bookmark and every word on the graph (pullStatuses ->
 * applyStatuses, which also saves it to the account so phones see it),
 * bookmarks go out as cards (pushBookmarks), plus today's review count.
 *
 * Opt-in by design: nothing talks to Anki until the user presses "Connect"
 * once (then remembered per browser). On Chrome/Edge 142+ the first request
 * to 127.0.0.1 raises a "local network access" permission prompt -- that
 * must only ever appear because someone asked to connect, never on page
 * load for someone who doesn't use Anki.
 *
 * Syncs start from one place -- the debounced effect below -- so a connect,
 * a tab focus, a Try again, a new bookmark, and a tag edit all coalesce
 * into a single round of calls. A change that lands while a sync is running
 * queues exactly one more; Disconnect invalidates any sync in flight (via
 * the generation counter) so it can't flip the state back.
 *
 * `state`: "off" (never connected) | "checking" | "connected" |
 * "unreachable" (Anki closed, AnkiConnect missing, CORS not set up, or the
 * browser permission denied -- indistinguishable from the page).
 */
export function useAnkiSync({ dataset, bookmarks, userTagsFor, graphWords, statusFor, applyStatuses }) {
  const [enabled, setEnabled] = useState(loadEnabled);
  const [state, setState] = useState(() => (loadEnabled() ? "checking" : "off"));
  const [due, setDue] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  // Bumped to ask for a sync (focus, reconnect, Try again, Sync now).
  const [tick, setTick] = useState(0);

  // Latest inputs, read by the (debounced, async) sync without re-creating
  // it -- and so re-scheduling it -- on every render.
  const inputsRef = useRef(null);
  useEffect(() => {
    inputsRef.current = { dataset, bookmarks, userTagsFor, graphWords, statusFor, applyStatuses };
  });
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const genRef = useRef(0);

  const sync = useCallback(async () => {
    const inputs = inputsRef.current;
    if (!inputs || inputs.dataset.loading) return;
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }
    const gen = genRef.current;
    const current = () => gen === genRef.current;
    runningRef.current = true;
    setSyncing(true);
    try {
      const { dataset: ds, bookmarks: bm, userTagsFor: tagsFor, graphWords: gw, statusFor: known, applyStatuses: apply } =
        inputs;
      // Status first: it also tells us which bookmarks shouldn't get a Moto
      // card -- ones already studied in another deck (no duplicate card),
      // and ones the user marked "I already know this" that Anki has never
      // seen.
      const words = [...new Set([...bm.map((b) => b.item_id), ...gw])];
      const { statuses, foreign } = await pullStatuses(words);
      if (!current()) return;
      apply([...statuses].map(([word, status]) => [`word:${word}`, status]));

      const skip = new Set(foreign);
      for (const b of bm) if (!statuses.has(b.item_id) && known?.(b.item_id) === "known") skip.add(b.item_id);
      let pushError = null;
      try {
        await pushBookmarks(syncItemsFor(ds, bm, tagsFor), { skipWords: skip });
      } catch (err) {
        pushError = err; // statuses above still stand -- one bad note shouldn't blank them
      }
      const count = await dueCount();
      if (!current()) return;
      setDue(count);
      setLastSynced(new Date());
      setError(pushError ? friendlyError(pushError) : null);
      setState("connected");
    } catch (err) {
      const reachable = await probeConnection();
      if (!current()) return;
      setState(reachable ? "connected" : "unreachable");
      setError(reachable ? friendlyError(err) : null);
    } finally {
      runningRef.current = false;
      setSyncing(false);
      if (pendingRef.current && current()) {
        pendingRef.current = false;
        setTick((t) => t + 1);
      }
    }
  }, []);

  const connect = useCallback(() => {
    setEnabled(true);
    saveEnabled(true);
    setState("checking");
  }, []);

  const disconnect = useCallback(() => {
    genRef.current += 1; // anything still in flight is now stale
    pendingRef.current = false;
    setEnabled(false);
    saveEnabled(false);
    setState("off");
    setDue(null);
    setError(null);
  }, []);

  // "Try again": shows "checking" while it runs.
  const check = useCallback(async () => {
    const gen = genRef.current;
    setState("checking");
    const ok = await probeConnection();
    if (gen !== genRef.current) return;
    setState(ok ? "connected" : "unreachable");
    if (ok) setTick((t) => t + 1);
  }, []);

  // On load and on (re)connect, and whenever the tab regains focus -- the
  // user may just have finished a review session in Anki.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const run = () =>
      probeConnection().then((ok) => {
        if (cancelled) return;
        setState(ok ? "connected" : "unreachable");
        if (ok) setTick((t) => t + 1);
      });
    run();
    window.addEventListener("focus", run);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
    };
  }, [enabled]);

  // The one place syncs start: debounced, whenever something that affects
  // what Anki should hold changes -- including a bookmark's tags and where
  // it was found, both of which change its card's tags.
  const bookmarkKey = bookmarks
    .map((b) => `${b.item_id}#${b.found_from ?? ""}#${userTagsFor(b.item_id).join(",")}`)
    .join("|");
  const graphKey = graphWords.join("|");
  useEffect(() => {
    if (!enabled || state !== "connected" || dataset.loading) return undefined;
    const t = setTimeout(sync, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, state, bookmarkKey, graphKey, tick, dataset.loading, sync]);

  // A failing Review/Open-in-Anki isn't necessarily "Anki is gone" -- check
  // before saying so, and otherwise show what actually went wrong.
  const guard = useCallback(async (action) => {
    try {
      await action();
    } catch (err) {
      const reachable = await probeConnection();
      if (reachable) setError(friendlyError(err));
      else setState("unreachable");
    }
  }, []);
  const review = useCallback(() => guard(openReview), [guard]);
  const browse = useCallback((query) => guard(() => openBrowser(query)), [guard]);
  const syncNow = useCallback(() => setTick((t) => t + 1), []);

  return { enabled, state, due, lastSynced, error, syncing, connect, disconnect, check, syncNow, review, browse };
}
