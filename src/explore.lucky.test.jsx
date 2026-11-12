import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

// The dice's plan is fixed here so each test knows which kind of roll it got.
const roll = vi.hoisted(() => ({ plan: null }));
vi.mock("./graph/lucky", async (importActual) => ({
  ...(await importActual()),
  planLuckyGraph: async () => roll.plan,
}));

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const MODE_SWITCH_KEY = "word-tree:mode-switch";
const rollDice = () => fireEvent.click(screen.getByRole("button", { name: /Feeling lucky/ }));
const modeChecked = (name) => screen.getByRole("radio", { name }).getAttribute("aria-checked");

async function openApp() {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByRole("button", { name: /Feeling lucky/ })).not.toBeDisabled());
}

describe("Feeling lucky and Switching modes", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("a roll mixing kanji and meaning branches switches to One graph", async () => {
    await openApp();
    roll.plan = { root: "学校", mode: "meaning", start: "kanji", ops: [] };
    await act(async () => rollDice());
    await waitFor(() => expect(modeChecked("Meaning")).toBe("true"));
    expect(localStorage.getItem(MODE_SWITCH_KEY)).toBe("mixed");
  });

  it("a single-mode roll switches back to Separate graphs", async () => {
    localStorage.setItem(MODE_SWITCH_KEY, "mixed");
    await openApp();
    roll.plan = { root: "学校", mode: "kanji", start: "kanji", ops: [] };
    await act(async () => rollDice());
    await waitFor(() => expect(localStorage.getItem(MODE_SWITCH_KEY)).toBe("separate"));
    expect(modeChecked("Kanji")).toBe("true");
  });
});
