import { useEffect, useState } from "react";

// Live media-query flag for layout decisions that CSS alone cannot make (motion
// transforms computed in JS). Falls back to `fallback` where matchMedia is
// unavailable (jsdom).
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : fallback,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Legacy Safari (< 14) shipped MediaQueryList before it became an EventTarget:
    // no addEventListener there, and the old optional call subscribed to nothing -
    // the flag froze at its mount value, so a rotation or resize across the
    // breakpoint kept the wrong layout until a remount. addListener is its spelling.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);
  return matches;
}
