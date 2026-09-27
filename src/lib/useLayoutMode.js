import { useSyncExternalStore } from "react";

/**
 * Which shape the app takes, from the viewport's width AND height -- width
 * alone called a landscape phone (844x390) a "phone" and stacked 230px of
 * chrome over a 150px-tall graph, and called a 932px-wide one "desktop".
 *
 *  - "rail":    short landscape on a touch screen or narrow window (phones
 *               on their side). Header + definition in a left rail, graph
 *               at full height.
 *  - "phone":   narrow. Stacked, one pane expanded at a time.
 *  - "tablet":  portrait tablets and mid-width windows. Stacked, both panes
 *               visible, with a draggable divider.
 *  - "desktop": side by side.
 *
 * App.css keys its per-layout rules off the matching `data-layout`
 * attribute on .app, so structure (App/PaneLayout) and styling can't
 * disagree about which layout is active.
 */
export function layoutFor(width, height, { coarse = false } = {}) {
  // A short mouse-driven desktop window (devtools docked at the bottom)
  // isn't a phone on its side -- it keeps the desktop layout.
  if (height <= 500 && width > height && (coarse || width <= 1000)) return "rail";
  if (width < 700) return "phone";
  if (width <= 900 || (height > width && width <= 1100)) return "tablet";
  return "desktop";
}

// The on-screen keyboard shrinks the viewport's height (on Android, and in
// any browser that resizes content for it) without the device turning.
// Taken at face value, typing into search would flip a portrait phone into
// the rail -- and back when the keyboard closes -- reflowing the whole page
// under the user's fingers. So height is judged by the tallest it has been
// at the current width: a keyboard only ever lowers it, while a rotation
// changes the width and starts the measurement over.
let trackedWidth = null;
let tallestAtWidth = 0;

function stableHeight(width, height) {
  if (width !== trackedWidth) {
    trackedWidth = width;
    tallestAtWidth = height;
  } else if (height > tallestAtWidth) {
    tallestAtWidth = height;
  }
  return tallestAtWidth;
}

function isCoarsePointer() {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
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
  const width = window.innerWidth;
  return layoutFor(width, stableHeight(width, window.innerHeight), { coarse: isCoarsePointer() });
}

/** Server/test fallback: desktop, the layout every existing test assumes. */
function getServerSnapshot() {
  return "desktop";
}

export function useLayoutMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
