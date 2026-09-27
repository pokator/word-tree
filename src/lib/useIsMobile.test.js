import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOBILE_QUERY, useIsMobile } from "./useIsMobile";

function mockMatchMedia(initial) {
  const listeners = new Set();
  const mql = {
    matches: initial,
    media: MOBILE_QUERY,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => mql);
  return {
    set(matches) {
      mql.matches = matches;
      listeners.forEach((fn) => fn());
    },
  };
}

describe("useIsMobile", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("reports desktop when matchMedia is unavailable", () => {
    window.matchMedia = undefined;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("tracks the media query as the viewport crosses the breakpoint", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });
});
