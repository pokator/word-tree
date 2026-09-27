import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Anchored by selector, not ref, so this stays decoupled from every
// component it points at -- most of these are already-stable, semantic
// classes (search input, the dictionary panel, the Filters button); only
// the graph Reset button needed a dedicated data-tutorial hook (see
// GraphPanel.jsx), since "reset-btn" alone is shared with two other
// buttons. ".graph-node--kanji" matches whichever kanji happens to be
// first in the DOM -- fine, since the point is just "a kanji node", not a
// specific one.
//
// The two graph-node steps target the inner `__fill` circle, not the
// `.graph-node` group itself: the root starts out selected, and a
// selected node's group also contains the blurred `__select-glow`
// sibling circle (see App.css's select-glow-breathe), which scales up to
// 1.12x on a 2.4s loop purely for decoration. That animation changes the
// GROUP's bounding rect every frame, and useTrackedRect below re-measures
// every frame too -- so pointing at the group made the step-2 spotlight
// visibly pulse and re-render in lockstep with the glow. `__fill` has
// fixed geometry regardless of selection, so the spotlight stays calm.
//
// Per layout (the `layout` prop, see lib/useLayoutMode.js): on any touch
// layout (everything but desktop) a step's `touch` fields override its
// desktop ones -- taps rather than clicks, the ☰ menu instead of the
// desktop toolbar (`touchOnly` steps), and every tooltip above/below its
// target since there's no room beside one. Where the dictionary collapses
// to the word strip (phone, rail -- the tour opens on that view, see
// PaneLayout), `strip` fields override on top of that.
const STEPS = [
  {
    target: ".search-bar input",
    title: "Search",
    body: 'Type a word in kanji, kana, or romaji ("shitsumon" finds 質問) to jump straight to it.',
    placement: "bottom",
  },
  {
    target: ".graph-node.is-root .graph-node__fill",
    title: "Your word",
    body: "Every search starts here, at the center. Click any node to see its full entry on the left.",
    placement: "right",
    touch: { body: "Every search starts here, at the center. Tap any node to select it." },
  },
  {
    target: ".graph-node--kanji .graph-node__fill",
    title: "Its kanji",
    body: "Double-click a kanji node to reveal every other word built from that same kanji.",
    placement: "right",
    touch: {
      body: "Double-tap a kanji node, or press and hold it, to reveal every other word built from that same kanji.",
    },
  },
  {
    target: ".dictionary-panel",
    title: "Dictionary panel",
    body: "Definitions, readings, and JLPT level for whatever's currently selected on the graph.",
    placement: "right",
    // The stacked tablet split scrolls the dictionary inside its pane --
    // spotlight the pane (what's actually on screen), not the whole
    // scrolling panel, which runs on past the divider.
    tablet: { target: ".split-pane__left" },
    strip: {
      target: ".mobile-strip",
      title: "The selected word",
      body: "Whatever you've selected shows up here. Tap it for the full entry: definitions, readings, and kanji.",
    },
  },
  {
    target: ".filters-btn",
    title: "Filters",
    body: "Narrow what's shown by JLPT level or tag, or turn on extra graph coloring.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='graph-reset-btn']",
    title: "Reset",
    body: "Collapses the graph back down to just your starting word.",
    placement: "bottom",
  },
  {
    touchOnly: true,
    target: ".mobile-menu__trigger",
    title: "Menu",
    body: "Bookmarks, Review in Anki, the theme, and this tour live here.",
    placement: "bottom",
  },
];

function stepsFor(layout) {
  const touch = layout !== "desktop";
  const strip = layout === "phone" || layout === "rail";
  return STEPS.filter((s) => touch || !s.touchOnly).map((s) =>
    touch
      ? { ...s, placement: "bottom", ...s.touch, ...(strip ? s.strip : null), ...(layout === "tablet" ? s.tablet : null) }
      : s
  );
}

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

function tooltipWidth() {
  return Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
}

function tooltipPosition(rect, placement, tooltipHeight) {
  const width = tooltipWidth();
  if (!rect) {
    return { top: window.innerHeight / 2 - tooltipHeight / 2, left: window.innerWidth / 2 - width / 2 };
  }
  let top;
  let left;
  if (placement === "right") {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.right + GAP;
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = rect.left - GAP - width;
  } else {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - width / 2;
    if (top + tooltipHeight > window.innerHeight - VIEWPORT_MARGIN) top = rect.top - GAP - tooltipHeight;
    // Neither below nor above fits -- a target nearly as tall as the
    // screen (the landscape rail's word strip). Go beside it instead.
    if (top < VIEWPORT_MARGIN) {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + GAP;
      if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = rect.left - GAP - width;
      // No room beside it either (a full-width target) -- dock the card to
      // whichever screen edge the target leaves more of.
      if (left < VIEWPORT_MARGIN) {
        left = window.innerWidth / 2 - width / 2;
        const roomBelow = window.innerHeight - rect.bottom;
        top = roomBelow >= rect.top ? window.innerHeight - tooltipHeight - VIEWPORT_MARGIN : VIEWPORT_MARGIN;
      }
    }
  }
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - tooltipHeight - VIEWPORT_MARGIN);
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN);
  return { top, left, width };
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
export default function Tutorial({ onClose, layout = "desktop" }) {
  const steps = useMemo(() => stepsFor(layout), [layout]);
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltipHeight, setTooltipHeight] = useState(160);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Clamped: crossing the breakpoint mid-tour changes how many steps
  // there are, and the index must never point past the end.
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const rect = useTrackedRect(step.target);

  // Mirrors stepIndex, but updated synchronously (not through React's
  // batched/async commit) so goNext can tell, on every single invocation,
  // exactly how far the tour has already been advanced -- even when
  // several Next clicks or ArrowRight keydowns land before React gets a
  // chance to re-render in between (key-repeat from holding the arrow
  // down, or just impatient clicking while the tab is busy). Without this,
  // every one of those rapid-fire calls closes over the SAME stale `isLast
  // = false` from the render that was current when the burst started, so
  // none of them ever recognizes it's reached the end -- they all fall
  // into the `else` branch and keep incrementing, running stepIndex past
  // STEPS.length - 1 with onClose() never called. The next render then
  // reads STEPS[stepIndex] as undefined and crashes on `step.target`, and
  // since nothing here is wrapped in an error boundary, that takes the
  // entire app down, not just the tour.
  const stepIndexRef = useRef(stepIndex);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

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
    if (stepIndexRef.current >= steps.length - 1) {
      onClose();
      return;
    }
    stepIndexRef.current += 1;
    setStepIndex(stepIndexRef.current);
  }, [onClose, steps.length]);
  // Kept in step with the ref too, so a Back followed by a fast Next
  // advances from where Back left it, not from a stale index.
  const goBack = useCallback(() => {
    stepIndexRef.current = Math.max(0, Math.min(stepIndexRef.current, steps.length - 1) - 1);
    setStepIndex(stepIndexRef.current);
  }, [steps.length]);

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

  const { top, left, width } = tooltipPosition(rect, step.placement, tooltipHeight);

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
        style={{ top, left, width }}
      >
        {/* One live region around the step count AND the content that
            changes with it -- an aria-live scoped to just the counter
            announced "2 of 6" on every step and nothing about what the
            step actually says. */}
        <div aria-live="polite">
          <div className="tutorial-card__step">
            {Math.min(stepIndex, steps.length - 1) + 1} of {steps.length}
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
