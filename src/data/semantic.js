// Lazy loader for meaning mode and the Commonness dial: chiVe frequencies
// (public/data/frequency.gzjson, ~0.7MB) and semantic neighbours
// (public/data/semantic/NNN.gzjson, 128 shards of ~55KB), both written by
// scripts/semantic/build_neighbours.py. Nothing here is fetched until
// someone opens meaning mode or moves the dial, so first visits are
// unchanged; a shard is fetched only when a word in it is expanded.
//
// Everything is cached for the page's lifetime and read synchronously once
// loaded (freqOf, neighboursOf) so the pure graph functions in
// graph/buildGraph.js can stay synchronous and replayable.

export const SHARDS = 128;
// Mirrors ROOT_MAX_FREQ in build_neighbours.py: which words have a
// neighbour list at all.
const ROOT_MAX_FREQ = 60_000;

/** FNV-1a over code points; must match shard_of in build_neighbours.py. */
export function shardOf(word) {
  let h = 0x811c9dc5;
  for (const ch of word) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SHARDS;
}

const shardPath = (n) => `data/semantic/${String(n).padStart(3, "0")}.gzjson`;

async function fetchGzippedJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json();
}

/**
 * One store per page. `bases` are tried in order (the CDN, then our own
 * origin), same as the dictionary itself (see datasetWorker.js).
 * `fetchJson` is injectable for tests.
 */
export function createSemanticStore({ bases = ["/"], fetchJson = fetchGzippedJson } = {}) {
  let frequency = null;
  let frequencyPromise = null;
  const shards = new Map(); // n -> object, once loaded
  const pending = new Map(); // n -> promise

  async function fetchFirst(path) {
    let lastErr;
    for (const base of bases) {
      try {
        return await fetchJson(`${base}${path}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  function loadFrequency() {
    if (frequency) return Promise.resolve();
    frequencyPromise ??= fetchFirst("data/frequency.gzjson").then(
      (f) => {
        frequency = f;
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
        fetchFirst(shardPath(n)).then(
          (s) => {
            shards.set(n, s);
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
    /** Whether `word` has a neighbour list at all (needs frequency). */
    hasNeighbours: (word, rank) => {
      const f = frequency?.[word];
      return f != null && (rank != null || f < ROOT_MAX_FREQ);
    },
    /** [[word, similarity*100], ...] once its shard is loaded; [] for a
     * loaded shard without it; undefined while unloaded. */
    neighboursOf: (word) => {
      const s = shards.get(shardOf(word));
      return s ? (s[word] ?? []) : undefined;
    },
    isLoaded: (words = []) => frequency !== null && words.every((w) => shards.has(shardOf(w))),
    /** Resolves once frequency and every listed word's shard are cached. */
    load: (words = []) => Promise.all([loadFrequency(), ...[...new Set(words.map(shardOf))].map(loadShard)]),
  };
  return store;
}
