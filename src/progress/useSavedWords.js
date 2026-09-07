import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabaseClient";

/**
 * The Anki export queue: words the user has marked "of interest". Unlike
 * mastery, this is Supabase-only (no guest/localStorage variant) -- its
 * whole point is surviving until the user gets around to opening Anki, so
 * there's no value in an ephemeral local copy. Logged-out users simply
 * can't save words (see DictionaryPanel's "Sign in to save words" hint).
 */
export function useSavedWords() {
  const { user } = useAuth();
  const [words, setWords] = useState([]); // [{ item_id, exported_at }]
  const [syncedFor, setSyncedFor] = useState(null);

  // Sign-out: reset synchronously during render (React's documented
  // pattern for "reset state when an input changes") rather than in an
  // effect. Already correct on initial mount, since both states start at
  // their logged-out defaults.
  if (!user && syncedFor !== null) {
    setWords([]);
    setSyncedFor(null);
  }

  useEffect(() => {
    if (!user) return; // logged-out path handled synchronously above
    let cancelled = false;
    supabase
      .from("saved_items")
      .select("item_id, exported_at")
      .eq("user_id", user.id)
      .eq("item_type", "word")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setWords(data);
        setSyncedFor(user.id);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isSaved = useCallback((word) => words.some((w) => w.item_id === word), [words]);

  const toggleSave = useCallback(
    (word) => {
      if (!user) return;
      const alreadySaved = words.some((w) => w.item_id === word);
      if (alreadySaved) {
        setWords((prev) => prev.filter((w) => w.item_id !== word));
        supabase
          .from("saved_items")
          .delete()
          .eq("user_id", user.id)
          .eq("item_type", "word")
          .eq("item_id", word)
          .then(({ error }) => {
            if (error) console.error("Failed to unsave word:", error.message);
          });
      } else {
        setWords((prev) => [...prev, { item_id: word, exported_at: null }]);
        supabase
          .from("saved_items")
          .upsert(
            { user_id: user.id, item_type: "word", item_id: word },
            { onConflict: "user_id,item_type,item_id" }
          )
          .then(({ error }) => {
            if (error) console.error("Failed to save word:", error.message);
          });
      }
    },
    [user, words]
  );

  const markExported = useCallback(
    (wordList) => {
      if (!user || wordList.length === 0) return;
      const now = new Date().toISOString();
      setWords((prev) => prev.map((w) => (wordList.includes(w.item_id) ? { ...w, exported_at: now } : w)));
      supabase
        .from("saved_items")
        .update({ exported_at: now })
        .eq("user_id", user.id)
        .eq("item_type", "word")
        .in("item_id", wordList)
        .then(({ error }) => {
          if (error) console.error("Failed to mark words exported:", error.message);
        });
    },
    [user]
  );

  return { words, isSaved, toggleSave, markExported, loading: Boolean(user) && syncedFor !== user.id };
}
