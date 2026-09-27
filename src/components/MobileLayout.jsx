import { useEffect, useRef } from "react";

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
 * Phone layout: the dictionary and the graph stacked, exactly one of them
 * expanded at a time. The collapsed section shrinks to a single bar that is
 * also its own toggle -- the definitions bar sits at the bottom of its
 * section (just the active word), the explore bar at the top of its
 * section (pinned to the bottom of the screen) -- so there's only ever one
 * control on the boundary between them rather than two that do the same
 * thing. The graph stays mounted while collapsed so its simulation, zoom,
 * and expanded nodes survive the round trip.
 */
export default function MobileLayout({ view, onChangeView, node, definitions, explore }) {
  const isExplore = view === "explore";
  // The toggle you just pressed unmounts as the view flips, which would
  // drop keyboard/screen-reader focus to <body> -- hand it to the section
  // that just expanded instead. Skipped on first render (nothing was
  // pressed yet).
  const definitionsBodyRef = useRef(null);
  const exploreBodyRef = useRef(null);
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    (isExplore ? exploreBodyRef : definitionsBodyRef).current?.focus({ preventScroll: true });
  }, [view, isExplore]);
  const headword = node ? (node.type === "kanji" ? node.char : node.word) : null;
  const reading = node?.type === "word" ? node.reading : node?.onyomi?.[0] ?? node?.kunyomi?.[0];
  const gloss = firstGloss(node);

  return (
    <div className={`mobile-layout mobile-layout--${view}`}>
      <section className="mobile-layout__definitions" aria-label="Definition">
        {isExplore ? (
          <button
            type="button"
            className="mobile-strip"
            onClick={() => onChangeView("definitions")}
            aria-expanded="false"
            aria-controls="mobile-definitions"
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
            className="mobile-layout__definitions-body"
            id="mobile-definitions"
            ref={definitionsBodyRef}
            tabIndex={-1}
          >
            {definitions}
          </div>
        )}
      </section>

      <section className="mobile-layout__explore" aria-label="Explore">
        {!isExplore && (
          <button
            type="button"
            className="mobile-explore-bar"
            onClick={() => onChangeView("explore")}
            aria-expanded="false"
            aria-controls="mobile-explore"
          >
            <span className="mobile-toggle mobile-toggle--top">
              <Chevron up />
            </span>
            <span className="mobile-explore-bar__label">Explore</span>
          </button>
        )}
        <div
          className="mobile-layout__explore-body"
          id="mobile-explore"
          ref={exploreBodyRef}
          tabIndex={-1}
          hidden={!isExplore}
        >
          {explore}
        </div>
      </section>
    </div>
  );
}
