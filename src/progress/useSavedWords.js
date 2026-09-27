import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabaseClient";
import { loadGuestBookmarks, saveGuestBookmarks } from "../lib/guestStore";

/**
 * Bookmarks: the words the user wants to study (Anki export is one thing
 * you can do with them, not the reason the list exists). Same guest-first
 * shape as progress/useProgress.js and groups/useGroups.js -- logged out,
 * it's backed by localStorage so anyone can bookmark immediately; logged
 * in, by Supabase's `saved_items` table. Signing in folds the guest list
 * into the account first (see auth/mergeGuestData.js), so nothing
 * bookmarked before signing in is lost.
 * Shape: [{ item_id, exported_at }].
 */
export function useSavedWords() {
  const { user } = useAuth();
  const [words, setWords] = useState(() => (user ? [] : loadGuestBookmarks()));
  const [syncedFor, setSyncedFor] = useState(user ? undefined : null);

  // Signed out (including sign-out): a synchronous localStorage read, so
  // adjust state during render -- React's documented pattern for "reset
  // state when an input changes" -- rather than in an effect.
  if (!user && syncedFor !== null) {
    setSyncedFor(null);
    setWords(loadGuestBookmarks());
  }
  const loading = Boolean(user) && syncedFor !== user.id;

  useEffect(() => {
    if (!user) return; // guest path handled synchronously above
    let cancelled = false;
    supabase
      .from("saved_items")
      .select("item_id, exported_at")
      .eq("user_id", user.id)
      .eq("item_type", "word")
      .then(({ data, error }) => {
        if (cancelled) return;
        setWords(!error && data ? data : []);
        setSyncedFor(user.id);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback(
    (fn) => {
      setWords((prev) => {
        const next = fn(prev);
        if (!user) saveGuestBookmarks(next);
        return next;
      });
    },
    [user]
  );

  const isSaved = useCallback((word) => words.some((w) => w.item_id === word), [words]);

  const toggleSave = useCallback(
    (word) => {
      const alreadySaved = words.some((w) => w.item_id === word);
      if (alreadySaved) {
        update((prev) => prev.filter((w) => w.item_id !== word));
        if (user) {
          supabase
            .from("saved_items")
            .delete()
            .eq("user_id", user.id)
            .eq("item_type", "word")
            .eq("item_id", word)
            .then(({ error }) => {
              if (error) console.error("Failed to remove bookmark:", error.message);
            });
        }
      } else {
        update((prev) => [...prev, { item_id: word, exported_at: null }]);
        if (user) {
          supabase
            .from("saved_items")
            .upsert(
              { user_id: user.id, item_type: "word", item_id: word },
              { onConflict: "user_id,item_type,item_id" }
            )
            .then(({ error }) => {
              if (error) console.error("Failed to bookmark word:", error.message);
            });
        }
      }
    },
    [user, words, update]
  );

  const markExported = useCallback(
    (wordList) => {
      if (wordList.length === 0) return;
      const now = new Date().toISOString();
      update((prev) => prev.map((w) => (wordList.includes(w.item_id) ? { ...w, exported_at: now } : w)));
      if (user) {
        supabase
          .from("saved_items")
          .update({ exported_at: now })
          .eq("user_id", user.id)
          .eq("item_type", "word")
          .in("item_id", wordList)
          .then(({ error }) => {
            if (error) console.error("Failed to mark words exported:", error.message);
          });
      }
    },
    [user, update]
  );

  return { words, isSaved, toggleSave, markExported, loading };
}
