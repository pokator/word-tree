import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useProgress } from "./useProgress";
import { AuthProvider } from "../auth/AuthContext";
import { GUEST_PROGRESS_KEY } from "../lib/guestStore";

// Tests run without Supabase configured: the signed-out (localStorage) path.
describe("useProgress.applyStatuses", () => {
  beforeEach(() => localStorage.clear());

  it("applies a batch of synced statuses and persists them", () => {
    const { result } = renderHook(() => useProgress(), { wrapper: AuthProvider });
    act(() =>
      result.current.applyStatuses([
        ["word:日本", "known"],
        ["word:本当", "learning"],
      ])
    );
    expect(result.current.getStatus("word", "日本")).toBe("known");
    expect(result.current.wordStats).toMatchObject({ known: 1, learning: 1 });
    expect(JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY))).toEqual({ "word:日本": "known", "word:本当": "learning" });
  });

  it("is a no-op when nothing changed", () => {
    const { result } = renderHook(() => useProgress(), { wrapper: AuthProvider });
    act(() => result.current.applyStatuses([["word:日本", "known"]]));
    const before = result.current.getStatus;
    act(() => result.current.applyStatuses([["word:日本", "known"]]));
    expect(result.current.getStatus).toBe(before);
  });
});
