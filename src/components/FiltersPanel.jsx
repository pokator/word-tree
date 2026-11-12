import { commonnessLabel } from "../graph/commonness";

const JLPT_OPTIONS = [
  { value: "n5", label: "N5" },
  { value: "n4", label: "N4" },
  { value: "n3", label: "N3" },
  { value: "n2", label: "N2" },
  { value: "n1", label: "N1" },
  { value: "unrated", label: "—", title: "Unrated" },
];

const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];

const MODE_SWITCH_OPTIONS = [
  { value: "separate", label: "Separate graphs" },
  { value: "mixed", label: "One graph" },
];

const LINK_COLOR_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "position", label: "Position" },
  { value: "reading", label: "Reading" },
];

/**
 * What the graph shows, per mode. Both modes share Commonness, JLPT level,
 * JLPT coloring, Tag focus and words per branch. Kanji path and Link
 * pattern only describe kanji<->word links, so they're kanji-mode only
 * (and switched off in meaning mode -- see GraphPanel).
 */
export default function FiltersPanel({
  mode = "kanji",
  commonness = 0,
  onSetCommonness,
  modeSwitch = "separate",
  onSetModeSwitch,
  jlptFilter,
  onToggleJlpt,
  groups,
  focusGroupId,
  onSetFocusGroup,
  maxWords,
  onSetMaxWords,
  colorByDifficulty,
  onToggleColorByDifficulty,
  linkColorMode,
  onSetLinkColorMode,
  colorByKanjiPath,
  onToggleColorByKanjiPath,
  onClose,
}) {
  const meaning = mode === "meaning";
  return (
    <div className="filters-panel" data-mode={mode}>
      {onSetCommonness && (
        <div className="filters-panel__section">
          <div className="filters-panel__label-row">
            <label className="filters-panel__label" htmlFor="filters-commonness">
              Commonness
            </label>
            <span className="filters-panel__value" aria-hidden="true">
              {commonnessLabel(commonness)}
            </span>
          </div>
          <input
            id="filters-commonness"
            className="filters-panel__range"
            type="range"
            min="0"
            max="100"
            step="10"
            value={commonness}
            aria-valuetext={commonnessLabel(commonness)}
            onChange={(e) => onSetCommonness(Number(e.target.value))}
          />
          <div className="filters-panel__range-ends" aria-hidden="true">
            <span>Familiar</span>
            <span>Adventurous</span>
          </div>
          <p className="filters-panel__hint">
            {meaning ? "Everyday words, or rarer ones." : "Which words each kanji shows first."} Reset to redo this
            graph.
          </p>
        </div>
      )}

      <div className="filters-panel__section">
        <span className="filters-panel__label">JLPT level</span>
        <div className="filters-panel__chips filters-panel__chips--jlpt">
          {JLPT_OPTIONS.map(({ value, label, title }) => (
            <button
              key={value}
              type="button"
              className={`filters-panel__chip filters-panel__chip--jlpt${jlptFilter[value] ? " is-active" : ""}`}
              onClick={() => onToggleJlpt(value)}
              aria-pressed={jlptFilter[value]}
              title={title ? `${title} -- based on hardest kanji` : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="filters-panel__hint">Based on hardest kanji. Reset re-applies.</p>
      </div>

      <div className="filters-panel__section">
        <span className="filters-panel__label">Coloring</span>
        <div className="filters-panel__chips">
          <button
            type="button"
            className={`filters-panel__chip${colorByDifficulty ? " is-active" : ""}`}
            onClick={onToggleColorByDifficulty}
            aria-pressed={colorByDifficulty}
            title="Fill each node by its JLPT difficulty"
          >
            JLPT
          </button>
          {!meaning && (
            <button
              type="button"
              className={`filters-panel__chip${colorByKanjiPath ? " is-active" : ""}`}
              onClick={onToggleColorByKanjiPath}
              aria-pressed={colorByKanjiPath}
              title="Highlight the selected word's component kanji"
            >
              Kanji path
            </button>
          )}
        </div>
      </div>

      {!meaning && (
        <div className="filters-panel__section">
          <span id="link-pattern-label" className="filters-panel__label">
            Link pattern
          </span>
          {/* Off/Position/Reading are mutually exclusive -- role="radio", not
              aria-pressed on plain buttons, so assistive tech reports that
              picking one clears the others instead of three independent
              toggles. */}
          <div className="filters-panel__chips" role="radiogroup" aria-labelledby="link-pattern-label">
            {LINK_COLOR_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                className={`filters-panel__chip${linkColorMode === value ? " is-active" : ""}`}
                onClick={() => onSetLinkColorMode(value)}
                aria-checked={linkColorMode === value}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="filters-panel__hint">Dashes mark kanji position or reading type.</p>
        </div>
      )}

      <div className="filters-panel__section">
        <span className="filters-panel__label">Tag focus</span>
        <select
          value={focusGroupId ?? ""}
          onChange={(e) => onSetFocusGroup(e.target.value || null)}
          disabled={groups.length === 0}
        >
          <option value="">All words</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {groups.length === 0 && <p className="filters-panel__hint">Tag a bookmarked word first.</p>}
      </div>

      <div className="filters-panel__section">
        <span className="filters-panel__label">{meaning ? "Words per expansion" : "Words per branch"}</span>
        <select value={maxWords === Infinity ? "all" : maxWords} onChange={(e) => onSetMaxWords(e.target.value)}>
          {MAX_WORDS_OPTIONS.map((n) => (
            <option key={n} value={n === Infinity ? "all" : n}>
              {n === Infinity ? "All" : n}
            </option>
          ))}
        </select>
      </div>

      {onSetModeSwitch && (
        <div className="filters-panel__section filters-panel__section--experiment">
          <span id="mode-switch-label" className="filters-panel__label">
            Switching modes <span className="beta-tag">Beta</span>
          </span>
          <div className="filters-panel__chips" role="radiogroup" aria-labelledby="mode-switch-label">
            {MODE_SWITCH_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                className={`filters-panel__chip${modeSwitch === value ? " is-active" : ""}`}
                onClick={() => onSetModeSwitch(value)}
                aria-checked={modeSwitch === value}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="filters-panel__hint">
            {modeSwitch === "mixed" ? "Both modes build on this graph." : "Each mode keeps its own graph."}
          </p>
        </div>
      )}

      <button type="button" className="filters-panel__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
