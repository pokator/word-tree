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
