import { afterEach, describe, expect, it, vi } from "vitest";
import { track, trackOnce } from "./analytics";

describe("analytics", () => {
  afterEach(() => {
    delete window.umami;
  });

  it("is a no-op when the tracker isn't loaded", () => {
    expect(() => track("bookmark")).not.toThrow();
  });

  it("forwards events to Umami", () => {
    window.umami = { track: vi.fn() };
    track("bookmark", { signedIn: false });
    expect(window.umami.track).toHaveBeenCalledWith("bookmark", { signedIn: false });
  });

  it("swallows tracker errors", () => {
    window.umami = { track: () => { throw new Error("blocked"); } };
    expect(() => track("bookmark")).not.toThrow();
  });

  it("trackOnce fires only the first time per page load", () => {
    window.umami = { track: vi.fn() };
    trackOnce("first-expand");
    trackOnce("first-expand");
    expect(window.umami.track).toHaveBeenCalledTimes(1);
  });
});
