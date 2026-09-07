import { useCallback, useRef, useState } from "react";

const STORAGE_PREFIX = "word-tree:split-pane:";

function loadPct(key, fallback) {
  try {
    const n = Number(localStorage.getItem(STORAGE_PREFIX + key));
    return Number.isFinite(n) && n > 0 && n < 100 ? n : fallback;
  } catch {
    return fallback;
  }
}

function savePct(key, pct) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(pct));
  } catch {
    // localStorage unavailable -- the split ratio just won't persist
  }
}

/**
 * A two-pane layout with a drag-to-resize handle between them (like a
 * code editor's sidebar splitter) -- hand-rolled with pointer events,
 * the same pattern WordTreeGraph already uses for node dragging, rather
 * than pulling in a layout library for one draggable divider. The ratio
 * persists per `storageKey` so it survives a refresh. Below ~900px the
 * whole thing stacks vertically instead (see App.css) -- the handle is
 * simply hidden there rather than made touch-draggable, consistent with
 * this app's existing desktop-first stance.
 */
export default function SplitPane({ storageKey, defaultPct = 38, min = 24, max = 62, left, right }) {
  const containerRef = useRef(null);
  const [pct, setPct] = useState(() => loadPct(storageKey, defaultPct));
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(true);

      function onMove(ev) {
        const rect = containerRef.current.getBoundingClientRect();
        const nextPct = ((ev.clientX - rect.left) / rect.width) * 100;
        setPct(Math.min(max, Math.max(min, nextPct)));
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setIsDragging(false);
        setPct((current) => {
          savePct(storageKey, current);
          return current;
        });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [min, max, storageKey]
  );

  const handleDoubleClick = useCallback(() => {
    setPct(defaultPct);
    savePct(storageKey, defaultPct);
  }, [defaultPct, storageKey]);

  return (
    <div ref={containerRef} className={`split-pane${isDragging ? " is-dragging" : ""}`}>
      <div className="split-pane__left" style={{ width: `${pct}%` }}>
        {left}
      </div>
      <div
        className="split-pane__handle"
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        title="Drag to resize -- double-click to reset"
      />
      <div className="split-pane__right">{right}</div>
    </div>
  );
}
