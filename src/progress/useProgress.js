import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabaseClient";

const GUEST_KEY = "word-tree:guest-progress";
const key = (type, id) => `${type}:${id}`;

function loadGuestMap() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map();
  } catch {
    return new Map();
  }
}

function saveGuestMap(map) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // localStorage unavailable -- progress just won't persist this session
  }
}

/**
 * Tri-state (new/learning/known) mastery tracking per word/kanji.
 * Logged in: backed by Supabase's `user_progress` table.
 * Guest/logged-out: identical Map-shaped API backed by localStorage, so
 * callers (DetailPanel, WordTreeGraph) never need to know which is active.
 * No guest -> account migration in this phase -- signing in starts a fresh
 * (empty, then Supabase-loaded) progress map rather than merging the two.
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

  return { getStatus, setStatus, loading };
}
