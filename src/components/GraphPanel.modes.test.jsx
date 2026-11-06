import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GraphPanel from "./GraphPanel";

const STATS = { words: 1, kanji: 0 };
const panel = (props) => render(<GraphPanel graph={null} stats={STATS} onSetMode={() => {}} {...props} />);

describe("GraphPanel dead ends", () => {
  it("says when a word has no related words, and offers the way across", () => {
    const onCross = vi.fn();
    panel({ mode: "meaning", deadEndWord: "老婆心", crossLabel: "See its kanji", onCross });
    expect(screen.getByRole("status")).toHaveTextContent("No related words for 老婆心.");
    screen.getByRole("button", { name: /See its kanji/ }).click();
    expect(onCross).toHaveBeenCalled();
  });

  it("still explains when there's nowhere else to go", () => {
    panel({ mode: "meaning", deadEndWord: "ああ" });
    expect(screen.getByRole("status")).toHaveTextContent("No related words for ああ.");
    expect(screen.queryByRole("button", { name: /See its kanji/ })).toBeNull();
  });

  it("stays out of the way otherwise", () => {
    panel({ mode: "meaning", deadEndWord: null });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("GraphPanel with one graph", () => {
  const canvas = () => document.querySelector(".graph-canvas");

  it("shows what the next word expansion does, and fades the other kind of link", () => {
    panel({ mode: "meaning", modeSwitch: "mixed" });
    expect(screen.getByText("Words expand into related words")).toBeInTheDocument();
    expect(canvas()).toHaveAttribute("data-fade-links", "kanji");
  });

  it("does the same the other way round in Kanji", () => {
    panel({ mode: "kanji", modeSwitch: "mixed" });
    expect(screen.getByText("Words expand into their kanji")).toBeInTheDocument();
    expect(canvas()).toHaveAttribute("data-fade-links", "meaning");
  });

  it("needs neither with separate graphs, where the swap shows for itself", () => {
    panel({ mode: "meaning", modeSwitch: "separate" });
    expect(screen.queryByText(/Words expand into/)).toBeNull();
    expect(canvas()).not.toHaveAttribute("data-fade-links");
  });
});
