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

// Loaders only ever hand back well-formed data -- anything else in storage
// (hand-edited, an older shape, a literal "null") is dropped rather than
// allowed to throw later inside the sign-in merge.
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function loadGuestProgress() {
  const raw = read(GUEST_PROGRESS_KEY, {});
  if (!isPlainObject(raw)) return new Map();
  return new Map(Object.entries(raw).filter(([k, v]) => k.includes(":") && typeof v === "string"));
}
export function saveGuestProgress(map) {
  write(GUEST_PROGRESS_KEY, Object.fromEntries(map));
}

export function loadGuestBookmarks() {
  const list = read(GUEST_BOOKMARKS_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((b) => b && typeof b.item_id === "string")
    .map((b) => ({ item_id: b.item_id, exported_at: b.exported_at ?? null }));
}
export function saveGuestBookmarks(list) {
  write(GUEST_BOOKMARKS_KEY, list);
}

export function loadGuestGroups() {
  const list = read(GUEST_GROUPS_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((g) => g && typeof g.name === "string")
    .map((g) => ({ ...g, words: Array.isArray(g.words) ? g.words.filter((w) => typeof w === "string") : [] }));
}
export function saveGuestGroups(list) {
  write(GUEST_GROUPS_KEY, list);
}

/**
 * Removes exactly what a merge copied into the account -- the snapshot it
 * started from -- and nothing written to the guest store since. (The app
 * stays in guest mode, and fully usable, for the length of the merge, so a
 * bookmark made mid-merge lands here after the snapshot was taken.)
 * Returns whether anything is left over, i.e. still needs merging.
 */
export function removeMergedGuestData(snapshot) {
  const mergedIds = new Set(snapshot.bookmarks.map((b) => b.item_id));
  const bookmarks = loadGuestBookmarks().filter((b) => !mergedIds.has(b.item_id));

  const progress = loadGuestProgress();
  for (const [k, status] of snapshot.progress) {
    if (progress.get(k) === status) progress.delete(k);
  }

  const mergedWordsByGroup = new Map(snapshot.groups.map((g) => [g.name, new Set(g.words)]));
  const groups = [];
  for (const g of loadGuestGroups()) {
    const merged = mergedWordsByGroup.get(g.name);
    if (!merged) {
      groups.push(g);
      continue;
    }
    const remaining = g.words.filter((w) => !merged.has(w));
    if (remaining.length > 0) groups.push({ ...g, words: remaining });
  }

  saveGuestBookmarks(bookmarks);
  saveGuestProgress(progress);
  saveGuestGroups(groups);
  return bookmarks.length > 0 || progress.size > 0 || groups.length > 0;
}
