import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { buildIndexes } from "./deriveIndexes";
import { KANJI as TINY_KANJI, WORDS as TINY_WORDS } from "./japaneseData";

// Bundled JMdict-derived dataset (~228k words) + a trimmed KANJIDIC2
// reference (~13k kanji) -- see public/data/README.md for provenance. This
// is what makes "explore any word, not just the ~38-word demo fixture"
// work offline, with no account/backend required.
const LOCAL_KANJI_URL = `${import.meta.env.BASE_URL}data/kanji.json`;
const LOCAL_WORDS_URL = `${import.meta.env.BASE_URL}data/words.json`;

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

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

// PostgREST (Supabase's REST API) caps a single request at a server-side
// row limit (1000 by default) regardless of how many rows actually match --
// a plain `.select("*")` on a 228k-row table silently returns only the
// first page with no error, no warning, nothing to indicate the other
// ~227k rows were ever missing. Get the real count first (a `head: true`
// request has no body, so it's cheap), then fetch every `.range()` page
// this table needs -- in bounded-concurrency batches rather than one giant
// Promise.all, so a 228k-row table doesn't fire ~230 simultaneous requests
// at Supabase's connection pooler.
const SUPABASE_PAGE_SIZE = 1000;
const PAGE_FETCH_CONCURRENCY = 8;

async function fetchAllRows(table) {
  const { count, error: countError } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (countError) return { data: null, error: countError };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / SUPABASE_PAGE_SIZE));
  const rows = [];
  for (let batchStart = 0; batchStart < totalPages; batchStart += PAGE_FETCH_CONCURRENCY) {
    const batchPages = [];
    for (let page = batchStart; page < Math.min(batchStart + PAGE_FETCH_CONCURRENCY, totalPages); page++) {
      const from = page * SUPABASE_PAGE_SIZE;
      batchPages.push(supabase.from(table).select("*").range(from, from + SUPABASE_PAGE_SIZE - 1));
    }
    const batchResults = await Promise.all(batchPages);
    for (const { data, error } of batchResults) {
      if (error) return { data: null, error };
      rows.push(...data);
    }
  }
  return { data: rows, error: null };
}

async function loadLocalDataset() {
  const [KANJI, WORDS] = await Promise.all([fetchJson(LOCAL_KANJI_URL), fetchJson(LOCAL_WORDS_URL)]);
  const { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI } = buildIndexes(WORDS);
  return { KANJI, WORDS, WORDS_BY_TEXT, WORDS_CONTAINING_KANJI, source: "local", loading: false };
}

/**
 * Loads kanji/words from Supabase when configured, falling back to the
 * bundled local dataset (public/data/{kanji,words}.json) when it isn't
 * configured or the fetch fails, and to the tiny in-repo fixture
 * (src/data/japaneseData.js) only if even that local fetch somehow fails --
 * so the app is never broken by a missing/misconfigured backend, just less
 * rich (no accounts, no cross-device persistence).
 */
export function useWordData() {
  const [dataset, setDataset] = useState({
    KANJI: {},
    WORDS: [],
    WORDS_BY_TEXT: {},
    WORDS_CONTAINING_KANJI: {},
    source: isSupabaseConfigured ? "supabase" : "local",
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (isSupabaseConfigured) {
        const [kanjiRes, wordsRes] = await Promise.all([fetchAllRows("kanji"), fetchAllRows("words")]);
        if (cancelled) return;
        if (!kanjiRes.error && !wordsRes.error && kanjiRes.data?.length && wordsRes.data?.length) {
          const KANJI = Object.fromEntries(kanjiRes.data.map((k) => [k.char, k]));
          const WORDS = wordsRes.data;
          const { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI } = buildIndexes(WORDS);
          setDataset({ KANJI, WORDS, WORDS_BY_TEXT, WORDS_CONTAINING_KANJI, source: "supabase", loading: false });
          return;
        }
        // Configured but empty/erroring -- fall through to the local dataset.
      }

      try {
        const local = await loadLocalDataset();
        if (!cancelled) setDataset(local);
      } catch {
        if (!cancelled) setDataset(tinyFallbackDataset());
      }
    }

    load().catch(() => {
      if (!cancelled) setDataset(tinyFallbackDataset());
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return dataset;
}
