import { buildIndexes } from "./deriveIndexes";

// Decompressing ~8.5MB of gzip into ~52MB of JSON and indexing 228k words is
// real CPU time -- on the main thread that's a frozen UI, so it all happens
// here instead and only the finished structures cross back over.
//
// ".gzjson", not ".gz": a plain ".gz" extension gets auto-decompressed in
// flight by some static hosts (Content-Encoding: gzip), which would make
// `fetch()` hand us already-decompressed bytes and break the explicit
// DecompressionStream below. See scripts/compress-offline-dataset.mjs.
//
// This dictionary is now on the critical path for every user (there's no
// slower-but-guaranteed Supabase path behind it anymore), so a stalled
// request should fail into the tiny fallback fixture rather than hang
// `dataset.loading` forever.
const FETCH_TIMEOUT_MS = 20_000;

async function fetchGzippedJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).json();
}

// One-shot: the caller posts the app's base URL (worker bundles live under
// the build's asset directory, so `self.location` can't be used to derive
// where `public/` landed) and gets exactly one reply back.
self.addEventListener("message", async ({ data }) => {
  const baseUrl = data?.baseUrl ?? "/";
  try {
    const [KANJI, WORDS] = await Promise.all([
      fetchGzippedJson(`${baseUrl}data/kanji.gzjson`),
      fetchGzippedJson(`${baseUrl}data/words.gzjson`),
    ]);
    const { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI } = buildIndexes(WORDS);
    // Posting all four structures in a single message is load-bearing:
    // structured clone preserves object identity within one message, so
    // WORDS_BY_TEXT's values are the *same* objects as WORDS's entries
    // instead of duplicating all 228k of them. Splitting this into separate
    // postMessage calls would silently double memory.
    self.postMessage({ ok: true, KANJI, WORDS, WORDS_BY_TEXT, WORDS_CONTAINING_KANJI });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
});
