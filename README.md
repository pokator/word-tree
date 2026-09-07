# Word Tree (言葉の木)

An interactive, exploratory dictionary: start from **any** Japanese word,
and expand outward through the components it's built from (in Japanese,
kanji) to discover every other word in the dataset that shares a component
with it. The point is to make the *relatedness* of vocabulary visible and
explorable, and to turn that exploration into actual retention — mark what
you know, organize words into your own study groups, save words of
interest, and push them into Anki for spaced repetition.

This covers Japanese only. English (prefixes/suffixes/Latin & Greek roots)
is a natural next step but intentionally out of scope for now — see "Not in
scope" below.

## Setup

```bash
npm install
```

The app runs perfectly well with **no further setup** — it loads a bundled
~26k-word/13k-kanji dataset (see "The dataset" below) and works fully as a
guest (no accounts, no saved progress across devices). To get the full
experience (accounts, mastery tracking and groups that survive a refresh,
saved words), you need a Supabase project:

1. Create a free project at [supabase.com](https://supabase.com).
2. Open its SQL editor and run `supabase/schema.sql`, then
   `supabase/seed.sql`, in that order. Both are safe to re-run — if you set
   this up before this dataset/groups update, just re-run them both to pick
   up the larger word list and the new `groups` tables (nothing existing
   gets dropped; `seed.sql` upserts).
3. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon public key (Settings → API in the Supabase dashboard):
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your anon key>
   ```
   The anon key is safe here — it's constrained entirely by the Row Level
   Security policies in `supabase/schema.sql`, not a secret credential.
4. `npm run dev`

If Supabase isn't configured (or a fetch to it fails), the app silently
falls back to the same bundled dataset, offline-style — you'll see "local
dataset" in the graph panel's footer and can still explore, just without
accounts.

## Using it

This is a dictionary first, exploration tool second: type any Japanese
word — `日本語`, `学校`, `天気`, a word not in the dropdown, even one the
dictionary doesn't have an entry for — or search by reading/meaning like
"school", and its entry fills the left panel (headword, reading, numbered
senses, JLPT level, on'yomi/kun'yomi for a kanji). The word tree graph on
the right is the secondary, exploratory half of the same view, always
visible alongside the dictionary entry rather than hidden behind it — drag
the divider between the two panels to give either one more room (double-
click the divider to reset the split), or just leave it at the default and
use both side by side.

A word typed straight in (not picked from the dropdown) still works as a
root as long as it contains at least one hiragana/katakana/kanji character
— its kanji are read directly off the text you typed, so branching out from
it works the same way even if the word itself isn't in the dictionary
(the entry just won't have a reading/meaning for it).

In the graph: click any kanji to reveal other words containing it; click
any word to reveal its own kanji and simultaneously update the dictionary
panel to that word's entry. Nodes with a dashed ring haven't been (fully)
expanded yet. Drag nodes to rearrange, scroll/pinch to zoom, drag the
background to pan.

**Filters** (graph panel toolbar) — three ways to control what the graph
shows:
- **Mastery** — hide/dim words by New / Learning / Known status.
- **JLPT level** — hide/dim by a word's hardest-tagged kanji (N5 easiest —
  N1 hardest, plus "Other" for untagged). Unlike the mastery/group filters,
  this one also limits what *future* kanji/word reveals show up, not just
  what's already on screen — hit Reset to fully apply it retroactively.
- **Focus on group** — show only one of your groups, dimming everything
  else.
- **Words per branch** (moved in here) caps how many words appear each
  time you click a kanji, ranked most-common-first. If more remain, the
  kanji stays in its "click for more" (dashed ring) state — click it again
  for the next batch. Handy for keeping a very common kanji (like 日 or
  人) from instantly flooding the graph.

The dictionary panel, for the currently-selected word or kanji, lets you:
- **Mark mastery** — New / Learning / Known. This dims or brightens the
  node on the graph (a quick visual read of what you've already got vs.
  what's new) and persists it — to your account if signed in, to
  `localStorage` as a guest. The sidebar's progress bar (known/learning/new
  proportions) and daily visit streak track this over time.
- **Add a word to a group** (word nodes only) — check any of your existing
  groups, or type a new group name to create one. Groups are your own
  collections (e.g. "JLPT N4 review", "kitchen vocab") independent of
  mastery status; manage them from the "Groups" button in the header. A
  small dot on a graph node marks it as belonging to at least one group.
  Works for guests too (`localStorage`), just like mastery.
- **Save a word for Anki** (word nodes only, requires sign-in) — adds it to
  your export queue, shown under the "Saved" button in the header.

### Reviewing what you've marked

"Review" (header) quizzes every word you've marked New or Learning: see
the word, "Show answer" reveals its reading/meaning, then grade yourself
"Still learning" or "Got it" — updates mastery status live, with a session
summary at the end. Each group also has its own "Quiz" button (in the
Groups panel) to review just that group's words regardless of status.

### Exporting to Anki

Open "Saved" in the header. If Anki desktop is running locally with the
[AnkiConnect](https://foosoft.net/projects/anki-connect/) add-on installed
and configured, "Send to Anki" pushes your saved words directly into a
"Word Tree" deck. Otherwise it offers a `.tsv` file instead — importable via
Anki's File → Import with zero setup.

To enable live push:
1. In Anki desktop: Tools → Add-ons → Get Add-ons…, enter code
   `2055492159` (AnkiConnect), restart Anki.
2. Tools → Add-ons → AnkiConnect → Config, add this app's origin (e.g.
   `http://localhost:5173` in dev) to `webCorsOriginList`, save, restart
   Anki.
3. Keep Anki open when you export. If your browser still blocks the call
   (some browsers treat an HTTPS page calling `http://127.0.0.1` as mixed
   content), the `.tsv` download always works as a fallback.

## Theming

Light and dark are two distinct, fully-designed palettes rather than one
palette with inverted colors — see `src/index.css` for the token values:

- **Light — "Ink & paper"**: grounded in Japanese calligraphy/shodo. Muted
  paper tones, deep ink text, a single sparing accent drawn from
  hanko-seal vermillion.
- **Dark — "Modern Tokyo signage"**: inspired by train-line maps and night
  shop signage. Near-black ground, bold sans headings, saturated
  color-coded accents (one hue per node type).

The toggle in the header sets an explicit choice (persisted to
`localStorage`); leaving it untouched follows the OS's `prefers-color-scheme`.
Node colors are read live from CSS custom properties
(`src/graph/theme.js`), so the graph and the redesign can never drift out
of sync.

## How it's built

- **React + Vite** frontend; **Supabase** (Postgres + Auth) for accounts,
  mastery persistence, and the saved-words/export queue — all optional, see
  Setup above.
- **d3-force** drives the graph physics; positions are computed into plain
  objects and rendered as SVG by React (`src/graph/useForceSimulation.js`).
  **d3-zoom** handles pan/zoom; node dragging is hand-rolled with pointer
  events (`src/components/WordTreeGraph.jsx`) to cleanly distinguish
  "click to expand" from "drag to reposition".
- The top-level layout is a resizable two-pane split
  (`src/components/SplitPane.jsx`, also hand-rolled with pointer events,
  same pattern as node dragging) between `DictionaryPanel.jsx` (the
  primary dictionary entry view) and `GraphPanel.jsx` (the word-tree graph
  plus its own toolbar — Filters, Reset — and legend/stats footer); below
  ~900px they stack vertically instead and the drag handle hides.
- The graph/expansion logic is framework- and dataset-agnostic
  (`src/graph/buildGraph.js`): given a word, look up its kanji; given a
  kanji, look up every word containing it — each function takes the
  dataset as a parameter rather than importing one, so it doesn't care
  whether the data came from Supabase or the bundled local dataset. A
  word's kanji "components" aren't stored anywhere — they're computed on
  the fly from the word's own text (`src/graph/kanji.js`), which is also
  what makes an arbitrary, not-in-the-dictionary root word work: there's
  nothing to look up to find its kanji, just the text itself.
- `src/data/useWordData.js` fetches from Supabase when configured, falling
  back to the bundled local dataset (`public/data/{kanji,words}.json`)
  otherwise or on failure, and to `src/data/japaneseData.js` (a tiny ~32
  kanji / ~38 word fixture) as a last-resort emergency fallback if even
  that fetch somehow fails.
- `src/progress/useProgress.js` (mastery) and `src/progress/useSavedWords.js`
  (Anki export queue) both branch on auth state; mastery has a
  `localStorage`-backed guest mode, the saved-words queue is
  Supabase-only (its whole point is surviving until you open Anki).
  `src/groups/useGroups.js` (word collections) follows the same
  guest/`localStorage` + Supabase pattern as mastery.
- `src/anki/ankiConnect.js` talks to AnkiConnect's local HTTP API;
  `src/anki/exportFile.js` is the `.tsv` fallback.

## The dataset (and its limits)

`public/data/words.json` (~25.7k entries) and `public/data/kanji.json`
(~13.1k entries) are the bundled offline dataset — every "common"-tagged
entry (has a `news`/`ichi`/`spec`/`gai`/`nf##` priority tag) from
[JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project),
paired with a [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)-derived
kanji reference (meanings, on'yomi/kun'yomi, JLPT level). Both were
extracted from a local JMdict/KANJIDIC2 SQLite build and the WaniKani-style
kanji reference used by this developer's other project, Gakuji — see
`public/data/README.md` for exactly how, so it can be regenerated if the
source data ever needs refreshing. `scripts/generate-seed-sql.mjs` derives
`supabase/seed.sql` from these same two JSON files (`npm run
generate:seed`), so the offline dataset and the Supabase-backed one can
never drift apart. `src/data/japaneseData.js` is a much smaller, separate,
hand-curated ~32 kanji / ~38 word fixture kept only as a last-resort
emergency fallback (see "How it's built" above) — it plays no part in the
normal offline/Supabase data path anymore.

A word not covered by either dataset still works as an exploration root
(see "Using it" above) — you just won't get a dictionary meaning/reading
for it, only its kanji breakdown. Structural (radical/stroke)
decomposition of a single kanji — a *different and richer* notion of
"component" than "which kanji make up this word" — would need
[KanjiVG](https://kanjivg.tagaini.net/)/KRADFILE, and isn't covered here;
see "Assumptions" below.

## Assumptions

- **"Component" = the kanji that make up a compound word**, not the
  sub-character radicals that make up a single kanji (語 is atomic here,
  not further decomposed into 言+吾). Matches the original 漢字 → 漢, 字
  example. Radical-level decomposition is a natural "zoom in" feature for
  later, not replaced by this.
- **Kanji ⇄ word is the only relationship type shown** — no "synonym" or
  "same reading" edges yet.
- **The graph only grows, never auto-prunes** within one exploration;
  "Reset" collapses back to the root, searching a new word starts fresh.
- **No guest → account progress migration.** Signing in starts a fresh
  (then Supabase-loaded) mastery/groups state rather than merging in
  whatever was tracked as a guest. A deliberate scope cut, not an oversight.
- **Desktop-first.** Below ~900px the dictionary/graph split stacks
  vertically instead of side-by-side (see SplitPane above), but it's not
  touch-tuned beyond that.
- **A word can belong to any number of groups**, but a group can't contain
  another group (no nesting) and a group has no notion of ordering beyond
  insertion order.

## Not in scope (by design, for now)

- English word relationships (prefixes/suffixes, Latin/French/German
  origins) — `buildGraph.js` is kept generic enough that an
  `englishData.js` + equivalent expand functions could be added later
  without reworking the graph/rendering layer.
- Full JMdict coverage (only "common"-tagged entries are bundled/seeded —
  see "The dataset" above), radical-level kanji decomposition,
  quiz/spaced-repetition modes beyond the tri-state mastery marker, OAuth
  sign-in.
- Mobile/touch-optimized interaction (pointer events work on touch, but
  nothing was tuned for it).

## Possible next steps

1. Bundle full (not just "common") JMdict coverage, so branching out never
   comes up short even on obscure words.
2. Radical-level decomposition as a deeper zoom level on a kanji node.
3. Active-recall quiz modes launched from a node (guess the reading,
   assemble a word from its kanji) — the mastery marker becomes a real
   spaced-repetition signal instead of a manual toggle. Groups would be a
   natural scope for a quiz session ("quiz me on this group").
4. An English dataset + a second "mode" so the same graph engine can
   explore `unhappiness` → `un-`, `happy`, `-ness`.
5. Guest → account progress/groups migration on first sign-in.
6. Per-group color coding on the graph (today it's just a single dot for
   "in any group").
