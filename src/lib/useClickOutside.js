import { useEffect, useRef } from "react";

// Backs every dropdown/popover in the header and graph toolbars (Filters,
// Sign in). Without this, two popovers anchored near the same corner (the
// header's Sign in button drops down right on top of the graph panel's
// Filters button below it) could stay open at once and visually collide --
// closing on an outside click keeps at most one open at a time, as well as
// being the behavior users already expect from a popover.
// `onOutside` is read via a ref rather than listed as an effect dependency
// so passing a fresh inline callback each render (the common case) doesn't
// tear down and re-attach the document listeners on every render -- only
// toggling `active` does that.
export function useClickOutside(active, onOutside) {
  const ref = useRef(null);
  const onOutsideRef = useRef(onOutside);

  // Synced in its own effect, not during render -- writing a ref's
  // `.current` while rendering is a React anti-pattern (oxlint's
  // react/refs rule flags it) even though this particular ref never
  // drives a re-render itself.
  useEffect(() => {
    onOutsideRef.current = onOutside;
  });

  useEffect(() => {
    if (!active) return undefined;

    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutsideRef.current();
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onOutsideRef.current();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active]);

  return ref;
}
