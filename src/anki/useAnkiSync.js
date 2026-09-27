import { useCallback, useEffect, useRef, useState } from "react";
import { probeConnection } from "./ankiConnect";
import { dueCount, openBrowser, openReview, pullStatuses, pushBookmarks, syncItemsFor } from "./ankiSync";

const ENABLED_KEY = "word-tree:anki-enabled";
// Coalesces bursts (several bookmarks in a row) into one round of calls.
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
  if (err?.name === "AbortError") return "Anki took too long to respond. Try Sync in a moment.";
  return err?.message || "Something went wrong talking to Anki.";
}

/**
 * Keeps Anki in step with your bookmarks: bookmarked words go out as cards
 * (pushBookmarks), and their study status comes back (pullStatuses ->
 * applyStatuses, which also saves it to the account so phones see it),
 * plus today's review count.
 *
 * Anki is only touched when something that belongs in it changes:
 *  - you connect (existing bookmarks go out),
 *  - your bookmarks change -- a word added, or a bookmark's tags,
 *  - you press Sync.
 * Never on page load, tab focus, or exploring the graph -- clicking around
 * the graph is discovery, and shouldn't make Anki churn. (On load the
 * connection is only probed, so the Bookmarks panel can show it.)
 *
 * Opt-in by design: nothing talks to Anki until the user presses "Connect"
 * once (then remembered per browser). On Chrome/Edge 142+ the first request
 * to 127.0.0.1 raises a "local network access" permission prompt -- that
 * must only ever appear because someone asked to connect.
 *
 * A change that lands while a sync is running queues exactly one more;
 * Disconnect invalidates any sync in flight (via the generation counter)
 * so it can't flip the state back.
 *
 * `state`: "off" (never connected) | "checking" | "connected" |
 * "unreachable" (Anki closed, AnkiConnect missing, CORS not set up, or the
 * browser permission denied -- indistinguishable from the page).
 */
export function useAnkiSync({ dataset, bookmarks, bookmarksLoading = false, userTagsFor, statusFor, applyStatuses }) {
  const [enabled, setEnabled] = useState(loadEnabled);
  const [state, setState] = useState(() => (loadEnabled() ? "checking" : "off"));
  const [due, setDue] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  // Bumped to ask for a sync (Connect, Try again, Sync, a queued follow-up).
  const [tick, setTick] = useState(0);

  // Latest inputs, read by the (debounced, async) sync without re-creating
  // it -- and so re-scheduling it -- on every render.
  const inputsRef = useRef(null);
  useEffect(() => {
    inputsRef.current = { dataset, bookmarks, userTagsFor, statusFor, applyStatuses };
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
      const { dataset: ds, bookmarks: bm, userTagsFor: tagsFor, statusFor: known, applyStatuses: apply } = inputs;
      // Status first: it also tells us which bookmarks shouldn't get a Moto
      // card -- ones already studied in another deck (no duplicate card),
      // and ones the user marked "I already know this" that Anki has never
      // seen.
      const { statuses, foreign } = await pullStatuses(bm.map((b) => b.item_id));
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

  const connect = useCallback(async () => {
    const gen = genRef.current;
    setEnabled(true);
    saveEnabled(true);
    setState("checking");
    const ok = await probeConnection();
    if (gen !== genRef.current) return;
    setState(ok ? "connected" : "unreachable");
    if (ok) setTick((t) => t + 1); // send the bookmarks you already have
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

  // "Try again" after Anki was unreachable, and the Sync button.
  const check = connect;
  const syncNow = useCallback(() => setTick((t) => t + 1), []);

  // Page load with Anki previously connected: probe only, so the panel can
  // show whether it's there -- no sync until something changes.
  useEffect(() => {
    if (!loadEnabled()) return undefined;
    let cancelled = false;
    probeConnection().then((ok) => {
      if (!cancelled) setState((s) => (s === "checking" ? (ok ? "connected" : "unreachable") : s));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The one place syncs start: when the bookmarks (or their tags) differ
  // from what was last sent, or a sync was asked for. The first settled
  // view after a page load is taken as the baseline rather than synced.
  const bookmarkKey = bookmarks
    .map((b) => `${b.item_id}#${b.found_from ?? ""}#${userTagsFor(b.item_id).join(",")}`)
    .join("|");
  const syncedKeyRef = useRef(null);
  const handledTickRef = useRef(0);
  useEffect(() => {
    if (!enabled || state !== "connected" || dataset.loading || bookmarksLoading) return undefined;
    const asked = tick !== handledTickRef.current;
    if (!asked && syncedKeyRef.current === null) {
      syncedKeyRef.current = bookmarkKey;
      return undefined;
    }
    if (!asked && bookmarkKey === syncedKeyRef.current) return undefined;
    const t = setTimeout(() => {
      handledTickRef.current = tick;
      syncedKeyRef.current = bookmarkKey;
      sync();
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, state, bookmarkKey, tick, dataset.loading, bookmarksLoading, sync]);

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

  return { enabled, state, due, lastSynced, error, syncing, connect, disconnect, check, syncNow, review, browse };
}
