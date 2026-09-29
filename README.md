# 元 (Moto)

An interactive, exploratory dictionary: start from **any** Japanese word,
and expand outward through the components it's built from (in Japanese,
kanji) to discover every other word in the dataset that shares a component
with it. The point is to make the *relatedness* of vocabulary visible and
explorable, and to turn that exploration into actual retention — bookmark
the words you want to learn, and Moto turns them into Anki cards and
shows what Anki says you've learned.

Live at [moto.souravbanerjee.com](https://moto.souravbanerjee.com).

This covers Japanese only. English (prefixes/suffixes/Latin & Greek roots)
is a natural next step but intentionally out of scope for now — see "Not in
scope" below.

## Setup

```bash
npm install
```

The app runs perfectly well with **no further setup** — it loads a bundled
~228k-word/13k-kanji dataset (see "The dataset" below) and works fully as a
guest (no account needed — bookmarks, tags, and status live in the browser).
To sync them across devices with an account, you need a Supabase project:

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

Sign-in is a 6-digit code emailed to the user and typed into the Bookmarks
panel — no password, no link to click. The auth settings it relies on
(Site URL, redirect allowlist, code length, and the email template that
carries the code) live in `supabase/config.toml` and are applied with
`npx supabase config push` (preview with `npx supabase config diff`).
Supabase only accepts a custom email template once the project sends mail
through a custom SMTP provider (Authentication → Emails → SMTP Settings) —
its built-in sender also only delivers to the project's own team members.

If Supabase isn't configured (or a fetch to it fails), the app silently
falls back to the same bundled dataset, offline-style — you'll see "local
dataset" in the graph panel's footer and can still explore, just without
accounts.

## Using it

This is a dictionary first, exploration tool second: type any Japanese
word — `日本語`, `学校`, `天気`, a word not in the dropdown, even one the
dictionary doesn't have an entry for — or search by reading/meaning like
"school", and its entry fills the left panel: headword, reading, a
"Common word" badge when JMdict tags it as common, JLPT level, and every
sense JMdict has for it — each with its part of speech (Ichidan verb,
noun, ...), usage-register notes (archaic, slang, humble language,
derogatory, ...), and loanword origin/etymology where one exists ("From
Portuguese: pão"), not just a bare gloss. A kanji entry gets on'yomi/
kun'yomi instead. The word tree graph on the right is the secondary,
exploratory half of the same view, always visible alongside the
dictionary entry rather than hidden behind it — drag the divider between
the two panels to give either one more room (double-click the divider to
reset the split), or just leave it at the default and use both side by
side.

A word typed straight in (not picked from the dropdown) still works as a
root as long as it contains at least one hiragana/katakana/kanji character
— its kanji are read directly off the text you typed, so branching out from
it works the same way even if the word itself isn't in the dictionary
(the entry just won't have a reading/meaning for it).

In the graph: click any node to select it and load its entry into the
dictionary panel -- a single click never changes the graph, so browsing
around what's already there is always safe. To reveal what a node connects
to (other words sharing a kanji, or a word's own kanji), double-click it,
or use the "Show related words"/"Show kanji breakdown" button that
appears in the dictionary panel for any selected, not-yet-expanded node.
Nodes with a dashed ring haven't been (fully) expanded yet. Drag nodes to
rearrange, scroll/pinch to zoom, drag the background to pan. On a touch
screen, tap to select, and double-tap or press-and-hold to expand. The view
frames the whole graph once it settles — on a new word, and after each
expand — until you pan or zoom yourself; the zoom controls' reset button
frames it again.

The layout adapts to the screen's shape, not just its width
(`src/lib/useLayoutMode.js`): side by side on desktop; stacked with both
halves visible on a portrait tablet; on a phone, one half at a time (tap the
word strip for the full entry, tap Explore to go back); and on a phone
turned sideways, a side rail for the word next to a full-height graph.

**Filters** (graph panel toolbar) — ways to control what the graph
shows:
- **JLPT level** — hide/dim by a word's hardest-tagged kanji (N5 easiest —
  N1 hardest, plus "Other" for untagged). Unlike the tag filter,
  this one also limits what *future* kanji/word reveals show up, not just
  what's already on screen — hit Reset to fully apply it retroactively.
- **Tag focus** — show only words with one of your tags, dimming
  everything else.
- **Words per branch** (moved in here) caps how many words appear each
  time you click a kanji, ranked most-common-first. If more remain, the
  kanji stays in its "click for more" (dashed ring) state — click it again
  for the next batch. Handy for keeping a very common kanji (like 日 or
  人) from instantly flooding the graph.
- **Color by Reading** color-codes each kanji→word link by whether that
  word uses the kanji's on'yomi or kun'yomi (e.g. 毎日's 日 is on'yomi,
  誕生日's is kun'yomi) — best-effort, so an irregular/heavily-sound-shifted
  reading (jukujikun like 今日) shows as "Unclear" rather than a guess.
  Replaces the always-on start/middle/end position coloring on screen while
  it's active; click a row in the graph's Reading legend to focus on just
  on'yomi, kun'yomi, or unclear words.

The dictionary panel, for the currently-selected word, lets you:
- **Bookmark it** — your study list. Works without an account (saved in
  the browser); signing in syncs it, and anything bookmarked before
  signing in is merged into the account. A small dot on a graph node marks
  a bookmarked word, and Moto remembers which word you were exploring when
  you bookmarked it.
- **Tag it** (bookmarked words) — your own labels, e.g. "N4 exam".
- **See its status** — Not studied / Learning / Known, read from Anki (see
  below), or mark it "I already know this" for words you know but don't
  need a card for.

### Studying with Anki

Anki is Moto's review engine — Moto doesn't schedule reviews itself. Open
Bookmarks and press **Connect to Anki** (Anki desktop must be running with
the [AnkiConnect](https://foosoft.net/projects/anki-connect/) add-on). From
then on, in that browser:
- every bookmark becomes a card in Anki's `元` deck, using a dedicated
  "Moto (元)" note type — the word on the front; reading, meaning, and its
  kanji breakdown on the back — tagged with its collections
  (`moto::kanji::日`, `moto::jlpt::n5`, `moto::from::日本語`,
  `moto::tag::…`). Removing a bookmark never deletes its card;
- each word's status comes back from its Anki card: Learning until Anki is
  spacing it 21+ days apart, then Known — including words already in your
  *other* decks (matched on each note type's first field), so what you
  already know shows up in the dictionary panel without any setup. (The
  graph is for discovery and deliberately never shows study status.)
  Statuses are saved to your account, so phones (which can't reach Anki)
  see them too;
- Anki is only contacted when your bookmarks change (a word added, or a
  bookmark's tags), when you connect, or when you press sync — never while
  you explore the graph.
- Once connected (and signed in), both collapse into small pods at the top
  of Bookmarks: status at a glance, a sync button each, and **Review** on
  the Anki pod, which opens Anki's reviewer on the deck. Tap a pod to expand
  it. "How to set up AnkiConnect" walks through the add-on and its
  `webCorsOriginList`, with this site's exact origin ready to paste.

Bookmarks also groups your words into **collections** automatically — by
your tags, JLPT level, kanji shared by two or more words, and where you
found them — and each one opens in Anki's browser by its tag.

To set up AnkiConnect:
1. In Anki desktop: Tools → Add-ons → Get Add-ons…, enter code
   `2055492159` (AnkiConnect), restart Anki.
2. Tools → Add-ons → AnkiConnect → Config, add
   `https://moto.souravbanerjee.com` to `webCorsOriginList` (or
   `http://localhost:5173` when running it locally), save, restart Anki.
   The in-app guide shows the exact line to paste.
3. Chrome/Edge 142+ ask to let the site "access devices on your local
   network" the first time it reaches Anki — allow it. (Moto never
   contacts Anki until you press Connect, so nobody sees that prompt
   unasked.) If it still can't connect, Bookmarks lists what to check.

Syncing directly needs Chrome, Edge, or Firefox on the computer running
Anki. **Safari blocks an https site from calling AnkiConnect** on
`127.0.0.1`, and phones have no Anki desktop to call, so on those (and when
the local-network permission was refused) Bookmarks leads with the
fallback instead: **Download .tsv for Anki**, which is also always on the
bookmark list for everyone, account or not. Import it in Anki via
File → Import (AnkiMobile and AnkiDroid can import it too).
`src/anki/reachability.js` does the detection; it's advisory, so desktop
Safari still gets a "Try connecting anyway" button.

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

- **React + Vite** frontend; **Supabase** (Postgres + Auth) for accounts
  and syncing bookmarks, tags, and status — all optional, see Setup above.
- **d3-force** drives the graph physics; positions are computed into plain
  objects and rendered as SVG by React (`src/graph/useForceSimulation.js`).
  **d3-zoom** handles pan/zoom; node dragging is hand-rolled with pointer
  events (`src/components/WordTreeGraph.jsx`) to cleanly distinguish
  "click to expand" from "drag to reposition".
- The top-level layout (`src/components/PaneLayout.jsx`) pairs
  `DictionaryPanel.jsx` (the primary dictionary entry view) with
  `GraphPanel.jsx` (the word-tree graph plus its toolbar and legend) in one
  of four shapes picked by `src/lib/useLayoutMode.js` — desktop and tablet
  are resizable splits (hand-rolled with pointer events, same pattern as
  node dragging), phone and landscape-rail toggle between the halves. The
  graph sits at the same place in the element tree in every shape, so
  rotating or resizing never resets it; `App.css` keys its per-layout rules
  off `data-layout` on `.app`.
- The graph/expansion logic is framework- and dataset-agnostic
  (`src/graph/buildGraph.js`): given a word, look up its kanji; given a
  kanji, look up every word containing it — each function takes the
  dataset as a parameter rather than importing one. A word's kanji
  "components" aren't stored anywhere — they're computed on the fly from
  the word's own text (`src/graph/kanji.js`), which is also what makes an
  arbitrary, not-in-the-dictionary root word work: there's nothing to look
  up to find its kanji, just the text itself.
- `src/data/useWordData.js` always loads the dictionary from the bundled,
  gzip-compressed static dataset (`public/data/{kanji,words}.gzjson` —
  see `data/offline-dataset/README.md`) via a Web Worker
  (`src/data/datasetWorker.js`) that fetches, decompresses, and indexes it
  off the main thread, falling back to `src/data/japaneseData.js` (a tiny
  ~32 kanji / ~38 word fixture) only if that somehow fails. It's
  deliberately never read from Supabase, even when Supabase is
  configured — see that README for why.
- `src/progress/useSavedWords.js` (bookmarks), `src/progress/useProgress.js`
  (status), and `src/groups/useGroups.js` (tags) each branch on auth state:
  `localStorage` for guests (all through `src/lib/guestStore.js`),
  Supabase when signed in. `src/auth/mergeGuestData.js` folds the guest
  data into the account on sign-in, before the account's data loads.
- `src/anki/ankiConnect.js` talks to AnkiConnect's local HTTP API;
  `src/anki/ankiSync.js` is the two-way bridge (cards out, status back),
  driven by `src/anki/useAnkiSync.js`; `src/bookmarks/collections.js` builds
  the automatic collections; `src/anki/exportFile.js` is the `.tsv`
  fallback.

## The dataset (and its limits)

`data/offline-dataset/words.json` (~228.3k entries — essentially the complete
[JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project),
every entry with at least one English gloss) and
`data/offline-dataset/kanji.json` (~13.1k entries) are the bundled offline
dataset's source (shipped compressed as `public/data/*.json.gz` — see
`data/offline-dataset/README.md`), paired with a
[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)-derived
kanji reference (meanings, on'yomi/kun'yomi, JLPT level). Every valid kanji
spelling of a word is its own searchable headword sharing that word's
reading/senses (e.g. 呼びかける, 呼び掛ける, and 呼掛ける are three separate
entries, not one "best" spelling standing in for the others) -- extracted
via the actual [jamdict](https://github.com/neocl/jamdict) Python package's
own entry/sense/kanji-form assembly rather than hand-rolled joins over its
underlying tables, after an earlier version of this dataset picked only
one spelling per entry and silently dropped ~750 legitimate alternate
spellings as a result. Each word carries every sense JMdict has for it as
a structured `senses` array (capped at 10 senses, 3 glosses each, for the
handful of entries with dozens) rather than a flattened first-sense-only
string — part of speech, usage-register tags (archaic, slang, humble
language, derogatory, ...), free-text notes, and loanword origin/etymology
("From Portuguese: pão"), all rendered per-sense in the dictionary panel.
A flat `meaning` string (same senses, joined) is kept alongside `senses`
purely so search can substring-match one string per word instead of
flattening a nested array on every keystroke. `rank` (lower = more
common, from JMdict's own `news`/`ichi`/`spec`/`gai`/`nf##` priority tags,
checked per spelling) is present when JMdict tags that spelling as common
at all — most aren't, and sort last when a kanji branch is capped by
"words per branch"; the dictionary panel shows a "Common word" badge
whenever it's present.
A kana-only entry (no kanji spelling) still gets a dictionary entry — it's
just never reachable by clicking through the graph, since it has no kanji
to be a component of. Both files were
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
- **Anki sync needs Anki desktop.** AnkiConnect only runs on desktop
  (iOS has no equivalent; the Android port lacks the card-statistics calls),
  so phones show the status last synced from a desktop rather than syncing
  themselves. Moto deliberately has no review scheduler of its own.
- **Tags are flat.** A word can have any number of tags, but tags don't
  nest and have no ordering beyond creation order.

## Not in scope (by design, for now)

- English word relationships (prefixes/suffixes, Latin/French/German
  origins) — `buildGraph.js` is kept generic enough that an
  `englishData.js` + equivalent expand functions could be added later
  without reworking the graph/rendering layer.
- Radical-level kanji decomposition, OAuth sign-in.
- An in-app review scheduler — Anki does the scheduling (see "Studying with
  Anki").

## Possible next steps

1. Radical-level decomposition as a deeper zoom level on a kanji node.
2. Active-recall drills launched from a node (guess the reading, assemble
   a word from its kanji), with the results feeding Anki rather than a
   scheduler of Moto's own. A collection would be a natural scope for one.
3. An English dataset + a second "mode" so the same graph engine can
   explore `unhappiness` → `un-`, `happy`, `-ness`.
4. Per-tag color coding on the graph (today it's just a single dot for
   "bookmarked").
