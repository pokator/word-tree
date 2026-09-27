import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { layoutFor, useLayoutMode } from "./useLayoutMode";

describe("layoutFor", () => {
  it.each([
    [390, 844, "phone"], // phone portrait
    [844, 390, "rail"], // phone landscape
    [932, 430, "rail"], // big phone landscape (was "desktop" by width alone)
    [780, 360, "rail"], // android landscape
    [820, 1180, "tablet"], // iPad Air portrait
    [1024, 1366, "tablet"], // iPad Pro portrait
    [800, 700, "tablet"], // mid-width window
    [1180, 820, "desktop"], // tablet landscape
    [1440, 900, "desktop"],
  ])("%ix%i -> %s", (w, h, expected) => {
    expect(layoutFor(w, h)).toBe(expected);
  });
});

describe("useLayoutMode", () => {
  const original = { w: window.innerWidth, h: window.innerHeight };
  afterEach(() => {
    window.innerWidth = original.w;
    window.innerHeight = original.h;
  });

  it("follows rotation", () => {
    window.innerWidth = 390;
    window.innerHeight = 844;
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe("phone");
    act(() => {
      window.innerWidth = 844;
      window.innerHeight = 390;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe("rail");
  });
});
