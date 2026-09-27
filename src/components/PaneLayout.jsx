import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "word-tree:split-pane:";
const VERTICAL_MIN = 20;
const VERTICAL_MAX = 55;

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

const CHEVRON_PATHS = {
  up: "M5 12.5l5-5 5 5",
  down: "M5 7.5l5 5 5-5",
  right: "M7.5 5l5 5-5 5",
  left: "M12.5 5l-5 5 5 5",
};

function Chevron({ dir }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className="mobile-toggle__chevron">
      <path
        d={CHEVRON_PATHS[dir]}
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
 * The main two-pane layout, in each of its shapes (`mode`, see
 * lib/useLayoutMode.js):
 *
 *  - "desktop": side by side, with a drag-to-resize handle between them
 *    (like a code editor's sidebar splitter) -- hand-rolled with pointer
 *    events, the same pattern WordTreeGraph uses for node dragging. The
 *    ratio persists per `storageKey`; double-click the handle to reset it.
 *  - "tablet": the same splitter turned on its side -- definition on top,
 *    graph below, both always visible, divider dragged vertically.
 *  - "phone": stacked, exactly one pane expanded at a time. The collapsed
 *    pane shrinks to a single bar that is also its own toggle -- the
 *    definition strip (just the active word) at the bottom of its section,
 *    the Explore bar at the top of its section (pinned to the bottom of the
 *    screen) -- so there's one control on the boundary between them, not
 *    two that do the same thing.
 *  - "rail": short landscape screens. The definition lives in a left rail
 *    under the header (App.css lays header + panes out as one grid), and
 *    the graph takes the full height beside it. Same two views as the
 *    phone, sideways: collapsed, the rail shows just the active word;
 *    expanded, it widens to hold the full entry, graph still visible.
 *
 * One component for all of them, deliberately: the right pane (the graph)
 * sits at the same place in the element tree in every shape, so switching
 * shapes (resizing a window, rotating a device) keeps it mounted -- node
 * positions, zoom, and dragged-apart links survive -- and it stays mounted
 * while collapsed on a phone (hidden, not removed) for the same reason.
 */
export default function PaneLayout({
  mode,
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
  const vertical = mode === "tablet";
  const split = mode === "desktop" || vertical;
  const toggled = mode === "phone" || mode === "rail";
  const isExplore = view === "explore";

  // A comfortable width split and a comfortable height split aren't the
  // same number, so each orientation keeps its own saved ratio.
  const splitKey = vertical ? `${storageKey}-vertical` : storageKey;
  const [pctByKey, setPctByKey] = useState(() => ({
    [storageKey]: loadPct(storageKey, defaultPct),
    [`${storageKey}-vertical`]: loadPct(`${storageKey}-vertical`, defaultPct),
  }));
  // Clamped on read too: a ratio saved under older limits still has to
  // leave the graph usable.
  const pct = vertical
    ? Math.min(VERTICAL_MAX, Math.max(VERTICAL_MIN, pctByKey[splitKey]))
    : pctByKey[splitKey];
  const [isDragging, setIsDragging] = useState(false);

  // The stacked tablet split keeps the graph from being squeezed below a
  // usable height (its toolbar and footer alone take ~90px).
  const lo = vertical ? VERTICAL_MIN : min;
  const hi = vertical ? VERTICAL_MAX : max;

  // Tears down an in-progress drag -- on release, on a cancelled touch
  // (a system gesture, palm rejection), and on unmount -- so a drag can
  // never be left "stuck" resizing on the next unrelated touch.
  const endDragRef = useRef(null);
  useEffect(() => () => endDragRef.current?.(), []);

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      endDragRef.current?.();
      const handle = e.currentTarget;
      const pointerId = e.pointerId;
      handle.setPointerCapture?.(pointerId);
      setIsDragging(true);
      let latest = null;

      function onMove(ev) {
        if (ev.pointerId !== pointerId) return;
        const rect = containerRef.current.getBoundingClientRect();
        const raw = vertical
          ? ((ev.clientY - rect.top) / rect.height) * 100
          : ((ev.clientX - rect.left) / rect.width) * 100;
        latest = Math.min(hi, Math.max(lo, raw));
        setPctByKey((prev) => ({ ...prev, [splitKey]: latest }));
      }
      function end(ev) {
        if (ev && ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        endDragRef.current = null;
        setIsDragging(false);
        if (latest !== null) savePct(splitKey, latest);
      }
      endDragRef.current = () => end();
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [lo, hi, splitKey, vertical]
  );

  const handleDoubleClick = useCallback(() => {
    setPctByKey((prev) => ({ ...prev, [splitKey]: defaultPct }));
    savePct(splitKey, defaultPct);
  }, [defaultPct, splitKey]);

  // In the toggled shapes, the toggle you just pressed unmounts as the view
  // flips, which would drop keyboard/screen-reader focus to <body> -- hand
  // it to the pane that just expanded instead. Skipped on first render and
  // on shape changes (nothing was pressed).
  const leftBodyRef = useRef(null);
  const rightBodyRef = useRef(null);
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    if (toggled) (isExplore ? rightBodyRef : leftBodyRef).current?.focus({ preventScroll: true });
  }, [view, isExplore, toggled]);

  const headword = node ? (node.type === "kanji" ? node.char : node.word) : null;
  const reading = node?.type === "word" ? node.reading : (node?.onyomi?.[0] ?? node?.kunyomi?.[0]);
  const gloss = firstGloss(node);
  const showStrip = toggled && isExplore;
  // Only the phone hides the graph -- the rail has room for both.
  const showExploreBar = mode === "phone" && !isExplore;
  const prefix = mode === "rail" ? "rail-layout" : "mobile-layout";

  const containerClass = split
    ? `split-pane${vertical ? " split-pane--vertical" : ""}${isDragging ? " is-dragging" : ""}`
    : `${prefix} ${prefix}--${view}`;
  let leftStyle;
  if (split) leftStyle = vertical ? { height: `${pct}%` } : { width: `${pct}%` };

  // Every slot below renders in every shape (null where unused) so the
  // right pane's position in the tree never shifts -- see the doc comment.
  return (
    <div ref={containerRef} className={containerClass}>
      <div
        className={split ? "split-pane__left" : `${prefix}__definitions`}
        style={leftStyle}
        role={toggled ? "region" : undefined}
        aria-label={toggled ? "Definition" : undefined}
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
              <Chevron dir={mode === "rail" ? "right" : "down"} />
            </span>
          </button>
        ) : (
          <div
            className={split ? "split-pane__left-body" : `${prefix}__definitions-body`}
            id="pane-definitions"
            ref={leftBodyRef}
            tabIndex={toggled ? -1 : undefined}
          >
            {mode === "rail" && (
              <button type="button" className="rail-collapse" onClick={() => onChangeView("explore")}>
                <Chevron dir="left" />
                Hide details
              </button>
            )}
            {left}
          </div>
        )}
      </div>

      {split ? (
        <div
          className="split-pane__handle"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          role="separator"
          aria-orientation={vertical ? "horizontal" : "vertical"}
          aria-label="Resize panels"
          title="Drag to resize -- double-click to reset"
        />
      ) : null}

      <div
        className={split ? "split-pane__right" : `${prefix}__explore`}
        role={toggled ? "region" : undefined}
        aria-label={toggled ? "Explore" : undefined}
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
              <Chevron dir="up" />
            </span>
            <span className="mobile-explore-bar__label">Explore</span>
          </button>
        ) : null}
        <div
          className={split ? "split-pane__right-body" : `${prefix}__explore-body`}
          id="pane-explore"
          ref={rightBodyRef}
          tabIndex={toggled ? -1 : undefined}
          hidden={showExploreBar}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
