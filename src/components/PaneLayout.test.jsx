import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import PaneLayout from "./PaneLayout";

const WORD = {
  type: "word",
  word: "日本語",
  reading: "にほんご",
  senses: [{ gloss: ["Japanese language"] }],
};

function Harness({ mobile = true, initial = "explore", right = <p>graph</p> }) {
  const [view, setView] = useState(initial);
  return (
    <PaneLayout
      mobile={mobile}
      view={view}
      onChangeView={setView}
      node={WORD}
      storageKey="test"
      left={<p>full definition</p>}
      right={right}
    />
  );
}

describe("PaneLayout (phone)", () => {
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
    expect(document.activeElement).toBe(screen.getByText("full definition").parentElement);

    await userEvent.click(screen.getByRole("button", { name: /Explore/ }));
    expect(screen.queryByText("full definition")).not.toBeInTheDocument();
    expect(screen.getByText("graph")).toBeVisible();
    expect(document.activeElement).toBe(screen.getByText("graph").parentElement);
  });
});

describe("PaneLayout (desktop)", () => {
  it("shows both panes side by side with a resize handle", () => {
    render(<Harness mobile={false} />);
    expect(screen.getByText("full definition")).toBeVisible();
    expect(screen.getByText("graph")).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize panels" })).toBeInTheDocument();
  });
});

describe("PaneLayout across the breakpoint", () => {
  it("keeps the right pane mounted when switching between desktop and phone", () => {
    let mounts = 0;
    function Graph() {
      useEffect(() => {
        mounts++;
      }, []);
      return <p>graph</p>;
    }
    const view = render(<Harness mobile={false} right={<Graph />} />);
    view.rerender(<Harness mobile right={<Graph />} />);
    view.rerender(<Harness mobile={false} right={<Graph />} />);
    expect(mounts).toBe(1);
  });
});
