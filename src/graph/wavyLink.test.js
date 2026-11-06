import { describe, expect, it } from "vitest";
import { wavyLinkPath } from "./wavyLink";

const OPTS = { amplitude: 3, halfWavelength: 10 };

describe("wavyLinkPath", () => {
  it("runs along the straight line, starting and ending on the exact points", () => {
    expect(wavyLinkPath(0, 0, 35, 0, OPTS)).toBe("M0,0 Q5,6 10,0 T20,0 T30,0 L35,0");
  });

  it("offsets the wave perpendicular to the line at any angle", () => {
    expect(wavyLinkPath(0, 0, 0, 25, OPTS)).toBe("M0,0 Q-6,5 0,10 T0,20 L0,25");
  });

  it("keeps the existing waves in place when the link stretches", () => {
    const short = wavyLinkPath(0, 0, 35, 0, OPTS);
    const long = wavyLinkPath(0, 0, 58, 0, OPTS);
    expect(long.startsWith(short.replace(" L35,0", ""))).toBe(true);
  });

  it("falls back to a straight line when there's no room for a wave", () => {
    expect(wavyLinkPath(1, 2, 4, 2, OPTS)).toBe("M1,2 L4,2");
    expect(wavyLinkPath(5, 5, 5, 5, OPTS)).toBe("M5,5 L5,5");
  });
});
