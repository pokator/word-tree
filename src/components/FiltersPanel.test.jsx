import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FiltersPanel from "./FiltersPanel";

const base = {
  jlptFilter: { n5: true, n4: true, n3: true, n2: true, n1: true, unrated: true },
  onToggleJlpt: () => {},
  groups: [],
  focusGroupId: null,
  onSetFocusGroup: () => {},
  maxWords: 8,
  onSetMaxWords: () => {},
  colorByDifficulty: false,
  onToggleColorByDifficulty: () => {},
  linkColorMode: "off",
  onSetLinkColorMode: () => {},
  colorByKanjiPath: true,
  onToggleColorByKanjiPath: () => {},
  onClose: () => {},
  onSetModeSwitch: () => {},
};

describe("FiltersPanel per mode", () => {
  it("kanji mode keeps the kanji-link controls", () => {
    render(<FiltersPanel {...base} mode="kanji" commonness={0} onSetCommonness={() => {}} />);
    expect(screen.getByText("Link pattern")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kanji path" })).toBeInTheDocument();
    expect(screen.getByText("Words per branch")).toBeInTheDocument();
    expect(screen.getByLabelText("Commonness")).toHaveValue("0");
  });

  it("meaning mode drops them and keeps the rest", () => {
    render(<FiltersPanel {...base} mode="meaning" commonness={40} onSetCommonness={() => {}} />);
    expect(screen.queryByText("Link pattern")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kanji path" })).toBeNull();
    expect(screen.getByText("Words per expansion")).toBeInTheDocument();
    expect(screen.getByText("JLPT level")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
  });

  it("reports dial moves and the mode-switch choice", () => {
    const onSetCommonness = vi.fn();
    const onSetModeSwitch = vi.fn();
    render(
      <FiltersPanel {...base} mode="meaning" commonness={40} onSetCommonness={onSetCommonness} onSetModeSwitch={onSetModeSwitch} />
    );
    fireEvent.change(screen.getByLabelText("Commonness"), { target: { value: "90" } });
    expect(onSetCommonness).toHaveBeenCalledWith(90);
    fireEvent.click(screen.getByRole("radio", { name: "One graph" }));
    expect(onSetModeSwitch).toHaveBeenCalledWith("mixed");
  });
});
