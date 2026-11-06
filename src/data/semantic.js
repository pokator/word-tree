// Lazy loader for meaning mode and the Commonness dial: chiVe frequencies
// (public/data/frequency.gzjson, ~0.7MB) and semantic neighbours
// (public/data/semantic/NNNN.gzbin, 1024 shards of ~6KB), both written by
// scripts/semantic/build_neighbours.py. Nothing here is fetched until
// someone opens meaning mode or moves the dial, so first visits are
// unchanged; a shard is fetched only when a word in it is needed.
//
// Everything is cached for the page's lifetime and read synchronously once
// loaded (freqOf, neighboursOf) so the pure graph functions in
// graph/buildGraph.js can stay synchronous and replayable.

export const SHARDS = 1024;

/** FNV-1a over code points; must match shard_of in build_neighbours.py. */
export function shardOf(word) {
  let h = 0x811c9dc5;
  for (const ch of word) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SHARDS;
}

const shardPath = (n) => `data/semantic/${String(n).padStart(4, "0")}.gzbin`;

async function gunzip(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return new Response(res.body.pipeThrough(new DecompressionStream("gzip")));
}
const fetchGzippedJson = async (url) => (await gunzip(url)).json();
const fetchGzippedBytes = async (url) => new Uint8Array(await (await gunzip(url)).arrayBuffer());

/**
 * A shard's words and their neighbours, as Map(word -> [[word, similarity*100], ...]).
 * Rows are varint word id, varint count, then count of (varint word id, one
 * similarity byte). An id is a position in `vocab`, frequency.gzjson's keys in
 * file order. Words with no neighbours have no row.
 */
export function decodeShard(bytes, vocab) {
  let at = 0;
  const varint = () => {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = bytes[at++];
      value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
  };
  const rows = new Map();
  while (at < bytes.length) {
    const word = vocab[varint()];
    const list = new Array(varint());
    for (let i = 0; i < list.length; i++) {
      const neighbour = vocab[varint()];
      list[i] = [neighbour, bytes[at++]];
    }
    rows.set(word, list);
  }
  return rows;
}

/**
 * One store per page. `bases` are tried in order (the CDN, then our own
 * origin), same as the dictionary itself (see datasetWorker.js).
 * `fetchJson` and `fetchBytes` are injectable for tests.
 */
export function createSemanticStore({
  bases = ["/"],
  fetchJson = fetchGzippedJson,
  fetchBytes = fetchGzippedBytes,
} = {}) {
  let frequency = null;
  let vocab = null;
  let frequencyPromise = null;
  const shards = new Map(); // n -> decoded rows, once loaded
  const pending = new Map(); // n -> promise

  async function fetchFirst(path, fetcher) {
    let lastErr;
    for (const base of bases) {
      try {
        return await fetcher(`${base}${path}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  function loadFrequency() {
    if (frequency) return Promise.resolve();
    frequencyPromise ??= fetchFirst("data/frequency.gzjson", fetchJson).then(
      (f) => {
        frequency = f;
        vocab = Object.keys(f);
      },
      (err) => {
        frequencyPromise = null; // let a later call retry
        throw err;
      }
    );
    return frequencyPromise;
  }

  function loadShard(n) {
    if (shards.has(n)) return Promise.resolve();
    if (!pending.has(n)) {
      pending.set(
        n,
        // A shard names words by their place in the frequency file.
        Promise.all([fetchFirst(shardPath(n), fetchBytes), loadFrequency()]).then(
          ([bytes]) => {
            shards.set(n, decodeShard(bytes, vocab));
            pending.delete(n);
          },
          (err) => {
            pending.delete(n);
            throw err;
          }
        )
      );
    }
    return pending.get(n);
  }

  const store = {
    /** chiVe frequency index, or undefined (unknown word, or not loaded). */
    freqOf: (word) => frequency?.[word],
    hasFrequency: () => frequency !== null,
    /**
     * Whether `word` has neighbours (needs frequency). Every word chiVe knows
     * has a list, but a few are empty, which only its shard can tell; until
     * that loads, the word is assumed to have some.
     */
    hasNeighbours: (word) => {
      if (frequency?.[word] == null) return false;
      const s = shards.get(shardOf(word));
      return !s || s.has(word);
    },
    /** [[word, similarity*100], ...] once its shard is loaded; [] for a
     * loaded shard without it; undefined while unloaded. */
    neighboursOf: (word) => {
      const s = shards.get(shardOf(word));
      return s ? (s.get(word) ?? []) : undefined;
    },
    isLoaded: (words = []) => frequency !== null && words.every((w) => shards.has(shardOf(w))),
    /** Resolves once frequency and every listed word's shard are cached. */
    load: (words = []) => Promise.all([loadFrequency(), ...[...new Set(words.map(shardOf))].map(loadShard)]),
  };
  return store;
}
