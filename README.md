# Word Tree (言葉の木)

An interactive, exploratory dictionary: start from one word, and expand
outward through the components it's built from (in Japanese, kanji) to
discover every other word in the dataset that shares a component with it.
The point is to make the *relatedness* of vocabulary visible and explorable
instead of just looking up one word at a time.

This is an MVP proving out the core interaction loop for Japanese only.
English (prefixes/suffixes/Latin & Greek roots) is a natural next step but
is intentionally out of scope for this prototype — see "Not in scope" below.

## Try it

```bash
npm install
npm run dev
```

Open the printed local URL. Search for a word (try `日本語`, `学校`,
`天気`, or search by reading/meaning like "school" or "gakkou"). The
searched word becomes the center (root, orange) of a force-directed graph.
Its kanji (blue) branch out from it. Click any kanji to reveal every other
word in the dataset that contains it (teal); click any word to reveal its
own kanji components. Nodes with a dashed ring haven't been expanded yet —
click to expand. Drag nodes to rearrange them, scroll/pinch to zoom, drag
the background to pan. "Reset" collapses back to just the searched root
word.

## How it's built

- **React + Vite**, client-only, no backend — all data ships as a static
  JS module.
- **d3-force** drives the physics (node repulsion, link springs, collision)
  so the graph self-arranges as it grows; positions are computed into
  plain objects and rendered as SVG by React (`src/graph/useForceSimulation.js`).
- **d3-zoom** handles pan/zoom on the canvas; node dragging is hand-rolled
  with pointer events (`src/components/WordTreeGraph.jsx`) so it can
  reliably distinguish "click to expand" from "drag to reposition".
- The graph/expansion logic itself is framework-agnostic
  (`src/graph/buildGraph.js`): given a word, look up its kanji; given a
  kanji, look up every word containing it. That's the entire "engine" —
  intentionally simple so it's easy to see how a different language's rule
  (e.g. "given a word, look up its prefix/suffix/root") would plug into the
  same shape.

## The dataset (and its limits)

`src/data/japaneseData.js` is a **hand-curated set of ~32 kanji and ~39
common compound words**, picked specifically so they overlap a lot (e.g.
語, 国, 人, 曜, and 日 each show up in many words) — this makes exploring
feel rich even though the dataset is small. It is not pulled from any
dictionary API or file; meanings/readings were written from general
knowledge and should be spot-checked before this becomes anything other
than a prototype.

This does **not** scale as authored — it's a demo fixture, not a
dictionary. A real version would need a licensed/open dataset with actual
decomposition data, e.g.:
- [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) for
  kanji readings/meanings,
- [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
  for word readings/meanings/compound coverage,
- [KanjiVG](https://kanjivg.tagaini.net/) or KRADFILE/RADKFILE for
  structural (radical/stroke) decomposition, which is a *different and
  richer* notion of "component" than "which kanji make up this word" — see
  below.

## Assumptions made for this MVP

- **"Component" = the kanji that make up a compound word**, not the
  sub-character radicals that make up a single kanji (i.e. 語 is treated
  as an atomic component of 日本語, not further decomposed into 言+吾).
  This was the clearest, most learnable relationship to prototype first and
  matches your original example (漢字 → 漢, 字). Radical-level decomposition
  (KanjiVG-style) is a natural "zoom in" feature for later, not replaced by
  this — see Future work.
- **Kanji ⇄ word is the only relationship type shown.** Words aren't
  directly linked to each other except through a shared kanji node — there's
  no separate "synonym" or "same reading" edge in this MVP.
- **The graph only grows, never auto-prunes.** Clicking is one-directional
  expansion; "Reset" is the only way to collapse back down. This keeps the
  interaction model simple for a first prototype.
- **No persistence, accounts, or backend.** Search state lives only in
  memory; refreshing the page resets to the default root word (日本語).
- **Desktop-first.** The side detail panel hides below ~720px width rather
  than being reflowed into a mobile layout.

## Not in scope (by design, for this MVP)

- English word relationships (prefixes/suffixes, Latin/French/German
  origins) — you confirmed Japanese-only first is fine; the data model
  (`buildGraph.js`) was kept generic enough that an `englishData.js` +
  equivalent expand functions could be added later without reworking the
  graph/rendering layer.
- Any real dictionary backend, search-as-you-type against a full lexicon,
  or radical-level kanji decomposition.
- Mobile/touch-optimized interaction (basic pointer events work on touch,
  but nothing was tuned for it).

## Possible next steps

1. Swap the curated dataset for JMdict/KANJIDIC2 (likely via a build-time
   script that pre-processes those files into the same `{ KANJI, WORDS }`
   shape this app already consumes).
2. Add an English dataset + a second "mode" so the same graph engine can
   explore `unhappiness` → `un-`, `happy`, `-ness`.
3. Add radical-level decomposition as a deeper zoom level on a kanji node.
4. Persist/share a given exploration session via a URL (encode the
   expanded-node set in the query string).
