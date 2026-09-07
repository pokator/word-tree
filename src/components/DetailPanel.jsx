const MASTERY_LABELS = { new: "New", learning: "Learning", known: "Known" };

function MasteryControl({ status, onSetStatus }) {
  return (
    <div className="mastery-control" role="group" aria-label="Mastery status">
      {Object.entries(MASTERY_LABELS).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`mastery-control__btn${status === value ? " is-active" : ""}`}
          onClick={() => onSetStatus(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SaveToggle({ canSave, isSaved, onToggleSave }) {
  if (!canSave) {
    return <p className="save-toggle__hint">Sign in to save words for export.</p>;
  }
  return (
    <button
      type="button"
      className={`save-toggle${isSaved ? " is-active" : ""}`}
      onClick={onToggleSave}
      aria-pressed={isSaved}
    >
      {isSaved ? "Saved for Anki" : "Save for Anki"}
    </button>
  );
}

export default function DetailPanel({ node, status, onSetStatus, canSave, isSaved, onToggleSave }) {
  if (!node) {
    return (
      <div className="detail-panel detail-panel--empty">
        <p>Click a node to see details.</p>
        <p className="hint">
          See the legend below for what each color means. Click an unexpanded node (dashed ring)
          to reveal what it connects to.
        </p>
      </div>
    );
  }

  if (node.type === "kanji") {
    return (
      <div className="detail-panel">
        <div className="detail-panel__char">{node.char}</div>
        <div className="detail-panel__meaning">{node.meaning}</div>
        {node.onyomi?.length > 0 && (
          <div className="detail-panel__row">
            <span className="detail-panel__label">On'yomi</span>
            <span>{node.onyomi.join("、")}</span>
          </div>
        )}
        {node.kunyomi?.length > 0 && (
          <div className="detail-panel__row">
            <span className="detail-panel__label">Kun'yomi</span>
            <span>{node.kunyomi.join("、")}</span>
          </div>
        )}
        <MasteryControl status={status} onSetStatus={onSetStatus} />
      </div>
    );
  }

  return (
    <div className="detail-panel">
      <div className="detail-panel__char">{node.word}</div>
      <div className="detail-panel__reading">{node.reading}</div>
      <div className="detail-panel__meaning">{node.meaning}</div>
      <MasteryControl status={status} onSetStatus={onSetStatus} />
      <SaveToggle canSave={canSave} isSaved={isSaved} onToggleSave={onToggleSave} />
    </div>
  );
}
