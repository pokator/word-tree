import { fireEvent, render, screen } from "@testing-library/react";
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
});
