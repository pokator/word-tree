import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTrackOnce } from "../lib/analytics";
import { useAnkiSync } from "./useAnkiSync";

vi.mock("./ankiConnect", async (importOriginal) => ({
  ...(await importOriginal()),
  probeConnection: vi.fn(async () => false),
}));

describe("useAnkiSync analytics", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTrackOnce();
    window.umami = { track: vi.fn() };
  });
  afterEach(() => {
    delete window.umami;
  });

  it("repeated 'Try again' while Anki is unreachable counts once", async () => {
    const { result } = renderHook(() =>
      useAnkiSync({
        dataset: { loading: false, WORDS_BY_TEXT: {}, KANJI: {} },
        bookmarks: [],
        userTagsFor: () => [],
        applyStatuses: () => {},
      })
    );
    await act(() => result.current.connect());
    await act(() => result.current.check());
    await act(() => result.current.check());
    expect(window.umami.track.mock.calls).toEqual([["anki-unreachable", undefined]]);
  });
});
