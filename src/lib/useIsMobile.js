import { useSyncExternalStore } from "react";

// Same breakpoint App.css's mobile media queries use -- keep the two in
// step, since the mobile layout is part CSS (spacing, sizing) and part
// structure (App renders a different shell below it), and a mismatch would
// show the desktop SplitPane with mobile styling or vice versa.
export const MOBILE_QUERY = "(max-width: 900px)";

function getMediaQueryList() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY)
    : null;
}

function subscribe(onChange) {
  const mql = getMediaQueryList();
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return getMediaQueryList()?.matches ?? false;
}

/** True below the mobile breakpoint. Environments without matchMedia
 * (jsdom, SSR) report desktop, the layout every existing test assumes. */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
