import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { encodeShard } from "./data/semanticTestUtils";

// Timing between the graph and its semantic data, which loads lazily. 学生 has
// no frequency entry, so it has no meaning neighbours.
const FREQUENCY = { 学校: 100, 小学校: 300, 中学校: 400, 日本: 500 };
const NEIGHBOURS = {
  学校: [["中学校", 90], ["小学校", 80]],
  小学校: [["中学校", 90]],
  中学校: [["小学校", 90]],
  日本: [["学校", 70]],
};
const net = vi.hoisted(() => ({ held: false, failing: false, waiting: [], shardFetches: 0 }));

vi.mock("./data/semantic", async (importActual) => {
  const actual = await importActual();
  const respond = async (body) => {
    if (net.held) await new Promise((resolve) => net.waiting.push(resolve));
    if (net.failing) throw new Error("offline");
    return body;
  };
  return {
    ...actual,
    createSemanticStore: (options) =>
      actual.createSemanticStore({
        ...options,
        fetchJson: () => respond(FREQUENCY),
        fetchBytes: () => {
          net.shardFetches++;
          return respond(encodeShard(NEIGHBOURS, Object.keys(FREQUENCY)));
        },
      }),
  };
});

const release = async () => {
  net.held = false;
  await act(async () => {
    net.waiting.splice(0).forEach((resolve) => resolve());
  });
};

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const labels = () => [...document.querySelectorAll("[data-node] .graph-node__label")].map((n) => n.textContent).sort();
const node = (label) =>
  [...document.querySelectorAll("[data-node]")].find((g) => g.querySelector(".graph-node__label")?.textContent === label);
const here = () => decodeURI(window.location.pathname + window.location.search);
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

function tap(el, times = 1) {
  for (let i = 0; i < times; i++) {
    fireEvent.pointerDown(el, { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerUp(window, { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 });
  }
}
const search = (text) => {
  const input = screen.getByPlaceholderText("Search...");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const chooseMode = (name) => fireEvent.click(screen.getByRole("radio", { name }));
const open = (url) => {
  window.history.replaceState(null, "", url);
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};

describe("modes and lazily loaded meaning data", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(net, { held: false, failing: false, waiting: [], shardFetches: 0 });
  });
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("fetches a selected word's neighbours in meaning mode, before it's expanded", async () => {
    open("/explore/学校?mode=meaning&start=word");
    await waitFor(() => expect(node("学校")).toBeTruthy());
    await waitFor(() => expect(net.shardFetches).toBeGreaterThan(0));
    expect(labels()).toEqual(["学校"]);
  });

  it("downloads no meaning data for a word selected in kanji mode", async () => {
    open("/explore/学校?expand=k:学&sel=w:学生");
    await waitFor(() => expect(node("学生")).toBeTruthy());
    await settle();
    expect(net.shardFetches).toBe(0);
  });

  it("a search made while meaning data loads still builds that word's graph", async () => {
    net.held = true;
    open("/explore/学校?mode=meaning&start=word&expand=s:学校");
    await screen.findByPlaceholderText("Search...");
    await settle();
    search("日本");
    await waitFor(() => expect(here()).toContain("/explore/日本"));
    search("小学校");
    await waitFor(() => expect(here()).toBe("/explore/小学校?mode=meaning&start=word&expand=s:小学校"));
    await release();
    await waitFor(() => expect(labels()).toEqual(["中学校", "小学校"].sort()));
  });

  it("an expansion still loading is dropped once you've moved to another graph", async () => {
    localStorage.setItem("word-tree:mode-switch", "mixed");
    net.held = true;
    open("/explore/学校?mode=meaning&expand=k:学&sel=w:小学校");
    await waitFor(() => expect(node("小学校")).toBeTruthy());
    tap(node("小学校"), 2);
    search("日本");
    await waitFor(() => expect(here()).toContain("/explore/日本"));
    await release();
    await settle();
    expect(here()).not.toContain("小学校");
  });

  it("tapping twice while a word's neighbours load expands it once", async () => {
    localStorage.setItem("word-tree:mode-switch", "mixed");
    net.held = true;
    open("/explore/学校?mode=meaning&expand=k:学&sel=w:小学校");
    await waitFor(() => expect(node("小学校")).toBeTruthy());
    tap(node("小学校"), 2);
    await settle();
    tap(node("小学校"), 2);
    await release();
    await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&expand=k:学,s:小学校&sel=w:小学校"));
  });

  it("the old graph can't be expanded while the first Meaning graph loads", async () => {
    net.held = true;
    open("/explore/学校");
    await waitFor(() => expect(node("学")).toBeTruthy());
    chooseMode("Meaning");
    await settle();
    tap(node("学"), 2);
    await release();
    await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校"));
    await waitFor(() => expect(node("中学校")).toBeTruthy());
  });

  it("a word breaks into its kanji without waiting on meaning data, whatever the dial says", async () => {
    localStorage.setItem("word-tree:commonness", JSON.stringify({ kanji: 50, meaning: 40 }));
    net.held = true;
    open("/explore/学校?expand=l:学/学生&sel=w:学生");
    await waitFor(() => expect(node("学生")).toBeTruthy());
    tap(node("学生"), 2);
    await waitFor(() => expect(here()).toContain("w:学生"));
    expect(net.waiting).toEqual([]);
  });

  describe('"Related in meaning" for a word with no neighbours', () => {
    const askForRelated = async () => {
      await waitFor(() => expect(node("学生")).toBeTruthy());
      fireEvent.click(await screen.findByRole("button", { name: /Related in meaning/ }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No related words for 学生."));
    };

    it("one graph: says so and adds nothing", async () => {
      localStorage.setItem("word-tree:mode-switch", "mixed");
      open("/explore/学校?expand=k:学&sel=w:学生");
      await askForRelated();
      expect(here()).toBe("/explore/学校?expand=k:学&sel=w:学生");
    });

    it("separate graphs: says so and stays on this graph", async () => {
      open("/explore/学校?expand=k:学&sel=w:学生");
      await askForRelated();
      expect(here()).toBe("/explore/学校?expand=k:学&sel=w:学生");
    });
  });

  it('"Related in meaning" goes away once the data has failed to load', async () => {
    net.failing = true;
    open("/explore/学校?expand=k:学&sel=w:小学校");
    fireEvent.click(await screen.findByRole("button", { name: /Related in meaning/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Related in meaning/ })).toBeNull());
    expect(here()).toBe("/explore/学校?expand=k:学&sel=w:小学校");
  });

  it("crossing from Kanji opens a word in its Meaning graph, and Back returns", async () => {
    open("/explore/学校?expand=k:学&sel=w:小学校");
    fireEvent.click(await screen.findByRole("button", { name: /Related in meaning/ }));
    await waitFor(() => expect(here()).toBe("/explore/小学校?mode=meaning&start=word&expand=s:小学校"));
    await waitFor(() => expect(node("中学校")).toBeTruthy());

    act(() => window.history.back());
    await waitFor(() => expect(here()).toBe("/explore/学校?expand=k:学&sel=w:小学校"));
  });

  describe("graphs you've left between separate modes", () => {
    it("crossing to another word and coming Back keeps the other mode's graph", async () => {
      open("/explore/学校?expand=k:学");
      await waitFor(() => expect(node("学生")).toBeTruthy());

      chooseMode("Meaning");
      await waitFor(() => expect(node("中学校")).toBeTruthy());
      tap(node("中学校"));
      fireEvent.click(await screen.findByRole("button", { name: /See its kanji/ }));
      await waitFor(() => expect(here()).toBe("/explore/中学校"));

      act(() => window.history.back());
      await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校&sel=w:中学校"));

      chooseMode("Kanji");
      await waitFor(() => expect(here()).toContain("/explore/学校?expand=k:学"));
    });

    it("Back into the other mode keeps the graph you left, as a swap does", async () => {
      open("/explore/学校");
      await waitFor(() => expect(node("学")).toBeTruthy());

      chooseMode("Meaning");
      await waitFor(() => expect(node("中学校")).toBeTruthy());
      tap(node("中学校"));
      await waitFor(() => expect(here()).toContain("sel=w:中学校"));

      act(() => window.history.back());
      await waitFor(() => expect(here()).toBe("/explore/学校"));

      chooseMode("Meaning");
      await waitFor(() => expect(here()).toBe("/explore/学校?mode=meaning&start=word&expand=s:学校&sel=w:中学校"));
    });
  });
});
