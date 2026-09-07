# Word Tree (言葉の木)

An interactive, exploratory dictionary: start from one word, and expand
outward through the components it's built from (in Japanese, kanji) to
discover every other word in the dataset that shares a component with it.
The point is to make the *relatedness* of vocabulary visible and explorable,
and to turn that exploration into actual retention — mark what you know,
save words of interest, and push them into Anki for spaced repetition.

This covers Japanese only. English (prefixes/suffixes/Latin & Greek roots)
is a natural next step but intentionally out of scope for now — see "Not in
scope" below.

## Setup

```bash
npm install
```

The app runs perfectly well with **no further setup** — it falls back to a
small built-in dataset and works fully as a guest (no accounts, no saved
progress across devices). To get the full experience (accounts, mastery
tracking that survives a refresh, saved words), you need a Supabase project:

1. Create a free project at [supabase.com](https://supabase.com).
2. Open its SQL editor and run `supabase/schema.sql`, then
   `supabase/seed.sql`, in that order.
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
falls back to the same built-in dataset, offline-style — you'll see
"offline data" in the sidebar and can still explore, just without accounts.

## Using it

Search for a word (try `日本語`, `学校`, `天気`, or search by
reading/meaning like "school"). The searched word becomes the root of a
force-directed graph; its kanji branch out from it. Click any kanji to
reveal every other word containing it; click any word to reveal its own
kanji. Nodes with a dashed ring haven't been expanded yet. Drag nodes to
rearrange, scroll/pinch to zoom, drag the background to pan.

Click a node to see its detail panel, where you can:
- **Mark mastery** — New / Learning / Known. This dims or brightens the
  node on the graph (a quick visual read of what you've already got vs.
  what's new) and persists it — to your account if signed in, to
  `localStorage` as a guest.
- **Save a word for Anki** (word nodes only, requires sign-in) — adds it to
  your export queue, shown under the "Saved" button in the header.

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
- The graph/expansion logic is framework- and dataset-agnostic
  (`src/graph/buildGraph.js`): given a word, look up its kanji; given a
  kanji, look up every word containing it — each function takes the
  dataset as a parameter rather than importing one, so it doesn't care
  whether the data came from Supabase or the static fallback.
- `src/data/useWordData.js` fetches from Supabase when configured, falling
  back to `src/data/japaneseData.js` (the same ~32 kanji / ~38 word fixture
  from the original prototype) otherwise or on failure.
- `src/progress/useProgress.js` (mastery) and `src/progress/useSavedWords.js`
  (Anki export queue) both branch on auth state; mastery has a
  `localStorage`-backed guest mode, the saved-words queue is
  Supabase-only (its whole point is surviving until you open Anki).
- `src/anki/ankiConnect.js` talks to AnkiConnect's local HTTP API;
  `src/anki/exportFile.js` is the `.tsv` fallback.

## The dataset (and its limits)

`src/data/japaneseData.js` is a **hand-curated set of ~32 kanji and ~38
common compound words**, picked so they overlap a lot (語, 国, 人, 曜, and
日 each show up in many words) to make exploring feel rich despite the
small size. It's not pulled from any dictionary API; meanings/readings were
written from general knowledge and should be spot-checked before this
becomes anything other than a prototype. `supabase/seed.sql` is generated
directly from this file (`npm run generate:seed`) so the two can never
drift apart.

This does **not** scale as authored — it's a demo fixture, not a
dictionary. A real version would need a licensed/open dataset, e.g.
[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) and
[JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
for readings/meanings/coverage, and
[KanjiVG](https://kanjivg.tagaini.net/)/KRADFILE for structural
(radical/stroke) decomposition — a *different and richer* notion of
"component" than "which kanji make up this word", see below.

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
  (then Supabase-loaded) mastery map rather than merging in whatever was
  tracked as a guest. A deliberate scope cut, not an oversight.
- **Desktop-first.** The sidebar hides below ~720px width rather than
  reflowing into a mobile layout.

## Not in scope (by design, for now)

- English word relationships (prefixes/suffixes, Latin/French/German
  origins) — `buildGraph.js` is kept generic enough that an
  `englishData.js` + equivalent expand functions could be added later
  without reworking the graph/rendering layer.
- Real dictionary backend / full-lexicon search, radical-level kanji
  decomposition, quiz/spaced-repetition modes beyond the tri-state mastery
  marker, OAuth sign-in.
- Mobile/touch-optimized interaction (pointer events work on touch, but
  nothing was tuned for it).

## Possible next steps

1. Swap the curated dataset for JMdict/KANJIDIC2, with JLPT-level tagging
   so exploration can be scoped by difficulty.
2. Radical-level decomposition as a deeper zoom level on a kanji node.
3. Active-recall quiz modes launched from a node (guess the reading,
   assemble a word from its kanji) — the mastery marker becomes a real
   spaced-repetition signal instead of a manual toggle.
4. An English dataset + a second "mode" so the same graph engine can
   explore `unhappiness` → `un-`, `happy`, `-ness`.
5. Guest → account progress migration on first sign-in.
