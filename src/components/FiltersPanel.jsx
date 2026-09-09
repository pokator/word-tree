const MASTERY_OPTIONS = [
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "known", label: "Known" },
];

const JLPT_OPTIONS = [
  { value: "n5", label: "N5" },
  { value: "n4", label: "N4" },
  { value: "n3", label: "N3" },
  { value: "n2", label: "N2" },
  { value: "n1", label: "N1" },
  { value: "unrated", label: "Other" },
];

const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];

export default function FiltersPanel({
  masteryFilter,
  onToggleMastery,
  jlptFilter,
  onToggleJlpt,
  groups,
  focusGroupId,
  onSetFocusGroup,
  maxWords,
  onSetMaxWords,
  colorByDifficulty,
  onToggleColorByDifficulty,
  onClose,
}) {
  return (
    <div className="filters-panel">
      <div className="filters-panel__section">
        <span className="filters-panel__label">Show mastery</span>
        <div className="filters-panel__chips">
          {MASTERY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`filters-panel__chip filters-panel__chip--${value}${
                masteryFilter[value] ? " is-active" : ""
              }`}
              onClick={() => onToggleMastery(value)}
              aria-pressed={masteryFilter[value]}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="filters-panel__section">
        <span className="filters-panel__label">JLPT level</span>
        <div className="filters-panel__chips filters-panel__chips--wrap">
          {JLPT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`filters-panel__chip filters-panel__chip--jlpt${jlptFilter[value] ? " is-active" : ""}`}
              onClick={() => onToggleJlpt(value)}
              aria-pressed={jlptFilter[value]}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="filters-panel__hint">
          Based on a word&rsquo;s hardest kanji. Narrowing this limits new reveals. Click Reset to fully apply.
        </p>
      </div>

      <div className="filters-panel__section">
        <span className="filters-panel__label">Graph coloring</span>
        <div className="filters-panel__chips">
          <button
            type="button"
            className={`filters-panel__chip${colorByDifficulty ? " is-active" : ""}`}
            onClick={onToggleColorByDifficulty}
            aria-pressed={colorByDifficulty}
          >
            Color by JLPT Level
          </button>
        </div>
      </div>

      <div className="filters-panel__section">
        <span className="filters-panel__label">Focus on group</span>
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
        {groups.length === 0 && <p className="filters-panel__hint">Create a group to focus on it here.</p>}
      </div>

      <div className="filters-panel__section">
        <span className="filters-panel__label">Words per branch</span>
        <select value={maxWords === Infinity ? "all" : maxWords} onChange={(e) => onSetMaxWords(e.target.value)}>
          {MAX_WORDS_OPTIONS.map((n) => (
            <option key={n} value={n === Infinity ? "all" : n}>
              {n === Infinity ? "All" : n}
            </option>
          ))}
        </select>
        <p className="filters-panel__hint">How many words a kanji click reveals at once.</p>
      </div>

      <button type="button" className="filters-panel__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
