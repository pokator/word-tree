import WordTreeGraph from "./WordTreeGraph";
import FiltersPanel from "./FiltersPanel";

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
