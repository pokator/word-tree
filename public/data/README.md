# Bundled offline dataset

`words.json` and `kanji.json` are the offline/local dataset fetched by
`src/data/useWordData.js` when Supabase isn't configured (or its fetch
fails). They're also the source `scripts/generate-seed-sql.mjs` uses to
generate `supabase/seed.sql` — so the offline and Supabase-backed
experiences share the exact same data.

## Provenance

Both files were generated once, locally, from data used by this
developer's other project, Gakuji:

- **`words.json`** (~25.7k entries: `word`, `reading`, `meaning`, `rank`) —
  every entry in a local [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
  SQLite build (via the [jamdict](https://github.com/neocl/jamdict) schema)
  that has at least one kanji-form priority tag (`news1/2`, `ichi1/2`,
  `spec1/2`, `gai1/2`, or `nf01`-`nf48`) -- i.e. JMdict's own notion of a
  "common" word. `reading` prefers a kana form that's itself tagged common;
  `meaning` is the first sense's first 1-3 English glosses. `rank` is the
  lowest `nfXX` bucket found (1-48, lower = more common) or `25` when the
  word has a priority tag but no `nf` bucket -- used to decide which words
  show first when a kanji branch is capped by the "max words per branch"
  setting. No `components` field is stored: a word's kanji are derived
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
with the same shape:

- `words.json`: array of `{ word, reading, meaning, rank }`; `rank` may be
  omitted (treated as low priority / sorts last).
- `kanji.json`: object keyed by kanji character, each `{ char, meaning,
  onyomi: string[], kunyomi: string[], jlpt }`; `jlpt` may be omitted.

Then run `npm run generate:seed` to regenerate `supabase/seed.sql` from the
refreshed files, and re-run `supabase/schema.sql` + `supabase/seed.sql` in
the Supabase SQL editor (both idempotent/upserting).
