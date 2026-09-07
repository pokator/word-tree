import { useCallback, useState } from "react";

const KEY = "word-tree:recent-roots";
const MAX_RECENTS = 8;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable -- history just won't persist this session
  }
}

/** Last few explored root words, most-recent-first, so returning to a
 * prior exploration is one click instead of retyping. Deliberately
 * localStorage-only (like theme/max-words) -- it's a per-device UI
 * convenience, not account data worth syncing. */
export function useRecentRoots() {
  const [recents, setRecents] = useState(load);

  const addRecent = useCallback((word) => {
    setRecents((prev) => {
      const next = [word, ...prev.filter((w) => w !== word)].slice(0, MAX_RECENTS);
      save(next);
      return next;
    });
  }, []);

  return { recents, addRecent };
}
