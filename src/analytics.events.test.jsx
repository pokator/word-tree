import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { resetTrackOnce } from "./lib/analytics";
import { GUEST_BOOKMARKS_KEY } from "./lib/guestStore";

// Where the Umami events fire, not just that track() works: a funnel step
// counted at the wrong moment is silent -- nothing breaks, the numbers lie.
const events = () => window.umami.track.mock.calls.map(([name]) => name);

function node(label) {
  return [...document.querySelectorAll("[data-node]")].find(
    (g) => g.querySelector(".graph-node__label")?.textContent === label
  );
}

function doubleTap(el) {
  for (let i = 0; i < 2; i++) {
    fireEvent.pointerDown(el, { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerUp(window, { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 });
  }
}

async function renderApp() {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
  await waitFor(() => expect(node("語")).toBeTruthy());
}

describe("analytics events", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTrackOnce();
    window.umami = { track: vi.fn() };
  });
  afterEach(() => {
    delete window.umami;
  });

  it("first-expand fires only when a node actually expands", async () => {
    await renderApp();
    doubleTap(node("日本語")); // the root starts out expanded
    expect(events()).not.toContain("first-expand");

    doubleTap(node("語"));
    await waitFor(() => expect(events()).toContain("first-expand"));
  });

  it("the search bar counts as a search; opening a bookmark doesn't", async () => {
    localStorage.setItem(
      GUEST_BOOKMARKS_KEY,
      JSON.stringify([{ item_id: "学校", exported_at: null, found_from: null }])
    );
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: /Bookmarks/ }));
    await waitFor(() => expect(document.querySelector(".saved-panel__item-main")).toBeTruthy());
    fireEvent.click(document.querySelector(".saved-panel__item-main"));
    await waitFor(() => expect(node("学校")).toBeTruthy()); // it did open
    expect(events()).not.toContain("search");

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "日本" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(events()).toContain("search");
  });
});
