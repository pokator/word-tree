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

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal });
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
//
// `.range()` pagination is only guaranteed gap-free and non-overlapping
// when the query has a deterministic `.order()` -- without one, Postgres
// is free to return rows in a different physical order across separate
// requests (query plan choice, concurrent autovacuum, etc.), which can
// silently duplicate some rows across two pages while dropping others.
// That's an intermittent bug, not a hypothetical one: it showed up here as
// a duplicate word surfacing a "two children with the same key" React
// warning -- made easy to trigger by React StrictMode's dev-mode double
// effect invocation (see useWordData below) doubling concurrent load
// against the same tables. `orderColumn` should always be the table's
// primary key so the order is also unique (an order on a non-unique
// column can still tie and drift between requests). The post-fetch dedup
// below is a second, independent line of defense against the same
// failure mode.
const SUPABASE_PAGE_SIZE = 1000;
const PAGE_FETCH_CONCURRENCY = 8;

async function fetchAllRows(table, orderColumn, signal) {
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .abortSignal(signal);
  if (countError) return { data: null, error: countError };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / SUPABASE_PAGE_SIZE));
  const rows = [];
  for (let batchStart = 0; batchStart < totalPages; batchStart += PAGE_FETCH_CONCURRENCY) {
    const batchPages = [];
    for (let page = batchStart; page < Math.min(batchStart + PAGE_FETCH_CONCURRENCY, totalPages); page++) {
      const from = page * SUPABASE_PAGE_SIZE;
      batchPages.push(
        supabase.from(table).select("*").order(orderColumn).range(from, from + SUPABASE_PAGE_SIZE - 1).abortSignal(signal)
      );
    }
    const batchResults = await Promise.all(batchPages);
    for (const { data, error } of batchResults) {
      if (error) return { data: null, error };
      rows.push(...data);
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = row[orderColumn];
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return { data: deduped, error: null };
}

async function loadLocalDataset(signal) {
  const [KANJI, WORDS] = await Promise.all([fetchJson(LOCAL_KANJI_URL, signal), fetchJson(LOCAL_WORDS_URL, signal)]);
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
    // React StrictMode deliberately double-invokes effects in development
    // (mount -> cleanup -> mount again) to surface exactly this kind of
    // bug. Without aborting it, the discarded first invocation's ~230
    // paginated Supabase requests keep running in the background purely
    // wasted, doubling load against the same tables the real invocation is
    // also paginating -- see the note on fetchAllRows above.
    const controller = new AbortController();

    async function load() {
      if (isSupabaseConfigured) {
        const [kanjiRes, wordsRes] = await Promise.all([
          fetchAllRows("kanji", "char", controller.signal),
          fetchAllRows("words", "word", controller.signal),
        ]);
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
        const local = await loadLocalDataset(controller.signal);
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
      controller.abort();
    };
  }, []);

  return dataset;
}
