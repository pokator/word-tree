import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Tutorial from "./Tutorial";

// None of the real app's target elements (.search-bar input, etc.) exist
// in this bare render -- Tutorial's useTrackedRect just falls back to a
// centered tooltip when a step's target isn't found (see tooltipPosition),
// so the dialog itself, step navigation, and keyboard/close behavior are
// all still exercisable without mounting the whole App.
describe("Tutorial", () => {
  it("opens on the first step and shows a live step counter", () => {
    render(<Tutorial onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  });

  it("advances through steps with Next and back up with Back", () => {
    render(<Tutorial onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("2 of 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
  });

  it("closes via Skip", () => {
    const onClose = vi.fn();
    render(<Tutorial onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes via Escape", () => {
    const onClose = vi.fn();
    render(<Tutorial onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows Done instead of Next on the last step, and closes on click", () => {
    const onClose = vi.fn();
    render(<Tutorial onClose={onClose} />);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
    const done = screen.getByRole("button", { name: "Done" });
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Regression test: goNext used to decide "am I on the last step?" from a
  // plain render-time variable, closed over by the useCallback. Several
  // Next/ArrowRight events landing back-to-back, before React gets to
  // re-render in between (exactly what OS key-repeat on a held-down arrow
  // key produces, and what the earlier stale closure also failed against),
  // meant every one of those calls saw the SAME stale "not last yet" answer
  // and kept incrementing stepIndex past STEPS.length - 1 instead of ever
  // calling onClose -- the next render then read STEPS[stepIndex] as
  // undefined and crashed the whole app. `fireEvent` alone can't reproduce
  // this: it wraps each call in its own `act()`, so React fully commits
  // between clicks and the race never has a chance to occur. Dispatching
  // the raw DOM clicks inside one shared `act()` block instead defers every
  // resulting state update to a single flush at the end, exactly like a
  // real burst of native events arriving before a render -- STEPS has only
  // 6 entries, so 10 clicks in that one flush is guaranteed to overrun it.
  it("survives more Next clicks than there are steps, fired in one burst, without crashing", () => {
    const onClose = vi.fn();
    render(<Tutorial onClose={onClose} />);
    const button = screen.getByRole("button", { name: "Next" });
    expect(() => {
      act(() => {
        for (let i = 0; i < 10; i++) button.click();
      });
    }).not.toThrow();
    expect(onClose).toHaveBeenCalled();
  });

  it("on a phone, speaks in taps, points at the word strip, and adds the menu step", () => {
    render(<Tutorial layout="phone" onClose={vi.fn()} />);
    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("1 of 7")).toBeInTheDocument();
    next();
    expect(screen.getByText(/Tap any node/)).toBeInTheDocument();
    next();
    expect(screen.getByText(/press and hold/)).toBeInTheDocument();
    next();
    expect(screen.getByRole("heading", { name: "The selected word" })).toBeInTheDocument();
    next();
    next();
    next();
    expect(screen.getByRole("heading", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("on a tablet, uses touch wording but keeps the full dictionary step", () => {
    render(<Tutorial layout="tablet" onClose={vi.fn()} />);
    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("1 of 7")).toBeInTheDocument();
    next();
    expect(screen.getByText(/Tap any node/)).toBeInTheDocument();
    next();
    next();
    expect(screen.getByRole("heading", { name: "Dictionary panel" })).toBeInTheDocument();
  });

  it("on desktop, has no phone-only steps", () => {
    render(<Tutorial onClose={vi.fn()} />);
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
  });
});
