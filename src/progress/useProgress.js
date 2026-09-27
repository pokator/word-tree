import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabaseClient";
import { loadGuestProgress as loadGuestMap, saveGuestProgress as saveGuestMap } from "../lib/guestStore";

const key = (type, id) => `${type}:${id}`;

/**
 * Tri-state (new/learning/known) mastery tracking per word/kanji.
 * Logged in: backed by Supabase's `user_progress` table.
 * Guest/logged-out: identical Map-shaped API backed by localStorage, so
 * callers (DictionaryPanel, WordTreeGraph) never need to know which is active.
 * Signing in folds guest progress into the account before this loads (see
 * auth/mergeGuestData.js).
 */
export function useProgress() {
  const { user } = useAuth();
  const [map, setMap] = useState(() => (user ? new Map() : loadGuestMap()));
  const [syncedFor, setSyncedFor] = useState(user ? undefined : null);

  // Guest/logged-out is a synchronous localStorage read, so adjust state
  // directly during render (React's documented pattern for "reset state
  // when an input changes") rather than via an effect -- this also covers
  // sign-out, since `user` flips back to null and `syncedFor` still holds
  // the previous user's id.
  if (!user && syncedFor !== null) {
    setSyncedFor(null);
    setMap(loadGuestMap());
  }
  // `loading` is derived rather than stored: true exactly while logged in
  // but the Supabase fetch below hasn't resolved for this user yet.
  const loading = Boolean(user) && syncedFor !== user.id;

  useEffect(() => {
    if (!user) return; // guest path handled synchronously above
    let cancelled = false;
    supabase
      .from("user_progress")
      .select("item_type, item_id, status")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        const next = new Map();
        if (!error && data) {
          for (const row of data) next.set(key(row.item_type, row.item_id), row.status);
        }
        setMap(next);
        setSyncedFor(user.id);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const getStatus = useCallback((type, id) => map.get(key(type, id)), [map]);

  const setStatus = useCallback(
    (type, id, status) => {
      setMap((prev) => {
        const next = new Map(prev);
        next.set(key(type, id), status);
        if (!user) saveGuestMap(next);
        return next;
      });
      if (user) {
        supabase
          .from("user_progress")
          .upsert(
            { user_id: user.id, item_type: type, item_id: id, status, updated_at: new Date().toISOString() },
            { onConflict: "user_id,item_type,item_id" }
          )
          .then(({ error }) => {
            if (error) console.error("Failed to save progress:", error.message);
          });
      }
    },
    [user]
  );

  // Many statuses at once -- what an Anki sync pulls back (see
  // anki/useAnkiSync.js). Writes only the ones that actually changed, in
  // one upsert, rather than a request per word. `entries`: Map or iterable
  // of [key "type:id", status].
  const applyStatuses = useCallback(
    (entries) => {
      // Diffed against the latest map via the ref, not inside a setMap
      // updater -- React may run updaters later, and the Supabase write
      // below needs the list of changes now.
      const prev = mapRef.current;
      const changed = [];
      let next = null;
      for (const [k, status] of entries) {
        if (prev.get(k) === status) continue;
        next ??= new Map(prev);
        next.set(k, status);
        changed.push([k, status]);
      }
      if (!next) return;
      mapRef.current = next;
      setMap(next);
      if (!user) saveGuestMap(next);
      if (user) {
        const now = new Date().toISOString();
        supabase
          .from("user_progress")
          .upsert(
            changed.map(([k, status]) => {
              const sep = k.indexOf(":");
              return { user_id: user.id, item_type: k.slice(0, sep), item_id: k.slice(sep + 1), status, updated_at: now };
            }),
            { onConflict: "user_id,item_type,item_id" }
          )
          .then(({ error }) => {
            if (error) console.error("Failed to save synced progress:", error.message);
          });
      }
    },
    [user]
  );

  // Word-only mastery counts + membership (kanji aren't part of the "words
  // learned" story this stat is telling) -- used by the header's progress
  // bar and the "Review" entry point (its pool is every word marked New or
  // Learning).
  const wordsByStatus = useMemo(() => {
    const buckets = { new: [], learning: [], known: [] };
    for (const [k, status] of map) {
      if (k.startsWith("word:") && buckets[status]) buckets[status].push(k.slice("word:".length));
    }
    return buckets;
  }, [map]);

  const wordStats = useMemo(
    () => ({
      new: wordsByStatus.new.length,
      learning: wordsByStatus.learning.length,
      known: wordsByStatus.known.length,
      total: wordsByStatus.new.length + wordsByStatus.learning.length + wordsByStatus.known.length,
    }),
    [wordsByStatus]
  );

  return { getStatus, setStatus, applyStatuses, loading, wordStats, wordsByStatus };
}
