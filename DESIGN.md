# Design System — 元 (Moto)

## Product Context
- **What this is:** An interactive Japanese dictionary. Any word expands into the kanji it's built from, and each kanji expands into every other word in the dataset that shares it — a force-directed graph you explore outward from a single entry point.
- **Who it's for:** Japanese learners who want vocabulary retention, not just lookup — the app also supports accounts, mastery tracking, study groups, and Anki export.
- **Space/industry:** Japanese-learning tools and dictionaries (Jisho, WaniKani, Tofugu, Bunpro).
- **Project type:** Web app — two-panel layout (dictionary reference panel + interactive exploration graph), light/dark theme support.
- **The memorable thing:** the web of connections. Words aren't isolated — they're built from shared parts, and *seeing* that relatedness is the actual hook, more than any single dictionary lookup.

## Research Findings
Visited jisho.org, wanikani.com, tofugu.com, bunpro.jp, and obsidian.md (graph view) for reference.

- **Layer 1 (category baseline):** every Japanese-learning tool uses a plain system/humanist sans with CJK fallbacks for actual Japanese text — kanji legibility at small sizes is non-negotiable, never a decorative font. High information density is expected and accepted (readings, POS tags, JLPT level all visible without extra clicks).
- **Layer 2 (trending):** the category is visually conservative. Jisho is unchanged in years; WaniKani/Tofugu lean into a bright mascot-illustration style to signal "learning is fun." Bunpro is the most contemporary — neutral sans, soft gray surfaces, no mascot. None of the four have any network/graph-visualization precedent.
- **Layer 3 (eureka):** Moto's actual differentiator — the kanji-relationship graph — has zero precedent in this category. The only relevant reference is Obsidian's graph view, which isn't a Japanese tool at all: near-black canvas, muted default nodes, thin low-contrast links, one accent color reserved for the actively-explored path, labels revealed progressively. That's the direct answer to "the graph gets cluttered as it grows" — a problem this project had already spent multiple rounds fighting through physics/spacing fixes alone.
- **Reference sites:** jisho.org, wanikani.com, tofugu.com, bunpro.jp, obsidian.md

## Aesthetic Direction
- **Direction:** Ink & Paper — shodo/calligraphy grounding (brush, ink, paper, hanko seal), carried through *both* light and dark mode as one product, not two.
- **Decoration level:** minimal — typography and one accent color do the work; no gradients, no per-category rainbow.
- **Mood:** a single confident mark of ink against calm paper (light) or ink at night (dark). Restraint everywhere except the one thing you're actively tracing.
- **Split visual register by panel:** the dictionary panel stays dense and legible like Jisho/Bunpro (it's a serious reference tool, and density is expected here). The graph panel borrows Obsidian's calmer language — muted default nodes, quiet links, accent reserved for the selected node.

### What this replaced
Before this pass, light and dark mode were two unrelated design concepts sharing a codebase: light mode's own code comment called it "Ink & paper" (shodo grounding, vermillion accent, Shippori Mincho serif headings); dark mode's comment called it "Modern Tokyo signage" (blue-black transit-map ground, bold Inter headings, an unrelated purple accent, and five separate saturated node/link hues firing simultaneously). Toggling theme changed the product's identity, and the graph's always-on multi-hue coloring was actively working against the "avoid clutter as the graph grows" goal from earlier rounds.

## Typography
- **Display/Hero (h1/h2, all headings):** Shippori Mincho, weight 500 — same font in both themes. No Japanese-learning competitor uses a real Mincho serif for headings; it signals shodo/print rather than generic app chrome. This is the deliberate risk in this system.
- **Body/UI:** Instrument Sans — replaces Inter (overused, and the default every AI design tool converges on). More character than Inter while staying just as legible at small sizes.
- **Japanese text:** system CJK stack (inherits from the browser's Japanese font fallback — Hiragino/Noto Sans CJK/Source Han Sans depending on platform), matched weight to the surrounding UI.
- **Loading:** Google Fonts, `index.html` — `Instrument+Sans:wght@400;500;600;700` + `Shippori+Mincho:wght@400;500;600;700`.
- **Scale:** h1 56px/-1.68px tracking (36px on ≤1024px), h2 24px/-0.24px tracking (20px on ≤1024px), body 18px/145% (16px on ≤1024px), kanji node label 17px, word node label 13px.

## Color
- **Approach:** restrained — one accent, everything else neutral. Color is rare and meaningful, not decorative.
- **Accent (both themes, same hue family):** light `#c33a2e` (hanko-seal vermillion on paper), dark `#ff6a4d` (the same vermillion, brightened for a near-black ground — "ink at night," not a different color). Used for: the root/selected node, the "Common word"/JLPT badges, primary CTAs, active states.
- **Node coloring:** the root node and any selected node always carry `--accent`. Kanji and word nodes were briefly unified onto one shared `--node-neutral` on the theory that shape/size/label already told them apart — in practice that read as flat, low-contrast, and hard to scan rather than restrained, so they're back to two distinct muted tones: `--node-kanji` (light `#8a8371`, dark `#a89a7e` — warm taupe, the "ink stroke" component) and `--node-word` (light `#56697c`, dark `#6b7182` — cool slate blue, the compound it builds into). Same hue pairing in both themes, only lightness shifts. Still well short of the old per-type rainbow this replaced (light: slate blue + forest green; dark: neon pink + cyan + amber) — two desaturated, low-saturation tones, not a hue per category.
- **Kanji-position links (start/middle/end):** kept as a genuine semantic signal but turned down from a competing full-saturation line (opacity 0.8, 2px) to a quiet hint (opacity 0.55, 1.75px) — visible on inspection, not fighting the accent for attention. Off by default; togglable via Filters → "Link coloring" (Off/Position/Reading, mutually exclusive — see Decisions Log).
- **Kanji-path highlight:** on by default. Selecting a word colors each of its component kanji — in the word's own label, the link to that kanji's revealed node, and a ring around that node — the same color per kanji, from a dedicated 4-hue `--kanji-path-*` palette, with a flowing dash animation on the link. This is the one coloring signal that's tied to the core selection interaction rather than an extra lens, so it's the one exception to "everything extra defaults off."
- **Neutrals:** light — bg `#e7e2d1`, code/surface `#ded8c4`, border `#c9c2ac`, text `#4a4438`, heading text `#1c1a14`. Dark — bg `#0b0c10`, surface `#16181f`, border `#2a2d38`, text `#a9afc0`, heading text `#f5f6fa`.
- **Dark mode strategy:** not a separate palette — the same paper/ink relationship inverted to a night sky, with the accent hue family preserved so the product doesn't change identity on toggle.

## Spacing
- **Base unit:** 8px (existing usage was already informally on this scale — 6/8/10/14px — this formalizes it going forward without a sweeping retrofit).
- **Density:** comfortable in the dictionary panel (matches Jisho/Bunpro's expectation of information density without extra clicks), spacious in the graph panel (nodes need room to breathe as the graph grows).
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64).

## Layout
- **Approach:** hybrid, split by panel register — grid-disciplined dictionary panel (predictable list/card alignment), looser force-directed canvas for the graph.
- **Border radius:** buttons/inputs 6px, cards/panels 8px, badges/pills full (9999px), avatars/node circles round.

## Motion
- **Approach:** minimal-functional. The graph's own physics simulation *is* the motion system — UI chrome should never compete with it for attention.
- **Existing patterns (kept, not changed by this pass):** node entrance `node-pop` 260ms cubic-bezier(0.2, 0.8, 0.3, 1.1), node opacity transitions 220ms ease, both respecting `prefers-reduced-motion`.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out).
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-08 | Initial design system created; unified light/dark themes under one "Ink & Paper" concept | `/design-consultation` — the two themes had drifted into unrelated concepts (shodo-paper vs. neon transit-signage); research (Obsidian graph view) showed the graph's 6-hue always-on coloring was working against the clutter-reduction goal from earlier physics/spacing rounds |
| 2026-09-08 | Collapsed kanji/word node colors to one shared neutral; accent reserved for root + selected state | Nodes are already distinguishable by shape/size/label; a second and third saturated hue only added competing signal as the graph grows |
| 2026-09-08 | Replaced dark-mode's purple accent (#7c5cff) with a vermillion variant (#ff6a4d) matching light mode's hue family | Accent color is the one signal that should mean the same thing in both themes — a hue swap on toggle read as a different product |
| 2026-09-08 | Unified heading font to Shippori Mincho in both themes (dark mode previously used bold Inter at weight 800) | Same reasoning as accent — heading identity shouldn't change with theme |
| 2026-09-08 | Swapped body font from Inter to Instrument Sans | Inter is the default every AI/dev tool converges on; Instrument Sans has more character at the same legibility, avoids the "gave up on typography" signal |
| 2026-09-08 | Reversed the shared kanji/word node neutral back to two distinct muted tones (`--node-kanji` / `--node-word`) | User feedback: the unified neutral read as flat/low-contrast in practice, not restrained — shape/size/label alone weren't enough to scan the graph at a glance |
| 2026-09-09 | Added opt-in on'yomi/kun'yomi link coloring (`--reading-onyomi`/`--reading-kunyomi`, "unclear" reuses `--jlpt-unrated`) plus a matching Reading legend/filter, gated behind Filters → "Color by Reading" | User request: filter and color-code the explore graph by whether a word uses a kanji's on'yomi or kun'yomi. Mirrors the existing kanji-position link system exactly (same quiet-hint weight: opacity 0.55, 1.75px) and *replaces* it on screen rather than stacking a second link color, so links only ever carry one signal at a time; the Position legend/dimming hides while this is on and vice versa |
| 2026-09-09 | Moved the selected-node indicator off the fill circle's own stroke onto a dedicated outer ring (`.graph-node__select-ring`, accent, sits outside the expand ring) | User feedback: selecting a node painted the accent stroke directly over the fill circle, which is also where the opt-in JLPT difficulty ring draws its stroke -- selecting a node hid its own difficulty color, the one moment you'd most want to see it |
| 2026-09-11 | Made kanji-position link coloring a togglable mode of a single "Link coloring" control (Off / Position / Reading, default Off) instead of always-on with no way to turn it off | User feedback that the graph read as "messy and convoluted" with "numerous colorings on the lines" -- position coloring had no Filters toggle at all (unlike Reading, which was already opt-in), so it painted every kanji-to-word link on screen by default regardless of any other setting. Making it opt-in and mutually exclusive with Reading (one "Link coloring" mode, not two independently-toggled signals) is the single biggest reduction in default-view noise from this pass |
| 2026-09-11 | Added kanji-path highlight (Filters -> "Highlight selected word's kanji", on by default): selecting a word colors each of its component kanji in the word's own label, the link to that kanji's node (if revealed), and a ring around the kanji node itself, all the same color per kanji, with a flowing dash animation on the link. New `--kanji-path-1..4` token set (4 muted, mutually-distinct hues, cycled if a word has more unique kanji than colors) | User request: a togglable way to see, at a glance, which part of a selected word maps to which kanji node on the graph. Reuses the existing difficulty-ring stroke channel rather than adding a new ring (kanji-path wins when both would show on the same node), and overrides Position/Reading link coloring via inline style on just the 1-4 links it applies to -- so this adds a new signal without adding a new ring element or increasing how many things can be visually stacked on one node at once |
| 2026-09-11 | Replaced the selected-node outline ring (`.graph-node__select-ring`, an accent stroke on a dedicated outer circle) with a soft accent-colored radial glow behind the node (`.graph-node__select-glow`, filled from a theme-aware SVG `#select-glow` gradient) | User feedback: the ring read as a hard, clinical "selected" badge rather than fitting the ink/paper mark language. A glow behind the node reads more like it's quietly lit from within -- closer to the hanko-seal accent's own character -- and, as a side effect, frees the outer-ring visual channel entirely for the difficulty/kanji-path ring, which no longer has to coordinate spacing with a second ring |
