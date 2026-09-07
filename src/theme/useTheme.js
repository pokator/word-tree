import { useCallback, useEffect, useState } from "react";
import { getSavedTheme, saveTheme } from "./initTheme";

function resolveTheme() {
  const saved = getSavedTheme();
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Tracks the effective light/dark theme and lets the UI toggle it. */
export function useTheme() {
  const [theme, setTheme] = useState(resolveTheme);

  useEffect(() => {
    if (getSavedTheme()) return; // explicit choice wins; ignore OS changes
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(resolveTheme());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      saveTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
