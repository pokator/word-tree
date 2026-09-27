import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BookmarksPanel from "./BookmarksPanel";

const DATASET = {
  WORDS_BY_TEXT: {
    日本: { word: "日本", meaning: "Japan" },
    毎日: { word: "毎日", meaning: "every day" },
    本当: { word: "本当", meaning: "truth" },
  },
  KANJI: { 日: { jlpt: 5 }, 本: { jlpt: 5 }, 毎: { jlpt: 5 }, 当: { jlpt: 3 } },
};

function anki(overrides = {}) {
  return {
    state: "off",
    due: null,
    lastSynced: null,
    error: null,
    syncing: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    check: vi.fn(),
    syncNow: vi.fn(),
    review: vi.fn(),
    browse: vi.fn(),
    ...overrides,
  };
}

function renderPanel(ankiApi) {
  const saved = {
    words: [
      { item_id: "日本", found_from: null },
      { item_id: "毎日", found_from: null },
      { item_id: "本当", found_from: null },
    ],
    toggleSave: vi.fn(),
  };
  render(
    <BookmarksPanel
      dataset={DATASET}
      saved={saved}
      anki={ankiApi}
      getStatus={(_t, w) => (w === "日本" ? "known" : undefined)}
      userTagsFor={() => []}
      onSelectWord={vi.fn()}
      onClose={vi.fn()}
    />
  );
  return saved;
}

describe("BookmarksPanel", () => {
  it("offers to connect Anki, and only connects when asked", async () => {
    const api = anki();
    renderPanel(api);
    expect(api.connect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Connect to Anki" }));
    expect(api.connect).toHaveBeenCalledOnce();
  });

  it("filters the list by a collection, and opens it in Anki when connected", async () => {
    const api = anki({ state: "connected", due: 4 });
    renderPanel(api);
    expect(screen.getByText("Known")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^N3 1$/ }));
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("本当")]);
    await userEvent.click(screen.getByRole("button", { name: /Open “N3” in Anki/ }));
    expect(api.browse).toHaveBeenCalledWith('"tag:moto::jlpt::n3"');
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(api.review).toHaveBeenCalledOnce();
  });

  it("explains what to check when Anki can't be reached", () => {
    renderPanel(anki({ state: "unreachable" }));
    expect(screen.getByRole("heading", { name: "Can’t reach Anki" })).toBeInTheDocument();
    expect(screen.getByText(/2055492159/)).toBeInTheDocument();
    expect(screen.getByText(/local network access/)).toBeInTheDocument();
  });

  it("folds a connected Anki into a pod that shows status, syncs, and expands", async () => {
    const api = anki({ state: "connected", due: 4 });
    renderPanel(api);
    // Collapsed: the full card is hidden behind the pod.
    expect(screen.queryByRole("heading", { name: "Anki connected" })).not.toBeInTheDocument();
    const pod = screen.getByRole("button", { name: /Anki · 4 to review/ });
    await userEvent.click(screen.getByRole("button", { name: "Sync with Anki" }));
    expect(api.syncNow).toHaveBeenCalledOnce();
    await userEvent.click(pod);
    expect(pod).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Anki connected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("opens a setup guide with this site's exact webCorsOriginList entry", async () => {
    renderPanel(anki());
    await userEvent.click(screen.getByRole("button", { name: "How to set up AnkiConnect" }));
    const dialog = screen.getByRole("dialog", { name: "Set up AnkiConnect" });
    expect(dialog).toHaveTextContent("2055492159");
    expect(dialog).toHaveTextContent(`"${window.location.origin}"`);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
