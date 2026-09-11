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
 *
 * aria-modal="true" below is backed by a real modal boundary, not just an
 * assertion: App.jsx marks the header and main content `inert` while this
 * is mounted, so the rest of the app is unfocusable and hidden from
 * assistive tech, not merely visually dimmed and click-blocked.
 */
export default function Tutorial({ onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltipHeight, setTooltipHeight] = useState(160);
  const dialogRef = useRef(null);
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
    if (dialogRef.current) setTooltipHeight(dialogRef.current.offsetHeight);
  }, [step]);

  const goNext = useCallback(() => {
    if (isLast) onClose();
    else setStepIndex((i) => i + 1);
  }, [isLast, onClose]);
  const goBack = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  // Attached to `document`, not the overlay's own onKeyDown -- the overlay
  // is a full-viewport, background-less click-catcher (it has to be, to
  // block interaction with the app underneath during the tour), so a
  // single click on the dim area moves focus to <body> and a JSX-level
  // handler on the card/overlay would simply stop receiving key events at
  // that point, permanently deafening Escape. No Enter handling here on
  // purpose: a focused button already activates on Enter natively, and a
  // parent-level keydown handler calling preventDefault() would suppress
  // that native activation before it fires, which is exactly what made
  // Enter silently hijack Back/Skip into "advance" instead of their own
  // action.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
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
        const dialog = dialogRef.current;
        const focusables = dialog?.querySelectorAll("button");
        if (!dialog || !focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        // Focus already escaped the dialog (e.g. a click on the dim
        // backdrop moved it to <body>) -- pull it back in rather than
        // letting Tab continue wandering the app underneath.
        if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goBack]);

  const { top, left } = tooltipPosition(rect, step.placement, tooltipHeight);

  return (
    <div className="tutorial-overlay">
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
        ref={dialogRef}
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-body"
        tabIndex={-1}
        style={{ top, left, width: TOOLTIP_WIDTH }}
      >
        {/* One live region around the step count AND the content that
            changes with it -- an aria-live scoped to just the counter
            announced "2 of 6" on every step and nothing about what the
            step actually says. */}
        <div aria-live="polite">
          <div className="tutorial-card__step">
            {stepIndex + 1} of {STEPS.length}
          </div>
          <h3 id="tutorial-title" className="tutorial-card__title">
            {step.title}
          </h3>
          <p id="tutorial-body" className="tutorial-card__body">
            {step.body}
          </p>
        </div>
        <div className="tutorial-card__actions">
          <button type="button" className="tutorial-card__skip" onClick={onClose}>
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
