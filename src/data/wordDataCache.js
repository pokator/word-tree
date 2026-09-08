// A local IndexedDB cache of the Supabase-fetched kanji/words dataset.
// Fetching ~228k words (~50MB) via ~230 paginated requests takes real
// seconds no matter how well-tuned the pagination is -- caching it means
// that cost is paid once per data change, not once per visit. Validity is
// just "do the row counts still match" (two cheap `head: true` requests)
// rather than anything content-aware, so it won't catch an in-place edit
// that doesn't change row counts -- an acceptable tradeoff for how this
// dataset actually changes (bulk reseeds, not individual row edits).
const DB_NAME = "word-tree-cache";
const DB_VERSION = 1;
const STORE_NAME = "dataset";
const CACHE_KEY = "supabase-dataset";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** { kanjiCount, wordsCount, KANJI, WORDS } | null on any failure/miss. */
export async function readDatasetCache() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function writeDatasetCache(entry) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry, CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable, quota exceeded, private-browsing restrictions,
    // etc. -- caching is a pure speed optimization, never a requirement,
    // so a failed write just means next visit re-fetches like today.
  }
}
