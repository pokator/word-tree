import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MobileMenu from "./MobileMenu";

function setup(overrides = {}) {
  const props = {
    reviewCount: 3,
    onReview: vi.fn(),
    savedCount: 2,
    onOpenSaved: vi.fn(),
    groupsCount: 0,
    onOpenGroups: vi.fn(),
    onTutorial: vi.fn(),
    tutorialDisabled: false,
    theme: "light",
    onToggleTheme: vi.fn(),
    ...overrides,
  };
  render(<MobileMenu {...props} />);
  return props;
}

describe("MobileMenu", () => {
  it("stays closed until the trigger is pressed", async () => {
    setup();
    expect(screen.queryByRole("button", { name: /Bookmarks/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Bookmarks/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /account|sign in/i })).not.toBeInTheDocument();
  });

  it("runs an item's action and closes", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    await userEvent.click(screen.getByRole("button", { name: /Bookmarks/ }));
    expect(props.onOpenSaved).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Bookmarks/ })).not.toBeInTheDocument();
  });

  it("toggles the theme in place without closing", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    await userEvent.click(screen.getByRole("button", { name: /Switch to dark theme/ }));
    expect(props.onToggleTheme).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Bookmarks/ })).toBeInTheDocument();
  });
});
