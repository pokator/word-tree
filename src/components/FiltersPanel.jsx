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
  { value: "unrated", label: "—", title: "Unrated" },
];

const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];

const LINK_COLOR_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "position", label: "Position" },
  { value: "reading", label: "Reading" },
];

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
  linkColorMode,
  onSetLinkColorMode,
  colorByKanjiPath,
  onToggleColorByKanjiPath,
  onClose,
}) {
  return (
    <div className="filters-panel">
      <div className="filters-panel__section">
        <span className="filters-panel__label">Mastery</span>
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
          <button
            type="button"
            className={`filters-panel__chip${colorByKanjiPath ? " is-active" : ""}`}
            onClick={onToggleColorByKanjiPath}
            aria-pressed={colorByKanjiPath}
            title="Highlight the selected word's component kanji"
          >
            Kanji path
          </button>
        </div>
      </div>

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

      <div className="filters-panel__section">
        <span className="filters-panel__label">Group focus</span>
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
        {groups.length === 0 && <p className="filters-panel__hint">Create a group first.</p>}
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
      </div>

      <button type="button" className="filters-panel__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
