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
export async function detectAnkiBlock(nav = globalThis.navigator) {
  if (!nav) return null;
  return browserBlock(nav) ?? ((await localNetworkDenied(nav)) ? "lna-denied" : null);
}

/** The part of detectAnkiBlock that's known synchronously, from the user agent. */
export function browserBlock(nav = globalThis.navigator) {
  if (!nav) return null;
  const ua = nav.userAgent ?? "";
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  const iPadOS = /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod|Android/.test(ua) || iPadOS) return "mobile";
  if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|OPR/.test(ua)) return "safari";
  return null;
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

/** detectAnkiBlock as React state: the reason, or null. The user-agent
 * part is there on the first render, so a phone or Safari never flashes
 * the Connect card first; a denied permission arrives a moment later. */
export function useAnkiBlock() {
  const [block, setBlock] = useState(() => browserBlock());
  useEffect(() => {
    if (block) return;
    let live = true;
    detectAnkiBlock().then(
      (reason) => live && reason && setBlock(reason),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [block]);
  return block;
}
