import { useCallback, useReducer, useState } from "react";
import { createSemanticStore } from "./semantic";

/**
 * The page's one semantic store (see data/semantic.js), plus a `version`
 * that bumps whenever a load settles, so anything derived from what's
 * cached (which words still have meaning neighbours to show) re-renders.
 */
export function useSemantic() {
  const [store] = useState(() => {
    const base = import.meta.env.BASE_URL ?? "/";
    const cdn = typeof __DATA_CDN_BASE__ === "undefined" ? null : __DATA_CDN_BASE__;
    return createSemanticStore({ bases: cdn ? [cdn, base] : [base] });
  });
  const [version, bump] = useReducer((x) => x + 1, 0);
  const [failed, setFailed] = useState(false);

  /** Load frequency plus `words`' neighbour shards; rejects on failure. */
  const load = useCallback(
    (words = []) => {
      if (store.isLoaded(words)) return Promise.resolve();
      return store.load(words).then(
        () => {
          setFailed(false);
          bump();
        },
        (err) => {
          console.error("word-tree: couldn't load meaning-mode data:", err);
          setFailed(true);
          bump();
          throw err;
        }
      );
    },
    [store]
  );

  return { store, version, load, failed };
}
