import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { extractKanjiComponents } from "../graph/kanji";

const EMPTY = { word: null, entry: null, kanjiByChar: {} };

/**
 * Fast, single-word lookup used to render the Dictionary panel before the
 * full ~228k-word dataset (see useWordData.js) has finished loading -- one
 * `.eq()` row fetch plus a small `.in()` kanji fetch, instead of the ~230
 * paginated requests the full dataset needs. Pass `null` for `word` (e.g.
 * once the full dataset is ready, so this stops being needed) to stop
 * fetching -- its last result is simply left stale and unused by then.
 *
 * No-ops (never fetches, `loading` stays false) when Supabase isn't
 * configured, since the local-dataset fallback has no per-word query to
 * make -- it's a couple of JSON file fetches that are already fast enough
 * not to need this.
 *
 * `loading` is derived by comparing `word` against the word the last
 * *completed* fetch was for, rather than tracked as separate state, so a
 * fresh request for a new word reads as "loading" the instant `word`
 * changes -- no intermediate render with the previous word's stale result.
 */
export function useQuickEntry(word) {
  const [result, setResult] = useState(EMPTY);

  useEffect(() => {
    if (!word || !isSupabaseConfigured) return;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      const components = extractKanjiComponents(word);
      const [wordRes, kanjiRes] = await Promise.all([
        supabase.from("words").select("*").eq("word", word).limit(1).abortSignal(controller.signal),
        components.length
          ? supabase.from("kanji").select("*").in("char", components).abortSignal(controller.signal)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const kanjiByChar = Object.fromEntries((kanjiRes.data ?? []).map((k) => [k.char, k]));
      setResult({ word, entry: wordRes.data?.[0] ?? null, kanjiByChar });
    }

    load().catch(() => {
      if (!cancelled) setResult({ word, entry: null, kanjiByChar: {} });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [word]);

  const isStale = result.word !== word;
  return {
    entry: isStale ? null : result.entry,
    kanjiByChar: isStale ? {} : result.kanjiByChar,
    loading: Boolean(word) && isSupabaseConfigured && isStale,
  };
}
