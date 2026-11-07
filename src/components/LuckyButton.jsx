import { useEffect, useRef, useState } from "react";
import { DiceIcon } from "./icons";

// A press tumbles the dice and flicks through random faces before it lands
// on a new one -- the randomizing, made visible. ROLL_TICKS x ROLL_TICK_MS
// matches the CSS tumble (.lucky-btn.is-rolling, App.css). With reduced
// motion it just shows a new face.
const ROLL_TICKS = 6;
const ROLL_TICK_MS = 80;

function otherFace(face) {
  const next = 1 + Math.floor(Math.random() * 5);
  return next >= face ? next + 1 : next;
}

/** The Feeling lucky dice beside the search field (see graph/lucky.js). */
export default function LuckyButton({ onRoll, busy = false, disabled = false, title }) {
  const [face, setFace] = useState(3);
  const [rolling, setRolling] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearInterval(timerRef.current), []);

  function handleClick() {
    clearInterval(timerRef.current);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setFace(otherFace);
    } else {
      let ticks = 0;
      setRolling(true);
      timerRef.current = setInterval(() => {
        ticks += 1;
        setFace(otherFace);
        if (ticks >= ROLL_TICKS) {
          clearInterval(timerRef.current);
          setRolling(false);
        }
      }, ROLL_TICK_MS);
    }
    onRoll();
  }

  return (
    <button
      type="button"
      className={`lucky-btn${rolling ? " is-rolling" : ""}`}
      onClick={handleClick}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-label="Feeling lucky: explore a random word"
      title={title}
      data-tutorial="lucky-btn"
    >
      <DiceIcon face={face} />
    </button>
  );
}
