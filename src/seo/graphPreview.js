// The graph preview on the kanji and word pages: the very graph the page's
// "Explore" button opens, built with the explorer's own graph functions,
// laid out by its own physics (graph/forceLayout.js, run to rest) and drawn
// with its own markup and styles (WordTreeGraph + App.css), as a static SVG.
// Each request builds a tiny dataset of just the kanji and words involved,
// so a preview costs a few milliseconds and a few hundred KB, once per
// page per deploy (the edge caches the result).
import { createInitialGraph, expandKanji } from "../graph/buildGraph.js";
import { layoutGraphSteps } from "../graph/forceLayout.js";
import { nodeRadius } from "../graph/layout.js";
import { charOffsetX, kanjiPathColorMap } from "../graph/kanjiPathColors.js";
import { DEFAULT_MAX_WORDS } from "../graph/exploreState.js";
import { extractKanjiComponents } from "../graph/kanji.js";

// WordTreeGraph's constants.
const KANJI_MARK_GLYPH_W = 15;
const KANJI_MARK_RADIUS = 3;
const KANJI_MARK_OFFSET_Y = 10;
const KANJI_PATH_COUNT = 4; // --kanji-path-1..4

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (v) => Math.round(v * 10) / 10;

/** A dataset shaped like the app's (see data/useWordData.js), holding only
 * what a graph around `root` expanding `kanji` can reach. */
function miniDataset(data, root, kanji) {
  const KANJI = {};
  const WORDS_BY_TEXT = {};
  const WORDS_CONTAINING_KANJI = {};
  const addKanji = (c) => {
    if (KANJI[c]) return;
    const k = data.kanji[c] ?? data.extraKanji[c];
    if (k) KANJI[c] = { char: c, meaning: k.m, onyomi: k.on, kunyomi: k.kun, jlpt: k.jlpt ?? undefined };
  };
  const addWord = (word, reading, gloss, rank) => {
    WORDS_BY_TEXT[word] ??= { word, reading, meaning: gloss, senses: [{ gloss: [gloss] }], rank: rank ?? undefined };
    extractKanjiComponents(word).forEach(addKanji);
  };
  const rootEntry = data.words[root];
  if (rootEntry) addWord(root, rootEntry.r, rootEntry.s[0]?.g.join("; ") ?? "", rootEntry.rank);
  extractKanjiComponents(root).forEach(addKanji);
  for (const c of kanji) {
    const list = data.kanji[c]?.words ?? [];
    WORDS_CONTAINING_KANJI[c] = list.map(([w]) => w);
    for (const [w, reading, gloss, , , rank] of list) addWord(w, reading, gloss, rank);
  }
  return { KANJI, WORDS_BY_TEXT, WORDS_CONTAINING_KANJI };
}

/** The graph "Explore" opens for `root` with `kanji` expanded, and each
 * intermediate graph -- the layout replays them in order, as clicks. */
function graphSteps(dataset, root, kanji) {
  let g = createInitialGraph(dataset, root);
  const steps = [g];
  for (const c of kanji) {
    const next = expandKanji(dataset, g, c, DEFAULT_MAX_WORDS);
    if (next !== g) steps.push((g = next));
  }
  return steps;
}

const PREVIEW_CSS = `
.gp{display:block;width:100%;height:auto;--zoom-inv:calc(var(--vbw) / 928)}
@media (max-width:960px){.gp{--zoom-inv:calc(var(--vbw) / 720)}}
@media (max-width:640px){.gp{--zoom-inv:calc(var(--vbw) / 520)}}
@media (max-width:420px){.gp{--zoom-inv:calc(var(--vbw) / 358)}}
.gp .graph-link{stroke:var(--border);stroke-width:1.5px}
.gp .graph-link--kanji-path{stroke-width:2.25px;opacity:.95;stroke-dasharray:5 4;animation:kanji-path-flow 900ms linear infinite}
.gp .graph-node__label{font-size:13px;fill:#fff;font-weight:600;paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:3px;stroke-linejoin:round;transform-box:fill-box;transform-origin:center;transform:scale(var(--zoom-inv))}
.gp .graph-node--kanji .graph-node__label{font-size:17px}
.gp .graph-node__marks{transform-box:fill-box;transform-origin:center;transform:scale(var(--zoom-inv))}
.gp .graph-node__expand-ring{stroke:var(--text);opacity:.45;stroke-width:1.5px;stroke-dasharray:3 4}
.gp .graph-node__kanji-mark{stroke:var(--bg);stroke-width:1.5px}
.gp .graph-node--kanji-path-target .graph-node__fill{stroke:var(--node-ring-stroke);stroke-width:3.5px}
.gp .graph-node__select-glow{fill:var(--select-glow-color);filter:blur(var(--select-glow-blur));opacity:var(--select-glow-opacity);transform-box:fill-box;transform-origin:center;animation:select-glow-breathe 2400ms ease-in-out infinite}
.gp a:hover .graph-node__fill{filter:brightness(1.12)}
@keyframes kanji-path-flow{to{stroke-dashoffset:-18}}
@keyframes select-glow-breathe{0%,100%{opacity:var(--select-glow-opacity);transform:scale(1)}50%{opacity:calc(var(--select-glow-opacity) * 1.4);transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){.gp .graph-link--kanji-path,.gp .graph-node__select-glow{animation:none}}
`.trim();

/** Styles the preview SVGs need; include once per page. */
export function graphPreviewCss() {
  return PREVIEW_CSS;
}

/**
 * The SVG for the graph around `root` with `kanji` expanded, as the
 * explorer shows it with `root` selected. `hrefFor(node)` links a node to
 * its page (or null).
 */
export function renderGraphPreview(data, { root, kanji, hrefFor = () => null }) {
  const dataset = miniDataset(data, root, kanji);
  const steps = graphSteps(dataset, root, kanji);
  const graph = steps[steps.length - 1];
  const placed = layoutGraphSteps(steps);

  const selectedId = `word:${root}`;
  const pathColors = kanjiPathColorMap(
    root,
    Array.from({ length: KANJI_PATH_COUNT }, (_, i) => `var(--kanji-path-${i + 1})`)
  );

  // Fit the view to the graph, like the explorer's auto-framing.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of placed.values()) {
    const r = nodeRadius(node) + 8;
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r);
  }
  const pad = 28;
  let w = maxX - minX + pad * 2;
  let h = maxY - minY + pad * 2;
  // Never narrower than a landscape card, or a two-node graph would render
  // enormous.
  const minW = Math.max(560, h * 1.45);
  const x0 = minX - pad - Math.max(0, minW - w) / 2;
  w = Math.max(w, minW);
  const minH = Math.max(320, w / 2.4);
  const y0 = minY - pad - Math.max(0, minH - h) / 2;
  h = Math.max(h, minH);

  const at = (id) => placed.get(id);
  const links = graph.links
    .map((l) => {
      const s = at(l.source);
      const t = at(l.target);
      if (!s || !t) return "";
      const pathChar =
        s.id === selectedId && t.type === "kanji" && pathColors.has(t.char)
          ? t.char
          : t.id === selectedId && s.type === "kanji" && pathColors.has(s.char)
            ? s.char
            : null;
      const cls = pathChar ? "graph-link graph-link--kanji-path" : "graph-link";
      const style = pathChar ? ` style="stroke:${pathColors.get(pathChar)}"` : "";
      return `<line x1="${n1(s.x)}" y1="${n1(s.y)}" x2="${n1(t.x)}" y2="${n1(t.y)}" class="${cls}"${style}/>`;
    })
    .join("");

  const fillVar = (node) =>
    node.isRoot ? "var(--accent)" : node.type === "kanji" ? "var(--node-kanji)" : "var(--node-word)";

  const nodes = Array.from(placed.values())
    .map((node) => {
      const r = nodeRadius(node);
      const selected = node.id === selectedId;
      const label = node.type === "kanji" ? node.char : node.word;
      const ring = node.type === "kanji" ? pathColors.get(node.char) : null;
      const fill = fillVar(node);
      const chars = selected && node.type === "word" && pathColors.size ? Array.from(label) : null;
      const labelSvg = chars
        ? chars.map((ch, i) => `<tspan x="${charOffsetX(i, chars.length, KANJI_MARK_GLYPH_W)}">${esc(ch)}</tspan>`).join("")
        : esc(label);
      const marks = chars
        ? `<g class="graph-node__marks">${chars
            .map((ch, i) =>
              pathColors.has(ch)
                ? `<circle class="graph-node__kanji-mark" cx="${charOffsetX(i, chars.length, KANJI_MARK_GLYPH_W)}" cy="${KANJI_MARK_OFFSET_Y}" r="${KANJI_MARK_RADIUS}" style="fill:${pathColors.get(ch)}"/>`
                : ""
            )
            .join("")}</g>`
        : "";
      const body =
        (selected ? `<circle r="${n1(r * 1.15)}" class="graph-node__select-glow" style="--select-glow-color:${fill}"/>` : "") +
        `<circle r="${r}" class="graph-node__fill" fill="${fill}"/>` +
        (node.expanded ? "" : `<circle r="${r + 5}" class="graph-node__expand-ring" fill="none"/>`) +
        `<text text-anchor="middle" dominant-baseline="central" class="graph-node__label" lang="ja">${labelSvg}</text>` +
        marks;
      const cls = `graph-node graph-node--${node.type}${ring ? " graph-node--kanji-path-target" : ""}`;
      const style = ring ? ` style="--node-ring-stroke:${ring}"` : "";
      const g = `<g class="${cls}"${style} transform="translate(${n1(node.x)},${n1(node.y)})">${body}</g>`;
      const href = hrefFor(node);
      return href ? `<a href="${esc(href)}">${g}</a>` : g;
    })
    .join("");

  return `<svg class="gp" viewBox="${n1(x0)} ${n1(y0)} ${n1(w)} ${n1(h)}" style="--vbw:${Math.round(w)}" role="img" aria-label="Word graph around ${esc(root)}">${links}${nodes}</svg>`;
}
