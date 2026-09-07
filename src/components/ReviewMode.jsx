import { useMemo, useState } from "react";

// Fisher-Yates -- reviewing in the same order every time makes later cards
// trivially predictable (position, not recall) rather than genuinely tested.
function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function ReviewMode({ title, words, onGrade, onExit }) {
  const deck = useMemo(() => shuffled(words), [words]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ good: 0, again: 0 });

  const current = deck[index];
  const done = index >= deck.length;

  function grade(result) {
    onGrade(current.word, result);
    setTally((t) => ({ ...t, [result]: t[result] + 1 }));
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  return (
    <div className="review-overlay" role="dialog" aria-label={title}>
      <div className="review-card">
        <div className="review-card__header">
          <span>{title}</span>
          <button type="button" className="review-card__exit" onClick={onExit}>
            Exit
          </button>
        </div>

        {deck.length === 0 ? (
          <div className="review-card__empty">
            <p>Nothing to review here yet.</p>
            <p className="review-card__hint">
              Mark a word as New or Learning from its detail panel, or add words to this group, then come back.
            </p>
            <button type="button" className="review-card__done-btn" onClick={onExit}>
              Close
            </button>
          </div>
        ) : done ? (
          <div className="review-card__summary">
            <p className="review-card__summary-headline">
              Reviewed {deck.length} word{deck.length === 1 ? "" : "s"}
            </p>
            <div className="review-card__summary-tally">
              <span className="review-card__tally-good">{tally.good} got it</span>
              <span className="review-card__tally-again">{tally.again} still learning</span>
            </div>
            <button type="button" className="review-card__done-btn" onClick={onExit}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="review-card__progress">
              <div className="review-card__progress-bar">
                <div className="review-card__progress-fill" style={{ width: `${(index / deck.length) * 100}%` }} />
              </div>
              <span>
                {index + 1} / {deck.length}
              </span>
            </div>

            <div className="review-card__word">{current.word}</div>

            {revealed ? (
              <>
                <div className="review-card__reading">{current.reading}</div>
                <div className="review-card__meaning">{current.meaning}</div>
                <div className="review-card__grade-buttons">
                  <button type="button" className="review-card__grade review-card__grade--again" onClick={() => grade("again")}>
                    Still learning
                  </button>
                  <button type="button" className="review-card__grade review-card__grade--good" onClick={() => grade("good")}>
                    Got it
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="review-card__reveal" onClick={() => setRevealed(true)}>
                Show answer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
