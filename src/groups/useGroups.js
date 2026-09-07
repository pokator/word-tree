import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabaseClient";

const GUEST_KEY = "word-tree:guest-groups";

function loadGuestGroups() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGuestGroups(groups) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(groups));
  } catch {
    // localStorage unavailable -- groups just won't persist this session
  }
}

function guestId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `g${Date.now()}${Math.random()}`;
}

/**
 * User-created word collections ("groups") -- e.g. "JLPT N4 review". A word
 * can belong to any number of a user's groups, independent of mastery
 * status or the Anki save queue. Shape: [{ id, name, words: string[] }].
 * Logged in: backed by Supabase's `groups`/`group_words` tables.
 * Guest/logged-out: identical array-shaped API backed by localStorage, so
 * callers (GroupsPanel, DictionaryPanel) never need to know which is active --
 * same pattern as progress/useProgress.js.
 */
export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState(() => (user ? [] : loadGuestGroups()));
  const [syncedFor, setSyncedFor] = useState(user ? undefined : null);

  if (!user && syncedFor !== null) {
    setSyncedFor(null);
    setGroups(loadGuestGroups());
  }
  const loading = Boolean(user) && syncedFor !== user.id;

  useEffect(() => {
    if (!user) return; // guest path handled synchronously above
    let cancelled = false;
    async function load() {
      const { data: groupRows, error: groupsErr } = await supabase
        .from("groups")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (groupsErr || !groupRows) {
        setGroups([]);
        setSyncedFor(user.id);
        return;
      }
      const ids = groupRows.map((g) => g.id);
      let wordRows = [];
      if (ids.length > 0) {
        const { data } = await supabase.from("group_words").select("group_id, word").in("group_id", ids);
        wordRows = data ?? [];
      }
      if (cancelled) return;
      const next = groupRows.map((g) => ({
        id: g.id,
        name: g.name,
        words: wordRows.filter((w) => w.group_id === g.id).map((w) => w.word),
      }));
      setGroups(next);
      setSyncedFor(user.id);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistGuest = useCallback(
    (next) => {
      if (!user) saveGuestGroups(next);
    },
    [user]
  );

  const createGroup = useCallback(
    (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (!user) {
        setGroups((prev) => {
          if (prev.some((g) => g.name === trimmed)) return prev;
          const next = [...prev, { id: guestId(), name: trimmed, words: [] }];
          persistGuest(next);
          return next;
        });
        return;
      }
      supabase
        .from("groups")
        .insert({ user_id: user.id, name: trimmed })
        .select("id, name")
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Failed to create group:", error.message);
            return;
          }
          setGroups((prev) => [...prev, { id: data.id, name: data.name, words: [] }]);
        });
    },
    [user, persistGuest]
  );

  const renameGroup = useCallback(
    (groupId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setGroups((prev) => {
        const next = prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g));
        persistGuest(next);
        return next;
      });
      if (user) {
        supabase
          .from("groups")
          .update({ name: trimmed })
          .eq("id", groupId)
          .then(({ error }) => {
            if (error) console.error("Failed to rename group:", error.message);
          });
      }
    },
    [user, persistGuest]
  );

  const deleteGroup = useCallback(
    (groupId) => {
      setGroups((prev) => {
        const next = prev.filter((g) => g.id !== groupId);
        persistGuest(next);
        return next;
      });
      if (user) {
        supabase
          .from("groups")
          .delete()
          .eq("id", groupId)
          .then(({ error }) => {
            if (error) console.error("Failed to delete group:", error.message);
          });
      }
    },
    [user, persistGuest]
  );

  const addWordToGroup = useCallback(
    (groupId, word) => {
      setGroups((prev) => {
        const next = prev.map((g) => (g.id === groupId && !g.words.includes(word) ? { ...g, words: [...g.words, word] } : g));
        persistGuest(next);
        return next;
      });
      if (user) {
        supabase
          .from("group_words")
          .upsert({ group_id: groupId, word }, { onConflict: "group_id,word" })
          .then(({ error }) => {
            if (error) console.error("Failed to add word to group:", error.message);
          });
      }
    },
    [user, persistGuest]
  );

  const removeWordFromGroup = useCallback(
    (groupId, word) => {
      setGroups((prev) => {
        const next = prev.map((g) => (g.id === groupId ? { ...g, words: g.words.filter((w) => w !== word) } : g));
        persistGuest(next);
        return next;
      });
      if (user) {
        supabase
          .from("group_words")
          .delete()
          .eq("group_id", groupId)
          .eq("word", word)
          .then(({ error }) => {
            if (error) console.error("Failed to remove word from group:", error.message);
          });
      }
    },
    [user, persistGuest]
  );

  const groupsForWord = useCallback((word) => groups.filter((g) => g.words.includes(word)), [groups]);

  return {
    groups,
    loading,
    createGroup,
    renameGroup,
    deleteGroup,
    addWordToGroup,
    removeWordFromGroup,
    groupsForWord,
  };
}
