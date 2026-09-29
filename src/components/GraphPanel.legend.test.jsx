import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { AuthProvider } from "../auth/AuthContext";

const renderApp = () =>
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );

describe("graph legend", () => {
  beforeEach(() => localStorage.clear());

  it("collapses and expands, and remembers the choice", async () => {
    renderApp();
    const toggle = await screen.findByRole("button", { name: "Legend" });
    // jsdom's window is desktop-sized: open by default.
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Kanji/ })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Kanji/ })).not.toBeInTheDocument();

    cleanup();
    renderApp();
    expect(await screen.findByRole("button", { name: "Legend" })).toHaveAttribute("aria-expanded", "false");
  });
});
