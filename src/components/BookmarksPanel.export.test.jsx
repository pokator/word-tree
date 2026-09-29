import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookmarksPanel from "./BookmarksPanel";
import { downloadTextFile } from "../anki/exportFile";

vi.mock("../anki/exportFile", async (importOriginal) => ({
  ...(await importOriginal()),
  downloadTextFile: vi.fn(),
}));

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1";

const DATASET = {
  WORDS_BY_TEXT: { 日本: { word: "日本", meaning: "Japan", reading: "にほん" } },
  KANJI: { 日: { jlpt: 5 }, 本: { jlpt: 5 } },
};

const anki = () => ({
  state: "off",
  connect: vi.fn(),
  disconnect: vi.fn(),
  check: vi.fn(),
  syncNow: vi.fn(),
  review: vi.fn(),
  browse: vi.fn(),
});

function renderPanel(api, words = [{ item_id: "日本", found_from: null }]) {
  render(
    <BookmarksPanel
      dataset={DATASET}
      saved={{ words, toggleSave: vi.fn() }}
      anki={api}
      getStatus={() => undefined}
      userTagsFor={() => []}
      onSelectWord={vi.fn()}
      onClose={vi.fn()}
    />
  );
}

describe("BookmarksPanel .tsv export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    downloadTextFile.mockClear();
  });

  it("offers the download on the list itself, without an account or Anki", async () => {
    renderPanel(anki());
    await userEvent.click(screen.getByRole("button", { name: "Download .tsv for Anki" }));
    expect(downloadTextFile).toHaveBeenCalledWith("moto-export.tsv", expect.stringContaining("日本"));
  });

  it("leads with the download in Safari, keeping connect as a fallback", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(SAFARI);
    const api = anki();
    renderPanel(api);
    // On the first render -- no flash of the Connect card while detecting.
    expect(screen.getByText(/Safari doesn.t let websites talk to Anki/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect to Anki" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Download for Anki (.tsv)" }));
    expect(downloadTextFile).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Try connecting anyway" }));
    expect(api.connect).toHaveBeenCalledOnce();
  });

  it("on a phone, points to a computer and doesn't offer to connect", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    renderPanel(anki());
    expect(await screen.findByText(/Anki sync runs on a computer/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();
  });

  it("with no bookmarks yet, says to bookmark first instead of a dead button", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(SAFARI);
    renderPanel(anki(), []);
    expect(await screen.findByText(/Bookmark a few words first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });
});
