import { useCallback, useEffect, useRef, useState } from "react";

// Anchored by selector, not ref, so this stays decoupled from every
// component it points at -- most of these are already-stable, semantic
// classes (search input, the dictionary panel, the Filters button); only
// the graph Reset button needed a dedicated data-tutorial hook (see
// GraphPanel.jsx), since "reset-btn" alone is shared with two other
// buttons. ".graph-node--kanji" matches whichever kanji happens to be
// first in the DOM -- fine, since the point is just "a kanji node", not a
// specific one.
const STEPS = [
  {
    target: ".search-bar input",
    title: "Search",
    body: 'Type a word in kanji, kana, or romaji ("shitsumon" finds 質問) to jump straight to it.',
    placement: "bottom",
  },
  {
    target: ".graph-node.is-root",
    title: "Your word",
    body: "Every search starts here, at the center. Click any node to see its full entry on the left.",
    placement: "right",
  },
  {
    target: ".graph-node--kanji",
    title: "Its kanji",
    body: "Double-click a kanji node to reveal every other word built from that same kanji.",
    placement: "right",
  },
  {
    target: ".dictionary-panel",
    title: "Dictionary panel",
    body: "Definitions, readings, and JLPT level for whatever's currently selected on the graph.",
    placement: "right",
  },
  {
    target: ".filters-btn",
    title: "Filters",
    body: "Narrow what's shown by mastery or JLPT level, or turn on extra graph coloring.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='graph-reset-btn']",
    title: "Reset",
    body: "Collapses the graph back down to just your starting word.",
    placement: "bottom",
  },
];

const SPOTLIGHT_PAD = 8;
const TOOLTIP_WIDTH = 280;
const VIEWPORT_MARGIN = 12;
const GAP = 14;

// Re-measured every animation frame rather than once (or only on
// resize/scroll): the graph-node steps point at nodes that keep drifting
// under the d3-force simulation even at rest (drag, expansion elsewhere,
// window resize all nudge it), so a one-shot measurement would drift out
// of sync with the actual node within a second or two.
function useTrackedRect(selector) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    let raf;
    const measure = () => {
      const el = document.querySelector(selector);
      setRect((prev) => {
        const next = el?.getBoundingClientRect();
        if (!next) return null;
        if (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height) {
          return prev; // same rect -- keep the old object so effects depending on it don't re-fire needlessly
        }
        return next;
      });
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  return rect;
}

function tooltipPosition(rect, placement, tooltipHeight) {
  if (!rect) {
    return { top: window.innerHeight / 2 - tooltipHeight / 2, left: window.innerWidth / 2 - TOOLTIP_WIDTH / 2 };
  }
  let top;
  let left;
  if (placement === "right") {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.right + GAP;
    if (left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) left = rect.left - GAP - TOOLTIP_WIDTH;
  } else {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    if (top + tooltipHeight > window.innerHeight - VIEWPORT_MARGIN) top = rect.top - GAP - tooltipHeight;
  }
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - tooltipHeight - VIEWPORT_MARGIN);
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN);
  return { top, left };
}

/**
 * A live, spotlight-style walkthrough over the running app -- not a
 * separate slideshow -- anchored to real DOM elements via CSS selectors
 * (see STEPS). Hand-rolled rather than a library: the app has zero UI
 * dependencies today, the design system is small and specific enough that
 * reskinning a library would cost more than writing this, and the
 * graph-node steps need continuous re-measurement no off-the-shelf tour
 * library provides out of the box anyway (see useTrackedRect).
 */
export default function Tutorial({ onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltipHeight, setTooltipHeight] = useState(160);
  const dialogRef = useRef(null);
  const tooltipRef = useRef(null);
  const previousFocusRef = useRef(null);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const rect = useTrackedRect(step.target);

  // Restore focus to whatever launched the tour once it closes -- same
  // "give focus back to the trigger" expectation as any other dialog.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) previousFocusRef.current.focus();
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    if (tooltipRef.current) setTooltipHeight(tooltipRef.current.offsetHeight);
  }, [step]);

  const close = useCallback(() => onClose(), [onClose]);
  const goNext = useCallback(() => {
    if (isLast) close();
    else setStepIndex((i) => i + 1);
  }, [isLast, close]);
  const goBack = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
        return;
      }
      if (e.key === "Tab") {
        const focusables = dialogRef.current?.querySelectorAll("button");
        if (!focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [close, goNext, goBack]
  );

  const { top, left } = tooltipPosition(rect, step.placement, tooltipHeight);

  return (
    <div className="tutorial-overlay" onKeyDown={handleKeyDown}>
      {rect && (
        <div
          className="tutorial-spotlight"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
          }}
        />
      )}
      <div
        ref={(el) => {
          dialogRef.current = el;
          tooltipRef.current = el;
        }}
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-body"
        tabIndex={-1}
        style={{ top, left, width: TOOLTIP_WIDTH }}
      >
        <div className="tutorial-card__step" aria-live="polite">
          {stepIndex + 1} of {STEPS.length}
        </div>
        <h3 id="tutorial-title" className="tutorial-card__title">
          {step.title}
        </h3>
        <p id="tutorial-body" className="tutorial-card__body">
          {step.body}
        </p>
        <div className="tutorial-card__actions">
          <button type="button" className="tutorial-card__skip" onClick={close}>
            {isLast ? "Close" : "Skip"}
          </button>
          <div className="tutorial-card__nav">
            {stepIndex > 0 && (
              <button type="button" className="tutorial-card__back" onClick={goBack}>
                Back
              </button>
            )}
            <button type="button" className="tutorial-card__next" onClick={goNext}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
