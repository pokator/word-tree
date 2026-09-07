const STORAGE_KEY = "word-tree:theme";

/**
 * Applies any explicitly-saved theme choice to the document root
 * synchronously, before React mounts, so there's no flash of the wrong
 * theme. Safe to call in environments without localStorage.
 */
export function initTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
    }
  } catch {
    // localStorage unavailable (privacy mode, etc.) -- fall back to
    // prefers-color-scheme only, handled entirely in CSS.
  }
}

export function getSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore -- theme choice just won't persist this session
  }
}
