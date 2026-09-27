import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import MobileLayout from "./MobileLayout";

const WORD = {
  type: "word",
  word: "日本語",
  reading: "にほんご",
  senses: [{ gloss: ["Japanese language"] }],
};

function Harness({ initial = "explore" }) {
  const [view, setView] = useState(initial);
  return (
    <MobileLayout
      view={view}
      onChangeView={setView}
      node={WORD}
      definitions={<p>full definition</p>}
      explore={<p>graph</p>}
    />
  );
}

describe("MobileLayout", () => {
  it("in explore view shows only the active word above a visible graph", () => {
    render(<Harness />);
    expect(screen.getByText("日本語")).toBeInTheDocument();
    expect(screen.getByText("Japanese language")).toBeInTheDocument();
    expect(screen.queryByText("full definition")).not.toBeInTheDocument();
    expect(screen.getByText("graph")).toBeVisible();
  });

  it("expands the definitions from the strip, and collapses them from the Explore bar", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /Show full definition of 日本語/ }));
    expect(screen.getByText("full definition")).toBeInTheDocument();
    // Graph stays mounted (keeps its simulation/zoom) but hidden.
    expect(screen.getByText("graph")).not.toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /Explore/ }));
    expect(screen.queryByText("full definition")).not.toBeInTheDocument();
    expect(screen.getByText("graph")).toBeVisible();
  });
});
