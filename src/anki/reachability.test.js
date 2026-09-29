import { describe, expect, it, vi } from "vitest";
import { detectAnkiBlock } from "./reachability";

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
};

const permissions = (states) => ({
  query: vi.fn(async ({ name }) => {
    if (!(name in states)) throw new TypeError(`'${name}' is not a valid PermissionName`);
    return { state: states[name] };
  }),
});

describe("detectAnkiBlock", () => {
  it("lets desktop Chrome, Edge, and Firefox try", async () => {
    for (const ua of [UA.chromeMac, UA.edgeWin, UA.firefox]) {
      expect(await detectAnkiBlock({ userAgent: ua }), ua).toBeNull();
    }
  });

  it("flags phones and tablets, whatever the browser", async () => {
    for (const ua of [UA.iphone, UA.chromeIos, UA.android]) {
      expect(await detectAnkiBlock({ userAgent: ua }), ua).toBe("mobile");
    }
  });

  it("flags an iPad posing as a Mac by its touch screen", async () => {
    expect(await detectAnkiBlock({ userAgent: UA.safariMac, maxTouchPoints: 5 })).toBe("mobile");
  });

  it("flags desktop Safari", async () => {
    expect(await detectAnkiBlock({ userAgent: UA.safariMac, maxTouchPoints: 0 })).toBe("safari");
  });

  it("flags a denied local-network permission under either name", async () => {
    for (const name of ["local-network-access", "loopback-network"]) {
      const nav = { userAgent: UA.chromeMac, permissions: permissions({ [name]: "denied" }) };
      expect(await detectAnkiBlock(nav), name).toBe("lna-denied");
    }
  });

  it("doesn't flag a permission that's granted or not yet asked", async () => {
    for (const state of ["granted", "prompt"]) {
      const nav = { userAgent: UA.chromeMac, permissions: permissions({ "local-network-access": state }) };
      expect(await detectAnkiBlock(nav), state).toBeNull();
    }
  });

  it("treats browsers that don't know the permission as not blocked", async () => {
    const nav = { userAgent: UA.chromeMac, permissions: permissions({}) };
    expect(await detectAnkiBlock(nav)).toBeNull();
    expect(await detectAnkiBlock({ userAgent: UA.chromeMac })).toBeNull();
    expect(await detectAnkiBlock(undefined)).toBeNull();
  });

  it("flags an Android tablet in Chrome's desktop mode", async () => {
    const linux =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    // client hints still say Android
    expect(await detectAnkiBlock({ userAgent: linux, userAgentData: { platform: "Android" } })).toBe("mobile");
    // no client hints: a Linux touch screen with no fine pointer
    const coarse = vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: false });
    expect(await detectAnkiBlock({ userAgent: linux, maxTouchPoints: 5 })).toBe("mobile");
    coarse.mockRestore();
  });

  it("lets a Linux touch laptop (trackpad) and a Chromebook try", async () => {
    const fine = vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    const linux =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    expect(await detectAnkiBlock({ userAgent: linux, maxTouchPoints: 10 })).toBeNull();
    fine.mockRestore();
    const cros =
      "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    expect(await detectAnkiBlock({ userAgent: cros, maxTouchPoints: 10 })).toBeNull();
  });

  it("gives up on a permission query that never answers", async () => {
    const nav = { userAgent: UA.chromeMac, permissions: { query: () => new Promise(() => {}) } };
    expect(await detectAnkiBlock(nav, { timeoutMs: 20 })).toBeNull();
  });
});
