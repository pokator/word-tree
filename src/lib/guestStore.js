// Everything a signed-out ("guest") user builds up, kept in localStorage:
// mastery progress, bookmarks, and groups. The hooks that own each piece
// (progress/useProgress.js, progress/useSavedWords.js, groups/useGroups.js)
// read and write through here, and so does auth/mergeGuestData.js, which
// folds all three into the account on sign-in -- one place for the keys
// and shapes means those can't drift apart.

export const GUEST_PROGRESS_KEY = "word-tree:guest-progress"; // { "type:id": status }
export const GUEST_BOOKMARKS_KEY = "word-tree:guest-bookmarks"; // [{ item_id, exported_at }]
export const GUEST_GROUPS_KEY = "word-tree:guest-groups"; // [{ id, name, words: string[] }]

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable -- guest data just won't persist this session
  }
}

export function loadGuestProgress() {
  return new Map(Object.entries(read(GUEST_PROGRESS_KEY, {})));
}
export function saveGuestProgress(map) {
  write(GUEST_PROGRESS_KEY, Object.fromEntries(map));
}

export function loadGuestBookmarks() {
  const list = read(GUEST_BOOKMARKS_KEY, []);
  return Array.isArray(list) ? list : [];
}
export function saveGuestBookmarks(list) {
  write(GUEST_BOOKMARKS_KEY, list);
}

export function loadGuestGroups() {
  const list = read(GUEST_GROUPS_KEY, []);
  return Array.isArray(list) ? list : [];
}
export function saveGuestGroups(list) {
  write(GUEST_GROUPS_KEY, list);
}

export function clearGuestData() {
  try {
    localStorage.removeItem(GUEST_PROGRESS_KEY);
    localStorage.removeItem(GUEST_BOOKMARKS_KEY);
    localStorage.removeItem(GUEST_GROUPS_KEY);
  } catch {
    // nothing to clear
  }
}
