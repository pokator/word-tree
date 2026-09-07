# Bundled offline dataset

`words.json` and `kanji.json` are the offline/local dataset fetched by
`src/data/useWordData.js` when Supabase isn't configured (or its fetch
fails). They're also the source `scripts/generate-seed-sql.mjs` uses to
generate `supabase/seed.sql` — so the offline and Supabase-backed
experiences share the exact same data.

## Provenance

Both files were generated once, locally, from data used by this
developer's other project, Gakuji:

- **`words.json`** (~228.3k entries: `word`, `reading`, `meaning`, optional
  `rank`) -- essentially all of [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
  (via a local SQLite build, read through the actual [jamdict](https://github.com/neocl/jamdict)
  Python package's `Jamdict.get_entry()` API rather than hand-rolled SQL
  joins over its underlying tables -- an earlier version of this dataset
  did the latter and, in picking a single "best" kanji spelling per entry,
  silently dropped ~750 legitimate alternate spellings that ought to have
  been independently searchable): every entry with at least one English
  gloss. **Every valid kanji spelling of an entry becomes its own `word`
  row**, sharing that entry's reading/senses (e.g. 呼びかける, 呼び掛ける,
  and 呼掛ける are three separate entries) -- not collapsed to one
  representative spelling. If an entry has no kanji spelling at all,
  `word` is its kana form instead and `reading` is omitted (showing an
  identical reading line under an identical headword would be redundant).
  `meaning` joins every sense the entry has (capped at 10 senses, 2
  glosses each, for the rare entry with dozens), each sense separated by
  `; ` so the app's UI can render one numbered line per sense. `rank` is
  the lowest `nfXX` bucket (1-48, lower = more common) tagged on that
  specific spelling, `25` if it has a priority tag but no `nf` bucket, or
  omitted entirely if JMdict doesn't tag that spelling as common at all
  (the large majority) -- used only to decide which words show first when
  a kanji branch is capped by "words per branch"; an omitted `rank` sorts
  last. No `components` field is stored: a word's kanji are derived
  directly from its own text at runtime (see `src/graph/kanji.js`), so
  storing them separately would just be a redundant, driftable copy.
- **`kanji.json`** (~13.1k entries: `char`, `meaning`, `onyomi`, `kunyomi`,
  `jlpt`) -- trimmed from a [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)-derived
  reference (`meaning` joins up to 3 gloss words; `jlpt` is the modern
  5=N5..1=N1 scale, `null` when untagged). The source file also carried a
  parallel WaniKani-style leveling (level/meanings/readings/radical-group
  names); that's dropped here since it's a different pedagogical framework
  this app doesn't use.

## Regenerating

There's no repeatable, checked-in script for this (unlike
`generate-seed-sql.mjs`) because the source is a large, machine-specific
SQLite file (JMdict+KANJIDIC2 via `jamdict`, ~300MB) that isn't part of
this repo and wouldn't build the same way on every machine. If the data
ever needs refreshing, regenerate from a similar JMdict/KANJIDIC2 source
with the same shape -- read entries through `jamdict`'s own `Entry`/
`Sense`/kanji-form objects (`Jamdict.get_entry(idseq)`), not hand-rolled
joins over its underlying SQLite tables, and iterate every kanji form on
an entry rather than picking just one (see the multi-spelling note above):

- `words.json`: array of `{ word, reading, meaning, rank }`; `rank` may be
  omitted (treated as low priority / sorts last).
- `kanji.json`: object keyed by kanji character, each `{ char, meaning,
  onyomi: string[], kunyomi: string[], jlpt }`; `jlpt` may be omitted.

Then run `npm run generate:seed` to regenerate `supabase/seed.sql` from the
refreshed files, and re-run `supabase/schema.sql` + `supabase/seed.sql` in
the Supabase SQL editor (both idempotent/upserting).
