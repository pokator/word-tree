import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

// Shareable graphs: /explore/<root>?expand=... rebuilds the same graph, and
// the address bar follows what you do. The fixture dataset (see
// setupTests.js) has 学校, 学生, 小学校, 中学校 ... under 学 and 校.
// jsdom has no SVG geometry; d3-zoom reads the svg's width/height baseVal
// to find its viewport, so give it one.
const baseVal = (v) => ({ get: () => ({ baseVal: { value: v } }), configurable: true });
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, "width", baseVal(800));
  Object.defineProperty(SVGSVGElement.prototype, "height", baseVal(600));
});
afterAll(() => {
  delete SVGSVGElement.prototype.width;
  delete SVGSVGElement.prototype.height;
});

const labels = () =>
  [...document.querySelectorAll("[data-node] .graph-node__label")].map((n) => n.textContent).sort();
const node = (label) =>
  [...document.querySelectorAll("[data-node]")].find(
    (g) => g.querySelector(".graph-node__label")?.textContent === label
  );
const here = () => decodeURI(window.location.pathname + window.location.search);

function doubleTap(el) {
  for (let i = 0; i < 2; i++) {
    fireEvent.pointerDown(el, { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerUp(window, { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 });
  }
}

const renderApp = () =>
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );

describe("explore URLs in the app", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("a shared link rebuilds its graph", async () => {
    window.history.replaceState(null, "", "/explore/学校?expand=k:学&sel=w:学生");
    renderApp();
    await waitFor(() => expect(node("学生")).toBeTruthy());
    expect(labels()).toEqual(expect.arrayContaining(["学校", "学", "校", "学生"]));
    expect(document.title).toMatch(/学校/);
  });

  it("the home page stays / until you do something, then the URL follows the graph", async () => {
    window.history.replaceState(null, "", "/");
    renderApp();
    await waitFor(() => expect(node("語")).toBeTruthy());
    expect(window.location.pathname).toBe("/");

    doubleTap(node("語"));
    await waitFor(() => expect(here()).toBe("/explore/日本語?expand=k:語&sel=k:語"));
  });

  it("a new search is a new history entry; Back returns to the previous graph", async () => {
    window.history.replaceState(null, "", "/explore/学校?expand=k:学");
    renderApp();
    await waitFor(() => expect(node("学生")).toBeTruthy());

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "日本" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(here()).toBe("/explore/日本"));

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(here()).toBe("/explore/学校?expand=k:学"));
    await waitFor(() => expect(node("学生")).toBeTruthy());
  });

  it("each expansion is a Back step; Forward redoes it; selecting isn't", async () => {
    window.history.replaceState(null, "", "/explore/学校");
    renderApp();
    await waitFor(() => expect(node("学")).toBeTruthy());

    doubleTap(node("学"));
    await waitFor(() => expect(node("学生")).toBeTruthy());
    doubleTap(node("校"));
    await waitFor(() => expect(here()).toMatch(/expand=k:学,k:校/));
    // A plain click just selects -- no new entry.
    fireEvent.pointerDown(node("学生"), { pointerType: "mouse", pointerId: 1, button: 0 });
    fireEvent.pointerUp(window, { pointerType: "mouse", pointerId: 1, button: 0 });

    act(() => window.history.back());
    await waitFor(() => expect(here()).toMatch(/^\/explore\/学校\?expand=k:学(&|$)/));
    expect(node("学生")).toBeTruthy();

    act(() => window.history.back());
    // The entry from just before expanding 学 (the double-tap's first tap
    // had already selected it).
    await waitFor(() => expect(here()).toMatch(/^\/explore\/学校(\?sel=k:学)?$/));
    await waitFor(() => expect(node("学生")).toBeFalsy());

    act(() => window.history.forward());
    await waitFor(() => expect(node("学生")).toBeTruthy());
  });

  it("Share copies the graph's link where there's no share sheet", async () => {
    window.history.replaceState(null, "", "/explore/学校?expand=k:学");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderApp();
    await waitFor(() => expect(node("学生")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Share this graph" }));
    await screen.findByText("Link copied");
    expect(decodeURI(writeText.mock.calls[0][0])).toBe(`${window.location.origin}/explore/学校?expand=k:学`);
    delete navigator.clipboard;
  });

  it("searching the current word again starts it fresh, graph and URL alike", async () => {
    window.history.replaceState(null, "", "/explore/学校?expand=k:学");
    renderApp();
    await waitFor(() => expect(node("学生")).toBeTruthy());
    const input = screen.getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "学校" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(node("学生")).toBeFalsy());
    expect(here()).toBe("/explore/学校");
  });

  it("Back to the home page restores the home title", async () => {
    window.history.replaceState(null, "", "/");
    renderApp();
    await waitFor(() => expect(node("語")).toBeTruthy());
    const input = screen.getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "学校" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(document.title).toMatch(/学校/));
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    // Back to index.html's own title (empty under jsdom), not 学校's.
    await waitFor(() => expect(document.title).not.toMatch(/学校/));
  });

  it("a sel= for a node the link never reveals falls back to the root", async () => {
    window.history.replaceState(null, "", "/explore/学校?sel=k:日");
    renderApp();
    await waitFor(() => expect(node("学校")).toBeTruthy());
    await waitFor(() => expect(here()).toBe("/explore/学校"));
  });

  it("a kanji expands by the kanji Commonness setting even in Meaning mode", async () => {
    localStorage.setItem("word-tree:mode-switch", "mixed");
    localStorage.setItem("word-tree:commonness", JSON.stringify({ kanji: 0, meaning: 90 }));
    window.history.replaceState(null, "", "/explore/学校?mode=meaning");
    renderApp();
    await waitFor(() => expect(node("学")).toBeTruthy());
    doubleTap(node("学"));
    await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&expand=k:学&sel=k:学"));
  });

  describe("crossing to the other mode from the dictionary panel", () => {
    it("separate graphs: from the root it's the same swap as the mode switch", async () => {
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&start=word&expand=s:学校");
      renderApp();
      fireEvent.click(await screen.findByRole("button", { name: /See its kanji/ }));
      await waitFor(() => expect(here()).toBe("/explore/学校"));
      fireEvent.click(screen.getByRole("radio", { name: "Meaning" }));
      await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校"));
    });

    it("separate graphs: a kanji card leaves the meaning graph for the kanji one", async () => {
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&start=word&expand=s:学校");
      renderApp();
      const card = (await screen.findAllByText("学")).find((el) => el.closest(".dictionary-panel"));
      fireEvent.click(card);
      await waitFor(() => expect(here()).toBe("/explore/学校?sel=k:学"));
    });

    it("one graph: expands in place and stays in the current mode", async () => {
      localStorage.setItem("word-tree:mode-switch", "mixed");
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&expand=k:学&sel=w:学生");
      renderApp();
      fireEvent.click(await screen.findByRole("button", { name: /See its kanji/ }));
      await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&expand=k:学,w:学生&sel=w:学生"));
      await waitFor(() => expect(screen.queryByRole("button", { name: /See its kanji/ })).toBeNull());
    });
  });

  describe("swapping between separate graphs", () => {
    it("a graph comes back with its own selection when you'd picked nothing else", async () => {
      window.history.replaceState(null, "", "/explore/学校?sel=k:学");
      renderApp();
      await waitFor(() => expect(node("学")).toBeTruthy());

      fireEvent.click(screen.getByRole("radio", { name: "Meaning" }));
      await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校"));
      fireEvent.click(screen.getByRole("radio", { name: "Kanji" }));
      await waitFor(() => expect(here()).toBe("/explore/学校?sel=k:学"));
    });

    it("a selection the other graph doesn't have falls back to that graph's own", async () => {
      window.history.replaceState(null, "", "/explore/学校?sel=k:校");
      renderApp();
      await waitFor(() => expect(node("校")).toBeTruthy());

      fireEvent.click(screen.getByRole("radio", { name: "Meaning" }));
      await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校"));
      expect(document.querySelector(".dictionary-panel__headword").textContent).toBe("学校");
    });
  });

  describe("Reset goes back to where the current mode starts", () => {
    const reset = () => fireEvent.click(screen.getByRole("button", { name: "Reset graph" }));
    const chooseSwitching = (name) => {
      fireEvent.click(screen.getByRole("button", { name: "Filters" }));
      fireEvent.click(screen.getByRole("radio", { name }));
      fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    };
    const MEANING_START = "/explore/学校?mode=meaning&start=word&expand=s:学校";

    it("in Meaning, even on a linked graph that mixes both modes", async () => {
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&expand=k:学");
      renderApp();
      await waitFor(() => expect(node("学生")).toBeTruthy());
      reset();
      await waitFor(() => expect(here()).toBe(MEANING_START));
    });

    it("in Kanji, even on a graph that started in Meaning", async () => {
      localStorage.setItem("word-tree:mode-switch", "mixed");
      window.history.replaceState(null, "", "/explore/学校?start=word&expand=s:学校");
      renderApp();
      await waitFor(() => expect(node("学校")).toBeTruthy());
      reset();
      await waitFor(() => expect(here()).toBe("/explore/学校"));
      await waitFor(() => expect(labels()).toEqual(["学", "学校", "校"].sort()));
    });

    it("in One graph, Meaning resets to meaning words as well", async () => {
      localStorage.setItem("word-tree:mode-switch", "mixed");
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&expand=k:学");
      renderApp();
      await waitFor(() => expect(node("学生")).toBeTruthy());
      reset();
      await waitFor(() => expect(here()).toBe(MEANING_START));
    });

    it("switching to Separate graphs clears a graph mixing both modes, and swapping can't bring it back", async () => {
      localStorage.setItem("word-tree:mode-switch", "mixed");
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&expand=k:学");
      renderApp();
      await waitFor(() => expect(node("学生")).toBeTruthy());

      chooseSwitching("Separate graphs");
      await waitFor(() => expect(here()).toBe(MEANING_START));

      fireEvent.click(screen.getByRole("radio", { name: "Kanji" }));
      await waitFor(() => expect(here()).toBe("/explore/学校"));
      fireEvent.click(screen.getByRole("radio", { name: "Meaning" }));
      await waitFor(() => expect(here()).toBe(MEANING_START));
    });

    it("swapping away from a linked mixed graph starts that mode fresh on the way back", async () => {
      window.history.replaceState(null, "", "/explore/学校?mode=meaning&expand=k:学");
      renderApp();
      await waitFor(() => expect(node("学生")).toBeTruthy());

      fireEvent.click(screen.getByRole("radio", { name: "Kanji" }));
      await waitFor(() => expect(here()).toBe("/explore/学校"));
      fireEvent.click(screen.getByRole("radio", { name: "Meaning" }));
      await waitFor(() => expect(here()).toBe(MEANING_START));
    });
  });

  it("Share falls back to copying when the share sheet refuses", async () => {
    window.history.replaceState(null, "", "/explore/学校");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw Object.assign(new Error("no"), { name: "NotAllowedError" });
      },
    });
    renderApp();
    await waitFor(() => expect(node("学校")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Share this graph" }));
    await screen.findByText("Link copied");
    expect(writeText).toHaveBeenCalledOnce();
    delete navigator.clipboard;
    delete navigator.share;
  });
});
