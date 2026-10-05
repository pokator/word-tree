import { restoreMeaning } from "./datasetFormat";
import { buildIndexes } from "./deriveIndexes";

// Decompressing ~7MB of gzip into ~52MB of JSON and indexing 228k words is
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

// Production builds serve these files from jsDelivr (see dataCdnBase in
// vite.config.js) so ~7MB per first visit doesn't count against Vercel's
// bandwidth quota. The same files ship on our own origin too, so if the CDN
// is down or blocked, the app still loads, just from Vercel.
async function fetchDataFile(name, bases) {
  let lastErr;
  for (const base of bases) {
    try {
      return await fetchGzippedJson(`${base}data/${name}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// One-shot: the caller posts the app's base URL (worker bundles live under
// the build's asset directory, so `self.location` can't be used to derive
// where `public/` landed) plus the CDN base, if any, and gets exactly one
// reply back.
self.addEventListener("message", async ({ data }) => {
  const baseUrl = data?.baseUrl ?? "/";
  const bases = data?.cdnBaseUrl ? [data.cdnBaseUrl, baseUrl] : [baseUrl];
  try {
    const [KANJI, WORDS] = await Promise.all([
      fetchDataFile("kanji.gzjson", bases),
      fetchDataFile("words.gzjson", bases),
    ]);
    WORDS.forEach(restoreMeaning);
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
