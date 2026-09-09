import { useCallback, useState } from "react";
import WordTreeGraph from "./WordTreeGraph";
import FiltersPanel from "./FiltersPanel";
import { kanjiPositionCategory } from "../graph/positionCategory";

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

function LoadingIndicator({ progress }) {
  const pct =
    progress && progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;
  return (
    <div className="loading-indicator">
      <div className="loading-indicator__bar">
        <div
          className={`loading-indicator__fill${pct === null ? " loading-indicator__fill--indeterminate" : ""}`}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
      <p className="loading-indicator__label">
        {pct !== null
          ? `Loading dictionary… ${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()} words`
          : "Loading word data…"}
      </p>
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
  datasetProgress,
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

  const toggleType = useCallback((key) => setTypeLegend((prev) => toggled(prev, key)), []);
  const toggleJlpt = useCallback((key) => setJlptLegend((prev) => toggled(prev, key)), []);
  const togglePosition = useCallback((key) => setPositionLegend((prev) => toggled(prev, key)), []);

  const showPositionLegend = hasPositionGroups(graph);

  const legendDimmed = useCallback(
    (node) => {
      if (!node.isRoot && typeLegend[node.type] === false) return true;
      if (colorByDifficulty && node.jlptBucket && jlptLegend[node.jlptBucket] === false) return true;
      if (showPositionLegend && node.type === "word" && graph) {
        const categories = wordPositionCategories(graph, node);
        if (categories.size > 0 && ![...categories].some((c) => positionLegend[c])) return true;
      }
      return false;
    },
    [typeLegend, jlptLegend, positionLegend, colorByDifficulty, showPositionLegend, graph]
  );

  const combinedIsDimmed = useCallback((node) => isDimmed(node) || legendDimmed(node), [isDimmed, legendDimmed]);

  return (
    <div className="graph-panel">
      <div className="graph-panel__toolbar">
        <span className="graph-panel__heading">Explore</span>
        <div className="graph-panel__toolbar-actions">
          <div className="filters-panel-wrap">
            <button
              className={`reset-btn filters-btn${filtersActive ? " is-active" : ""}`}
              onClick={onToggleFiltersPanel}
            >
              Filters
              {filtersActive && <span className="filters-btn__badge" />}
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
                onClose={onCloseFiltersPanel}
              />
            )}
          </div>
          <button className="reset-btn" onClick={onReset} title="Collapse back to just the root word">
            Reset
          </button>
        </div>
      </div>

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
        />
      ) : (
        <div className="graph-container graph-container--loading">
          <LoadingIndicator progress={datasetProgress} />
        </div>
      )}

      <div className="graph-panel__footer">
        <div className="legend">
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
          {showPositionLegend && (
            <>
              <span className="legend__divider" />
              <span className="legend__group-label">Position</span>
              <button
                type="button"
                className={`legend__row${positionLegend.start ? "" : " is-inactive"}`}
                onClick={() => togglePosition("start")}
                aria-pressed={positionLegend.start}
                title="Where the kanji sits in the word"
              >
                <span className="legend__swatch legend__swatch--line legend__swatch--pos-start" /> Start
              </button>
              <button
                type="button"
                className={`legend__row${positionLegend.middle ? "" : " is-inactive"}`}
                onClick={() => togglePosition("middle")}
                aria-pressed={positionLegend.middle}
                title="Where the kanji sits in the word"
              >
                <span className="legend__swatch legend__swatch--line legend__swatch--pos-middle" /> Middle
              </button>
              <button
                type="button"
                className={`legend__row${positionLegend.end ? "" : " is-inactive"}`}
                onClick={() => togglePosition("end")}
                aria-pressed={positionLegend.end}
                title="Where the kanji sits in the word"
              >
                <span className="legend__swatch legend__swatch--line legend__swatch--pos-end" /> End
              </button>
            </>
          )}
          {colorByDifficulty && (
            <>
              <span className="legend__divider" />
              <span className="legend__group-label">JLPT</span>
              {JLPT_LEGEND.map(({ value, label }) => (
                <button
                  type="button"
                  className={`legend__row${jlptLegend[value] ? "" : " is-inactive"}`}
                  onClick={() => toggleJlpt(value)}
                  aria-pressed={jlptLegend[value]}
                  key={value}
                >
                  <span className={`legend__swatch legend__swatch--ring legend__swatch--jlpt-${value}`} /> {label}
                </button>
              ))}
            </>
          )}
        </div>
        <p className="graph-panel__stats">
          {stats.words} words &middot; {stats.kanji} kanji shown
          {datasetSource === "local" && !datasetLoading ? " · local dataset" : ""}
          {datasetSource === "tiny-fallback" && !datasetLoading ? " · offline demo data" : ""}
        </p>
      </div>
    </div>
  );
}
