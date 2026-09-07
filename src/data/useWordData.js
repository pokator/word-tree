import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { buildIndexes } from "./deriveIndexes";
import { KANJI as TINY_KANJI, WORDS as TINY_WORDS } from "./japaneseData";

// Bundled JMdict-derived dataset (~25k common words) + a trimmed KANJIDIC2
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
        const [kanjiRes, wordsRes] = await Promise.all([
          supabase.from("kanji").select("*"),
          supabase.from("words").select("*"),
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
