import { useCallback, useState } from "react";
import WordTreeGraph from "./WordTreeGraph";
import FiltersPanel from "./FiltersPanel";
import { kanjiPositionCategory } from "../graph/positionCategory";
import { useClickOutside } from "../lib/useClickOutside";

// True once at least one kanji has been expanded (its links to sibling
// words are the only ones color-coded by position -- see
// WordTreeGraph/positionCategory.js) -- gates the second legend row so it
// doesn't show before there's anything on screen for it to explain.
function hasPositionGroups(graph) {
  if (!graph) return false;
  for (const l of graph.links) {
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    if (graph.nodes.get(sourceId)?.type === "kanji") return true;
  }
  return false;
}

// Ordered easiest-to-hardest so the legend reads as a ramp, not a random
// list -- matches JLPT_OPTIONS in FiltersPanel.jsx.
const JLPT_LEGEND = [
  { value: "n5", label: "N5" },
  { value: "n4", label: "N4" },
  { value: "n3", label: "N3" },
  { value: "n2", label: "N2" },
  { value: "n1", label: "N1" },
  { value: "unrated", label: "Unrated" },
];

const DEFAULT_TYPE_LEGEND = { word: true, kanji: true };
const DEFAULT_JLPT_LEGEND = { n5: true, n4: true, n3: true, n2: true, n1: true, unrated: true };
const DEFAULT_POSITION_LEGEND = { start: true, middle: true, end: true };
const DEFAULT_READING_LEGEND = { onyomi: true, kunyomi: true, unknown: true };

const READING_LEGEND = [
  { value: "onyomi", label: "On’yomi" },
  { value: "kunyomi", label: "Kun’yomi" },
  { value: "unknown", label: "Unclear" },
];

// Position and Reading are mutually exclusive Filters modes that share one
// dash-pattern vocabulary rather than each having their own hue set (see
// App.css's .graph-link--pos-*/--reading-* and the 2026-09-12 Decisions Log
// entry) -- "" renders as the plain solid swatch, otherwise this names the
// legend__swatch--line--<pattern> modifier class.
const LINK_PATTERN = { start: "", middle: "dashed", end: "dotted", unknown: "", onyomi: "dashed", kunyomi: "dotted" };

function lineSwatchClass(value) {
  const pattern = LINK_PATTERN[value];
  return `legend__swatch legend__swatch--line${pattern ? ` legend__swatch--line--${pattern}` : ""}`;
}

function toggled(prev, key) {
  return { ...prev, [key]: !prev[key] };
}

// Every kanji that reveals this word and the role it plays relative to that
// specific kanji (a bridge word shared by several kanji can be "start" for
// one and "end" for another) -- used so the position legend only dims a
// word once NONE of its roles are still active, not the moment any one of
// them is toggled off.
function wordPositionCategories(graph, word) {
  const categories = new Set();
  for (const l of graph.links) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (t !== word.id) continue;
    const sourceNode = graph.nodes.get(s);
    if (sourceNode?.type === "kanji") categories.add(kanjiPositionCategory(word.word, sourceNode.char));
  }
  return categories;
}

// Same idea as wordPositionCategories, for on'yomi/kun'yomi instead of
// start/middle/end -- a word mixing an on'yomi kanji with a kun'yomi one
// (a genuine category, 湯桶/重箱-yomi) ends up with both in its set, so it
// only dims once NEITHER of its roles is still active. Reading type is
// precomputed per word node (see buildGraph.js/graph/readingType.js) since
// it needs every component kanji's reading data at once, not just the one
// a given link points at.
function wordReadingCategories(graph, word) {
  const categories = new Set();
  for (const l of graph.links) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (t !== word.id) continue;
    const sourceNode = graph.nodes.get(s);
    if (sourceNode?.type === "kanji") categories.add(word.kanjiReadingTypes?.[sourceNode.char] ?? "unknown");
  }
  return categories;
}

function LoadingIndicator() {
  return (
    <div className="loading-indicator">
      <div className="loading-indicator__bar">
        <div className="loading-indicator__fill loading-indicator__fill--indeterminate" />
      </div>
      <p className="loading-indicator__label">Loading word data…</p>
    </div>
  );
}

/**
 * The secondary, exploratory tool alongside DictionaryPanel: the word-tree
 * graph plus everything that controls what it shows (Filters, Reset) and
 * describes what you're looking at (legend, shown-count). Kept separate
 * from WordTreeGraph itself so that component stays pure rendering logic.
 */
export default function GraphPanel({
  graph,
  selectedId,
  onNodeClick,
  onNodeExpand,
  getStatus,
  isInGroup,
  isDimmed,
  theme,
  onReset,
  stats,
  datasetSource,
  datasetLoading,
  isFiltersPanelOpen,
  onToggleFiltersPanel,
  onCloseFiltersPanel,
  filtersActive,
  masteryFilter,
  onToggleMastery,
  jlptFilter,
  onToggleJlpt,
  groups,
  focusGroupId,
  onSetFocusGroup,
  maxWords,
  onSetMaxWords,
  hintedIds,
  colorByDifficulty,
  onToggleColorByDifficulty,
  linkColorMode,
  onSetLinkColorMode,
  colorByKanjiPath,
  onToggleColorByKanjiPath,
}) {
  // Legend rows double as highlight toggles: clicking one dims every node
  // it covers, independent of (and layered on top of) the Filters-driven
  // dimming already coming in as `isDimmed`. Kept local to this component
  // rather than lifted to App -- it's a pure graph-view highlight, not a
  // filter that should persist across root-word changes or survive a
  // reload. The root swatch stays a plain, non-clickable label: it's a
  // single always-shown anchor node, and WordTreeGraph already refuses to
  // dim it regardless of what isDimmed returns (see its `!node.isRoot &&`
  // guard), so a toggle for it would silently do nothing.
  const [typeLegend, setTypeLegend] = useState(DEFAULT_TYPE_LEGEND);
  const [jlptLegend, setJlptLegend] = useState(DEFAULT_JLPT_LEGEND);
  const [positionLegend, setPositionLegend] = useState(DEFAULT_POSITION_LEGEND);
  const [readingLegend, setReadingLegend] = useState(DEFAULT_READING_LEGEND);

  const toggleType = useCallback((key) => setTypeLegend((prev) => toggled(prev, key)), []);
  const toggleJlpt = useCallback((key) => setJlptLegend((prev) => toggled(prev, key)), []);
  const togglePosition = useCallback((key) => setPositionLegend((prev) => toggled(prev, key)), []);
  const toggleReading = useCallback((key) => setReadingLegend((prev) => toggled(prev, key)), []);

  // Position and reading-type color the same link the same way (see
  // WordTreeGraph) -- only one is ever on screen at once (or neither, once
  // linkColorMode is "off"), so only one legend (and its dim-filtering) is
  // shown at a time, gated by the same Filters -> "Link coloring" mode
  // that switches the link coloring itself.
  const showReadingLegend = linkColorMode === "reading" && hasPositionGroups(graph);
  const showPositionLegend = linkColorMode === "position" && hasPositionGroups(graph);

  const legendDimmed = useCallback(
    (node) => {
      if (!node.isRoot && typeLegend[node.type] === false) return true;
      if (colorByDifficulty && node.jlptBucket && jlptLegend[node.jlptBucket] === false) return true;
      if (showPositionLegend && node.type === "word" && graph) {
        const categories = wordPositionCategories(graph, node);
        if (categories.size > 0 && ![...categories].some((c) => positionLegend[c])) return true;
      }
      if (showReadingLegend && node.type === "word" && graph) {
        const categories = wordReadingCategories(graph, node);
        if (categories.size > 0 && ![...categories].some((c) => readingLegend[c])) return true;
      }
      return false;
    },
    [
      typeLegend,
      jlptLegend,
      positionLegend,
      readingLegend,
      colorByDifficulty,
      showPositionLegend,
      showReadingLegend,
      graph,
    ]
  );

  const combinedIsDimmed = useCallback((node) => isDimmed(node) || legendDimmed(node), [isDimmed, legendDimmed]);

  const filtersWrapRef = useClickOutside(isFiltersPanelOpen, onCloseFiltersPanel);

  return (
    <div className="graph-panel">
      <div className="graph-panel__toolbar">
        <span className="graph-panel__heading">Explore</span>
        <div className="graph-panel__toolbar-actions">
          <div className="icon-toolbar">
            <div className="filters-panel-wrap" ref={filtersWrapRef}>
              <button
                type="button"
                className={`icon-toolbar__btn filters-btn${filtersActive ? " is-active" : ""}`}
                onClick={onToggleFiltersPanel}
                aria-pressed={isFiltersPanelOpen}
                aria-label="Filters"
                title="Filters"
              >
                <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                  <line x1="4" y1="6.5" x2="20" y2="6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="9" cy="6.5" r="2" fill="currentColor" stroke="none" />
                  <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
                  <line x1="4" y1="17.5" x2="20" y2="17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="11" cy="17.5" r="2" fill="currentColor" stroke="none" />
                </svg>
                {filtersActive && <span className="icon-toolbar__dot" />}
              </button>
              {isFiltersPanelOpen && (
                <FiltersPanel
                  masteryFilter={masteryFilter}
                  onToggleMastery={onToggleMastery}
                  jlptFilter={jlptFilter}
                  onToggleJlpt={onToggleJlpt}
                  groups={groups}
                  focusGroupId={focusGroupId}
                  onSetFocusGroup={onSetFocusGroup}
                  maxWords={maxWords}
                  onSetMaxWords={onSetMaxWords}
                  colorByDifficulty={colorByDifficulty}
                  onToggleColorByDifficulty={onToggleColorByDifficulty}
                  linkColorMode={linkColorMode}
                  onSetLinkColorMode={onSetLinkColorMode}
                  colorByKanjiPath={colorByKanjiPath}
                  onToggleColorByKanjiPath={onToggleColorByKanjiPath}
                  onClose={onCloseFiltersPanel}
                />
              )}
            </div>
            <button
              type="button"
              className="icon-toolbar__btn"
              onClick={onReset}
              title="Collapse back to just the root word"
              aria-label="Reset graph"
              data-tutorial="graph-reset-btn"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                <path
                  d="M18.5 8.5A7 7 0 1 0 19.4 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M19.5 4.5v4.5h-4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="graph-canvas">
        {graph ? (
          <WordTreeGraph
            graph={graph}
            selectedId={selectedId}
            onNodeClick={onNodeClick}
            onNodeExpand={onNodeExpand}
            getStatus={getStatus}
            isInGroup={isInGroup}
            isDimmed={combinedIsDimmed}
            theme={theme}
            hintedIds={hintedIds}
            colorByDifficulty={colorByDifficulty}
            linkColorMode={linkColorMode}
            colorByKanjiPath={colorByKanjiPath}
          />
        ) : (
          <div className="graph-container graph-container--loading">
            <LoadingIndicator />
          </div>
        )}

        {graph && (
          <div className="graph-legend">
            <div className="graph-legend__group">
              <span className="legend__group-label">Type</span>
              <span className="legend__row">
                <span className="legend__swatch legend__swatch--root" /> Root
              </span>
              <button
                type="button"
                className={`legend__row${typeLegend.word ? "" : " is-inactive"}`}
                onClick={() => toggleType("word")}
                aria-pressed={typeLegend.word}
                title={typeLegend.word ? "Click to dim word nodes" : "Click to un-dim word nodes"}
              >
                <span className="legend__swatch legend__swatch--word" /> Word
              </button>
              <button
                type="button"
                className={`legend__row${typeLegend.kanji ? "" : " is-inactive"}`}
                onClick={() => toggleType("kanji")}
                aria-pressed={typeLegend.kanji}
                title={typeLegend.kanji ? "Click to dim kanji nodes" : "Click to un-dim kanji nodes"}
              >
                <span className="legend__swatch legend__swatch--kanji" /> Kanji
              </button>
            </div>
            {showPositionLegend && (
              <div className="graph-legend__group">
                <span className="legend__group-label">Position</span>
                <button
                  type="button"
                  className={`legend__row${positionLegend.start ? "" : " is-inactive"}`}
                  onClick={() => togglePosition("start")}
                  aria-pressed={positionLegend.start}
                  title="Where the kanji sits in the word (solid line)"
                >
                  <span className={lineSwatchClass("start")} /> Start
                </button>
                <button
                  type="button"
                  className={`legend__row${positionLegend.middle ? "" : " is-inactive"}`}
                  onClick={() => togglePosition("middle")}
                  aria-pressed={positionLegend.middle}
                  title="Where the kanji sits in the word (dashed line)"
                >
                  <span className={lineSwatchClass("middle")} /> Middle
                </button>
                <button
                  type="button"
                  className={`legend__row${positionLegend.end ? "" : " is-inactive"}`}
                  onClick={() => togglePosition("end")}
                  aria-pressed={positionLegend.end}
                  title="Where the kanji sits in the word (dotted line)"
                >
                  <span className={lineSwatchClass("end")} /> End
                </button>
              </div>
            )}
            {showReadingLegend && (
              <div className="graph-legend__group">
                <span className="legend__group-label">Reading</span>
                {READING_LEGEND.map(({ value, label }) => (
                  <button
                    type="button"
                    key={value}
                    className={`legend__row${readingLegend[value] ? "" : " is-inactive"}`}
                    onClick={() => toggleReading(value)}
                    aria-pressed={readingLegend[value]}
                    title="Whether the word uses this kanji's on'yomi or kun'yomi"
                  >
                    <span className={lineSwatchClass(value)} /> {label}
                  </button>
                ))}
              </div>
            )}
            {colorByDifficulty && (
              <div className="graph-legend__group graph-legend__group--grid">
                <span className="legend__group-label">JLPT</span>
                {JLPT_LEGEND.map(({ value, label }) => (
                  <button
                    type="button"
                    className={`legend__row${jlptLegend[value] ? "" : " is-inactive"}`}
                    onClick={() => toggleJlpt(value)}
                    aria-pressed={jlptLegend[value]}
                    key={value}
                  >
                    <span className={`legend__swatch legend__swatch--jlpt-${value}`} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="graph-panel__footer">
        <p className="graph-panel__stats">
          {stats.words} words &middot; {stats.kanji} kanji shown
          {datasetSource === "tiny-fallback" && !datasetLoading ? " · offline demo data" : ""}
        </p>
      </div>
    </div>
  );
}
