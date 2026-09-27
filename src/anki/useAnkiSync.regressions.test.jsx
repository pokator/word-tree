import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAnki } from "./fakeAnkiConnect";
import { MODEL_NAME } from "./ankiSync";
import { useAnkiSync } from "./useAnkiSync";
import { useProgress } from "../progress/useProgress";
import { AuthProvider } from "../auth/AuthContext";

// Each test here reproduces a finding from the milestone review and pins
// the fixed behavior.

const DATASET = {
  loading: false,
  WORDS_BY_TEXT: {
    日本語: { word: "日本語", reading: "にほんご", meaning: "Japanese language" },
    日本: { word: "日本", reading: "にほん", meaning: "Japan" },
  },
  KANJI: { 日: { char: "日", jlpt: 5 }, 本: { char: "本", jlpt: 5 }, 語: { char: "語", jlpt: 5 } },
};

let anki;
let actions;
function install(options, { latencyMs = 0, failOn } = {}) {
  anki = createFakeAnki(options);
  actions = [];
  vi.stubGlobal("fetch", async (url, init) => {
    const { action } = JSON.parse(init.body);
    actions.push(action);
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    if (failOn === action) return { json: async () => ({ result: null, error: `${action} failed` }) };
    return anki.fetch(url, init);
  });
}

const motoWords = () => anki.state.notes.filter((n) => n.modelName === MODEL_NAME).map((n) => n.fields.Word);
const synced = (result) => waitFor(() => expect(result.current.lastSynced).not.toBeNull(), { timeout: 3000 });

describe("useAnkiSync (review regressions)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("H1: a sync never overwrites 'I already know this', and skips the card", async () => {
    install();
    const { result } = renderHook(
      () => {
        const progress = useProgress();
        const sync = useAnkiSync({
          dataset: DATASET,
          bookmarks: [{ item_id: "日本語" }],
          userTagsFor: () => [],
          graphWords: [],
          statusFor: (w) => progress.getStatus("word", w),
          applyStatuses: progress.applyStatuses,
        });
        return { progress, sync };
      },
      { wrapper: AuthProvider }
    );
    act(() => result.current.progress.setStatus("word", "日本語", "known"));
    await act(() => result.current.sync.connect());
    await waitFor(() => expect(result.current.sync.lastSynced).not.toBeNull(), { timeout: 3000 });
    expect(result.current.progress.getStatus("word", "日本語")).toBe("known");
    expect(motoWords()).toEqual([]); // no study card for a word you already know
  });

  it("M1: a bookmark added mid-sync is pushed by a follow-up sync, not dropped", async () => {
    install(undefined, { latencyMs: 60 });
    const { result, rerender } = renderHook((p) => useAnkiSync(p), {
      initialProps: { dataset: DATASET, bookmarks: [{ item_id: "日本語" }], userTagsFor: () => [], graphWords: [], applyStatuses: vi.fn() },
    });
    await act(() => result.current.connect());
    await waitFor(() => expect(result.current.syncing).toBe(true), { timeout: 3000 });
    rerender({
      dataset: DATASET,
      bookmarks: [{ item_id: "日本語" }, { item_id: "日本" }],
      userTagsFor: () => [],
      graphWords: [],
      applyStatuses: vi.fn(),
    });
    await waitFor(() => expect(motoWords()).toEqual(["日本語", "日本"]), { timeout: 5000 });
  });

  it("M2: disconnecting mid-sync stays disconnected and stops syncing", async () => {
    install(undefined, { latencyMs: 60 });
    const { result } = renderHook(() =>
      useAnkiSync({ dataset: DATASET, bookmarks: [{ item_id: "日本語" }], userTagsFor: () => [], graphWords: [], applyStatuses: vi.fn() })
    );
    await act(() => result.current.connect());
    await waitFor(() => expect(result.current.syncing).toBe(true), { timeout: 3000 });
    act(() => result.current.disconnect());
    const callsAtDisconnect = actions.length;
    await act(() => new Promise((r) => setTimeout(r, 1500)));
    expect(result.current.state).toBe("off");
    // At most the requests already in flight finish; nothing new starts.
    expect(actions.length - callsAtDisconnect).toBeLessThanOrEqual(8);
    const settled = actions.length;
    await act(() => new Promise((r) => setTimeout(r, 1200)));
    expect(actions.length).toBe(settled);
  });

  it("M3: adding a tag re-pushes the card's tags", async () => {
    install();
    let tags = [];
    const { result, rerender } = renderHook(() =>
      useAnkiSync({ dataset: DATASET, bookmarks: [{ item_id: "日本語" }], userTagsFor: () => tags, graphWords: [], applyStatuses: vi.fn() })
    );
    await act(() => result.current.connect());
    await synced(result);
    tags = ["verbs"];
    rerender();
    await waitFor(
      () => expect(anki.state.notes.find((n) => n.modelName === MODEL_NAME).tags).toContain("moto::tag::verbs"),
      { timeout: 3000 }
    );
  });

  it("L1: connecting runs one sync, not three", async () => {
    install();
    const { result } = renderHook(() =>
      useAnkiSync({ dataset: DATASET, bookmarks: [{ item_id: "日本語" }], userTagsFor: () => [], graphWords: [], applyStatuses: vi.fn() })
    );
    await act(() => result.current.connect());
    await synced(result);
    await act(() => new Promise((r) => setTimeout(r, 1200)));
    expect(actions.filter((a) => a === "getDeckStats")).toHaveLength(1);
  });

  it("M5: a failing Open-in-Anki reports the real error instead of 'can't reach Anki'", async () => {
    install(undefined, { failOn: "guiBrowse" });
    const { result } = renderHook(() =>
      useAnkiSync({ dataset: DATASET, bookmarks: [], userTagsFor: () => [], graphWords: [], applyStatuses: vi.fn() })
    );
    await act(() => result.current.connect());
    await synced(result);
    await act(() => result.current.browse('"tag:moto"'));
    expect(result.current.state).toBe("connected");
    expect(result.current.error).toBe("guiBrowse failed");
  });
});
