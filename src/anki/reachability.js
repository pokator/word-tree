import { useEffect, useState } from "react";

/**
 * Why this browser probably can't reach AnkiConnect from this page, or null
 * if it might. Advisory only -- the panel leads with the .tsv export when
 * this says "blocked" but still lets you try connecting, since browsers
 * change and a guess shouldn't lock anyone out.
 *
 *  - "mobile":     a phone/tablet -- no Anki desktop to talk to (AnkiConnect
 *                  is a desktop add-on; iOS has none, Android's lacks the
 *                  calls Moto needs).
 *  - "safari":     desktop Safari blocks an https page from calling
 *                  http://127.0.0.1, where AnkiConnect listens.
 *  - "lna-denied": Chrome/Edge 142+ asked to let this site reach devices on
 *                  your local network, and it was refused.
 */
export async function detectAnkiBlock(nav = globalThis.navigator, { timeoutMs = 1500 } = {}) {
  if (!nav) return null;
  const sync = browserBlock(nav);
  if (sync) return sync;
  // A permissions query that never settles mustn't leave the panel waiting.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return (await Promise.race([localNetworkDenied(nav), timeout])) ? "lna-denied" : null;
}

/** The part of detectAnkiBlock that's known synchronously, from the user agent. */
export function browserBlock(nav = globalThis.navigator) {
  if (!nav) return null;
  const ua = nav.userAgent ?? "";
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  const touch = (nav.maxTouchPoints ?? 0) > 0;
  const iPadOS = /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
  // Chrome on big Android tablets asks for the desktop site by default and
  // sends a Linux user agent then. Client hints still say Android; failing
  // that, a Linux touch screen with no mouse or trackpad is a tablet (a
  // touch laptop has a fine pointer, and still gets to try connecting).
  const androidDesktopMode =
    nav.userAgentData?.platform === "Android" ||
    (/X11; Linux|Linux x86_64/.test(ua) && !/CrOS/.test(ua) && touch && !hasFinePointer());
  if (/iPhone|iPad|iPod|Android/.test(ua) || iPadOS || androidDesktopMode) return "mobile";
  if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|OPR/.test(ua)) return "safari";
  return null;
}

function hasFinePointer() {
  try {
    return globalThis.matchMedia?.("(any-pointer: fine)").matches ?? true;
  } catch {
    return true;
  }
}

// Chrome shipped this as "local-network-access", and is splitting it into
// "loopback-network" (127.0.0.1 -- AnkiConnect's case) and "local-network".
// Browsers that don't know a name reject the query; that's "not denied".
async function localNetworkDenied(nav) {
  if (!nav.permissions?.query) return false;
  for (const name of ["loopback-network", "local-network-access"]) {
    try {
      const status = await nav.permissions.query({ name });
      if (status.state === "denied") return true;
    } catch {
      // unsupported permission name
    }
  }
  return false;
}

/** detectAnkiBlock as React state: the reason, null if nothing's in the
 * way, or undefined while the permission check is still out. The user-agent
 * part is known on the first render; the rest usually takes a few ms, and
 * callers hold the Connect card until then so it never flashes. */
export function useAnkiBlock() {
  const [block, setBlock] = useState(() => browserBlock() ?? undefined);
  useEffect(() => {
    if (block !== undefined) return;
    let live = true;
    detectAnkiBlock().then(
      (reason) => live && setBlock(reason ?? null),
      () => live && setBlock(null)
    );
    return () => {
      live = false;
    };
  }, [block]);
  return block;
}
