import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSavedWords } from "./useSavedWords";
import { AuthProvider } from "../auth/AuthContext";
import { loadGuestBookmarks } from "../lib/guestStore";

// Tests run without Supabase configured, so this is the signed-out path.
describe("useSavedWords (guest)", () => {
  beforeEach(() => localStorage.clear());

  it("bookmarks without an account and keeps them across reloads", () => {
    const { result, unmount } = renderHook(() => useSavedWords(), { wrapper: AuthProvider });
    act(() => result.current.toggleSave("日本"));
    expect(result.current.isSaved("日本")).toBe(true);
    expect(loadGuestBookmarks()).toEqual([{ item_id: "日本", exported_at: null }]);
    unmount();

    const reloaded = renderHook(() => useSavedWords(), { wrapper: AuthProvider });
    expect(reloaded.result.current.isSaved("日本")).toBe(true);
    act(() => reloaded.result.current.toggleSave("日本"));
    expect(loadGuestBookmarks()).toEqual([]);
  });

  it("two toggles before a re-render add the word once", () => {
    const { result } = renderHook(() => useSavedWords(), { wrapper: AuthProvider });
    act(() => {
      result.current.toggleSave("日本");
      result.current.toggleSave("日本");
    });
    expect(result.current.words).toEqual([]);
    act(() => {
      result.current.toggleSave("本当");
    });
    expect(loadGuestBookmarks()).toEqual([{ item_id: "本当", exported_at: null }]);
  });
});
