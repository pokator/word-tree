import { useCallback, useEffect, useRef, useState } from "react";

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

function firstGloss(node) {
  if (!node || node.type === "kanji") return node?.meaning ?? "";
  return node.senses?.[0]?.gloss?.join("; ") ?? node.meaning?.split(";")[0] ?? "";
}

function Chevron({ up }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className="mobile-toggle__chevron">
      <path
        d={up ? "M5 12.5l5-5 5 5" : "M5 7.5l5 5 5-5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The main two-pane layout, in both of its shapes:
 *
 *  - Desktop: side by side, with a drag-to-resize handle between them (like
 *    a code editor's sidebar splitter) -- hand-rolled with pointer events,
 *    the same pattern WordTreeGraph uses for node dragging. The ratio
 *    persists per `storageKey`; double-click the handle to reset it.
 *  - Phone (`mobile`): stacked, exactly one pane expanded at a time. The
 *    collapsed pane shrinks to a single bar that is also its own toggle --
 *    the definition strip (just the active word) at the bottom of its
 *    section, the Explore bar at the top of its section (pinned to the
 *    bottom of the screen) -- so there's one control on the boundary
 *    between them, not two that do the same thing.
 *
 * One component for both, deliberately: the right pane (the graph) sits at
 * the same place in the element tree in either shape, so crossing the
 * breakpoint (resizing a window, rotating a tablet) keeps it mounted --
 * node positions, zoom, and dragged-apart links survive -- and it stays
 * mounted while collapsed on a phone (hidden, not removed) for the same
 * reason.
 */
export default function PaneLayout({
  mobile,
  view,
  onChangeView,
  node,
  storageKey,
  defaultPct = 38,
  min = 24,
  max = 62,
  left,
  right,
}) {
  const containerRef = useRef(null);
  const [pct, setPct] = useState(() => loadPct(storageKey, defaultPct));
  const [isDragging, setIsDragging] = useState(false);
  const isExplore = view === "explore";

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

  // On a phone, the toggle you just pressed unmounts as the view flips,
  // which would drop keyboard/screen-reader focus to <body> -- hand it to
  // the pane that just expanded instead. Skipped on first render and on
  // breakpoint crossings (nothing was pressed).
  const leftBodyRef = useRef(null);
  const rightBodyRef = useRef(null);
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    if (mobile) (isExplore ? rightBodyRef : leftBodyRef).current?.focus({ preventScroll: true });
  }, [view, isExplore, mobile]);

  const headword = node ? (node.type === "kanji" ? node.char : node.word) : null;
  const reading = node?.type === "word" ? node.reading : (node?.onyomi?.[0] ?? node?.kunyomi?.[0]);
  const gloss = firstGloss(node);
  const showStrip = mobile && isExplore;
  const showExploreBar = mobile && !isExplore;

  // Every slot below renders in both shapes (null where unused) so the
  // right pane's position in the tree never shifts -- see the doc comment.
  return (
    <div
      ref={containerRef}
      className={
        mobile ? `mobile-layout mobile-layout--${view}` : `split-pane${isDragging ? " is-dragging" : ""}`
      }
    >
      <div
        className={mobile ? "mobile-layout__definitions" : "split-pane__left"}
        style={mobile ? undefined : { width: `${pct}%` }}
        role={mobile ? "region" : undefined}
        aria-label={mobile ? "Definition" : undefined}
      >
        {showStrip ? (
          <button
            type="button"
            className="mobile-strip"
            onClick={() => onChangeView("definitions")}
            aria-expanded="false"
            aria-controls="pane-definitions"
            aria-label={headword ? `Show full definition of ${headword}` : "Show definition"}
          >
            <span className="mobile-strip__word">{headword ?? "—"}</span>
            {reading && <span className="mobile-strip__reading">{reading}</span>}
            {gloss && <span className="mobile-strip__gloss">{gloss}</span>}
            <span className="mobile-toggle mobile-toggle--bottom">
              <Chevron />
            </span>
          </button>
        ) : (
          <div
            className={mobile ? "mobile-layout__definitions-body" : "split-pane__left-body"}
            id="pane-definitions"
            ref={leftBodyRef}
            tabIndex={mobile ? -1 : undefined}
          >
            {left}
          </div>
        )}
      </div>

      {mobile ? null : (
        <div
          className="split-pane__handle"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          title="Drag to resize -- double-click to reset"
        />
      )}

      <div
        className={mobile ? "mobile-layout__explore" : "split-pane__right"}
        role={mobile ? "region" : undefined}
        aria-label={mobile ? "Explore" : undefined}
      >
        {showExploreBar ? (
          <button
            type="button"
            className="mobile-explore-bar"
            onClick={() => onChangeView("explore")}
            aria-expanded="false"
            aria-controls="pane-explore"
          >
            <span className="mobile-toggle mobile-toggle--top">
              <Chevron up />
            </span>
            <span className="mobile-explore-bar__label">Explore</span>
          </button>
        ) : null}
        <div
          className={mobile ? "mobile-layout__explore-body" : "split-pane__right-body"}
          id="pane-explore"
          ref={rightBodyRef}
          tabIndex={mobile ? -1 : undefined}
          hidden={showExploreBar}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
