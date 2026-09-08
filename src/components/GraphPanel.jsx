import WordTreeGraph from "./WordTreeGraph";
import FiltersPanel from "./FiltersPanel";

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
  { value: "unrated", label: "unrated" },
];

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
          isDimmed={isDimmed}
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
            <span className="legend__swatch legend__swatch--root" /> root
          </span>
          <span className="legend__row">
            <span className="legend__swatch legend__swatch--word" /> word
          </span>
          <span className="legend__row">
            <span className="legend__swatch legend__swatch--kanji" /> kanji
          </span>
          {hasPositionGroups(graph) && (
            <>
              <span className="legend__divider" />
              <span className="legend__row">
                <span className="legend__swatch legend__swatch--line legend__swatch--pos-start" /> kanji at start
              </span>
              <span className="legend__row">
                <span className="legend__swatch legend__swatch--line legend__swatch--pos-middle" /> at middle
              </span>
              <span className="legend__row">
                <span className="legend__swatch legend__swatch--line legend__swatch--pos-end" /> at end
              </span>
            </>
          )}
          {colorByDifficulty && (
            <>
              <span className="legend__divider" />
              {JLPT_LEGEND.map(({ value, label }) => (
                <span className="legend__row" key={value}>
                  <span className={`legend__swatch legend__swatch--ring legend__swatch--jlpt-${value}`} /> {label}
                </span>
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
