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

function Harness({ mode = "phone", initial = "explore", right = <p>graph</p> }) {
  const [view, setView] = useState(initial);
  return (
    <PaneLayout
      mode={mode}
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

describe("PaneLayout (rail)", () => {
  it("opens the full entry beside a still-visible graph, and hides it again", async () => {
    render(<Harness mode="rail" />);
    expect(screen.queryByText("full definition")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Show full definition of 日本語/ }));
    expect(screen.getByText("full definition")).toBeInTheDocument();
    expect(screen.getByText("graph")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Explore$/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("full definition")).not.toBeInTheDocument();
    expect(screen.getByText("graph")).toBeVisible();
  });
});

describe("PaneLayout (desktop and tablet)", () => {
  it("desktop shows both panes side by side with a vertical divider", () => {
    render(<Harness mode="desktop" />);
    expect(screen.getByText("full definition")).toBeVisible();
    expect(screen.getByText("graph")).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize panels" })).toHaveAttribute("aria-orientation", "vertical");
  });

  it("tablet stacks both panes, visible, with a horizontal divider", () => {
    render(<Harness mode="tablet" />);
    expect(screen.getByText("full definition")).toBeVisible();
    expect(screen.getByText("graph")).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize panels" })).toHaveAttribute(
      "aria-orientation",
      "horizontal"
    );
  });
});

describe("PaneLayout across shapes", () => {
  it("keeps the right pane mounted through every layout change", () => {
    let mounts = 0;
    function Graph() {
      useEffect(() => {
        mounts++;
      }, []);
      return <p>graph</p>;
    }
    const view = render(<Harness mode="desktop" right={<Graph />} />);
    for (const mode of ["phone", "rail", "tablet", "desktop", "rail", "phone"]) {
      view.rerender(<Harness mode={mode} right={<Graph />} />);
    }
    expect(mounts).toBe(1);
  });
});
