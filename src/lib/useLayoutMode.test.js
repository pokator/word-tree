import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { layoutFor, useLayoutMode } from "./useLayoutMode";

describe("layoutFor", () => {
  it.each([
    [390, 844, false, "phone"], // phone portrait
    [844, 390, true, "rail"], // phone landscape
    [932, 430, true, "rail"], // big phone landscape (was "desktop" by width alone)
    [780, 360, true, "rail"], // android landscape
    [820, 1180, true, "tablet"], // iPad Air portrait
    [1024, 1366, true, "tablet"], // iPad Pro portrait
    [800, 700, false, "tablet"], // mid-width window
    [1180, 820, true, "desktop"], // tablet landscape
    [1440, 900, false, "desktop"],
    [1400, 480, false, "desktop"], // short mouse-driven window stays desktop
    [1400, 480, true, "rail"], // ...but a short touch screen gets the rail
  ])("%ix%i (coarse %s) -> %s", (w, h, coarse, expected) => {
    expect(layoutFor(w, h, { coarse })).toBe(expected);
  });
});

describe("useLayoutMode", () => {
  const original = { w: window.innerWidth, h: window.innerHeight };
  afterEach(() => {
    window.innerWidth = original.w;
    window.innerHeight = original.h;
  });

  function resize(w, h) {
    act(() => {
      window.innerWidth = w;
      window.innerHeight = h;
      window.dispatchEvent(new Event("resize"));
    });
  }

  it("follows rotation", () => {
    resize(390, 844);
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe("phone");
    resize(844, 390);
    expect(result.current).toBe("rail");
    resize(390, 844);
    expect(result.current).toBe("phone");
  });

  it("ignores the on-screen keyboard shrinking the height", () => {
    resize(360, 640);
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe("phone");
    resize(360, 340); // keyboard opens: same width, much shorter
    expect(result.current).toBe("phone");
    resize(924, 1480);
    expect(result.current).toBe("tablet");
    resize(924, 880); // tablet keyboard
    expect(result.current).toBe("tablet");
  });
});
