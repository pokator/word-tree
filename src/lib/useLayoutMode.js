import { useSyncExternalStore } from "react";

/**
 * Which shape the app takes, from the viewport's width AND height -- width
 * alone called a landscape phone (844x390) a "phone" and stacked 230px of
 * chrome over a 150px-tall graph, and called a 932px-wide one "desktop".
 *
 *  - "rail":    short landscape (phones on their side, short windows).
 *               Header + definition in a left rail, graph at full height.
 *  - "phone":   narrow. Stacked, one pane expanded at a time.
 *  - "tablet":  portrait tablets and mid-width windows. Stacked, both panes
 *               visible, with a draggable divider.
 *  - "desktop": side by side.
 *
 * App.css keys its per-layout rules off the matching `data-layout`
 * attribute on .app, so structure (App/PaneLayout) and styling can't
 * disagree about which layout is active.
 */
export function layoutFor(width, height) {
  if (height <= 500 && width > height) return "rail";
  if (width < 700) return "phone";
  if (width <= 900 || (height > width && width <= 1100)) return "tablet";
  return "desktop";
}

function subscribe(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function getSnapshot() {
  return layoutFor(window.innerWidth, window.innerHeight);
}

/** Server/test fallback: desktop, the layout every existing test assumes. */
function getServerSnapshot() {
  return "desktop";
}

export function useLayoutMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
