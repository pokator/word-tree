import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { buildIndexes } from "./deriveIndexes";
import { KANJI as FALLBACK_KANJI, WORDS as FALLBACK_WORDS } from "./japaneseData";

function fallbackDataset() {
  const { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI } = buildIndexes(FALLBACK_WORDS);
  return {
    KANJI: FALLBACK_KANJI,
    WORDS: FALLBACK_WORDS,
    WORDS_BY_TEXT,
    WORDS_CONTAINING_KANJI,
    source: "fallback",
    loading: false,
  };
}

/**
 * Loads kanji/words from Supabase when configured, falling back to the
 * static fixture (src/data/japaneseData.js) when it isn't configured or the
 * fetch fails -- so the app is never broken by a missing/misconfigured
 * backend, just less rich (no accounts, no persistence).
 */
export function useWordData() {
  const [dataset, setDataset] = useState(() =>
    isSupabaseConfigured ? { KANJI: {}, WORDS: [], WORDS_BY_TEXT: {}, WORDS_CONTAINING_KANJI: {}, source: "supabase", loading: true } : fallbackDataset()
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    async function load() {
      const [kanjiRes, wordsRes] = await Promise.all([
        supabase.from("kanji").select("*"),
        supabase.from("words").select("*"),
      ]);
      if (cancelled) return;

      if (kanjiRes.error || wordsRes.error || !kanjiRes.data?.length || !wordsRes.data?.length) {
        setDataset(fallbackDataset());
        return;
      }

      const KANJI = Object.fromEntries(kanjiRes.data.map((k) => [k.char, k]));
      const WORDS = wordsRes.data;
      const { WORDS_BY_TEXT, WORDS_CONTAINING_KANJI } = buildIndexes(WORDS);
      setDataset({ KANJI, WORDS, WORDS_BY_TEXT, WORDS_CONTAINING_KANJI, source: "supabase", loading: false });
    }

    load().catch(() => {
      if (!cancelled) setDataset(fallbackDataset());
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return dataset;
}
