export default function DetailPanel({ node }) {
  if (!node) {
    return (
      <div className="detail-panel detail-panel--empty">
        <p>Click a node to see details.</p>
        <p className="hint">
          Blue circles are kanji components. Teal circles are words. Click an unexpanded node
          (dashed ring) to reveal what it connects to.
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
      </div>
    );
  }

  return (
    <div className="detail-panel">
      <div className="detail-panel__char">{node.word}</div>
      <div className="detail-panel__reading">{node.reading}</div>
      <div className="detail-panel__meaning">{node.meaning}</div>
    </div>
  );
}
