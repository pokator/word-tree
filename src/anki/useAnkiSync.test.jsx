import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAnki } from "./fakeAnkiConnect";
import { DECK_NAME } from "./ankiConnect";
import { MODEL_NAME } from "./ankiSync";
import { useAnkiSync } from "./useAnkiSync";

const DATASET = {
  loading: false,
  WORDS_BY_TEXT: {
    日本語: { word: "日本語", reading: "にほんご", meaning: "Japanese language" },
    日本: { word: "日本", reading: "にほん", meaning: "Japan" },
  },
  KANJI: { 日: { char: "日", meaning: "day", jlpt: 5 }, 本: { char: "本", meaning: "book", jlpt: 5 }, 語: { char: "語", meaning: "word", jlpt: 5 } },
};

function setup(props = {}) {
  const applyStatuses = vi.fn();
  const hook = renderHook((p) => useAnkiSync(p), {
    initialProps: {
      dataset: DATASET,
      bookmarks: [{ item_id: "日本語", found_from: "日本語" }],
      userTagsFor: () => [],
      graphWords: ["日本語", "日本"],
      applyStatuses,
      ...props,
    },
  });
  return { ...hook, applyStatuses };
}

describe("useAnkiSync", () => {
  let anki;
  let fetchSpy;
  beforeEach(() => {
    localStorage.clear();
    anki = createFakeAnki({
      models: { "Core 2k": ["Expression", "Meaning"] },
      notes: [{ modelName: "Core 2k", deck: "Core", fields: { Expression: "日本", Meaning: "Japan" }, cards: [{ interval: 30, type: 2, queue: 2 }] }],
    });
    fetchSpy = vi.fn(anki.fetch);
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never contacts Anki until the user connects (no surprise permission prompt)", async () => {
    const { result } = setup();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.state).toBe("off");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("on connect, pushes bookmarks as cards and pulls statuses for bookmarks and graph words", async () => {
    const { result, applyStatuses } = setup();
    act(() => result.current.connect());
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull(), { timeout: 3000 });

    expect(result.current.state).toBe("connected");
    const moto = anki.state.notes.filter((n) => n.modelName === MODEL_NAME);
    expect(moto.map((n) => [n.fields.Word, n.deck])).toEqual([["日本語", DECK_NAME]]);
    // Status is read before cards are added: 日本 is mature in the user's
    // own deck; 日本語's brand-new card shows up on the next sync.
    expect(new Map(applyStatuses.mock.calls.at(-1)[0])).toEqual(new Map([["word:日本", "known"]]));
    expect(localStorage.getItem("word-tree:anki-enabled")).toBe("true");
  });

  it("reports Anki as unreachable when it isn't running, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const { result } = setup();
    act(() => result.current.connect());
    await waitFor(() => expect(result.current.state).toBe("unreachable"));
  });
});
