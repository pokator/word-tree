import { useEffect, useState } from "react";
import { buildIndexes } from "./deriveIndexes";
import { KANJI as TINY_KANJI, WORDS as TINY_WORDS } from "./japaneseData";

function tinyFallbackDataset() {
  const { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI } = buildIndexes(TINY_WORDS);
  return {
    KANJI: TINY_KANJI,
    WORDS: TINY_WORDS,
    WORDS_BY_TEXT,
    WORDS_CONTAINING_KANJI,
    source: "tiny-fallback",
    loading: false,
  };
}

/**
 * Loads the bundled JMdict-derived dataset (~228k words) plus a trimmed
 * KANJIDIC2 reference (~13k kanji) -- see data/offline-dataset/README.md for
 * provenance -- from the static gzip-compressed copies in public/data/,
 * falling back to the tiny in-repo fixture (src/data/japaneseData.js) only
 * if that somehow fails.
 *
 * The dictionary is deliberately *not* read from Supabase, even when
 * Supabase is configured. PostgREST caps a response at 1000 rows, so a
 * 228k-row table meant ~230 paginated requests before the app could render
 * anything -- roughly 15 seconds. Two CDN-cacheable static files are an
 * order of magnitude faster, and the data is identical (supabase/seed.sql
 * is generated from the same JSON). Supabase still backs everything that's
 * genuinely per-user and live: auth, saved words, mastery progress, groups.
 *
 * Fetch, decompress, parse and index all happen in a worker (see
 * datasetWorker.js), so that work never blocks the main thread.
 */
export function useWordData() {
  const [dataset, setDataset] = useState({
    KANJI: {},
    WORDS: [],
    WORDS_BY_TEXT: {},
    WORDS_CONTAINING_KANJI: {},
    source: "local",
    loading: true,
  });

  useEffect(() => {
    const worker = new Worker(new URL("./datasetWorker.js", import.meta.url), { type: "module" });
    let done = false;

    function finish(next) {
      done = true;
      worker.terminate();
      setDataset(next);
    }

    worker.addEventListener("message", ({ data }) => {
      if (!data?.ok) {
        console.error("word-tree: dataset worker reported a failure, falling back to the tiny demo fixture:", data?.error);
        finish(tinyFallbackDataset());
        return;
      }
      finish({
        KANJI: data.KANJI,
        WORDS: data.WORDS,
        WORDS_BY_TEXT: data.WORDS_BY_TEXT,
        WORDS_CONTAINING_KANJI: data.WORDS_CONTAINING_KANJI,
        source: "local",
        loading: false,
      });
    });
    worker.addEventListener("error", (event) => {
      console.error("word-tree: dataset worker crashed, falling back to the tiny demo fixture:", event.message ?? event);
      finish(tinyFallbackDataset());
    });

    worker.postMessage({ baseUrl: import.meta.env.BASE_URL });

    // React StrictMode double-invokes effects in development; the discarded
    // first worker has to be torn down or it keeps decompressing 8.5MB in
    // the background for nothing.
    return () => {
      if (!done) worker.terminate();
    };
  }, []);

  return dataset;
}
