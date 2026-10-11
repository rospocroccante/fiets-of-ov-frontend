import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DURATION_MS, EASE_CSS, prefersReducedMotion } from "../lib/motion";

const KEY = "fov.theme.v1";

// The page colour of each theme, for the browser chrome: white by day, `night.bg` in
// tailwind.config.js at night. index.html carries the same pair as its two
// theme-color metas, which follow the system scheme until the user picks a theme here.
const CHROME = { light: "#ffffff", dark: "#0C1E32" } as const;

function initialDark(): boolean {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "dark") return true;
    if (saved === "light") return false;
  } catch {
    // Storage may be unavailable (private mode); fall through to the system default.
  }
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

// A point in the viewport, in CSS pixels: where the new theme's circle opens from.
export interface RevealOrigin {
  x: number;
  y: number;
}

// The centre of the control the user pressed, which is where the circle starts.
export function centreOf(el: Element): RevealOrigin {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Dark theme switch: Tailwind runs in class mode, so the `dark` class on <html> is
// the single source of truth for CSS; this hook owns that class, persists the choice,
// and defaults to the system preference on first visit.
//
// Where the browser has view transitions, the new theme opens as a circle from the
// switch over the old one (the keyframes are in index.css). The browser snapshots the
// page, runs the callback, and snapshots again, so the callback has to leave the DOM in
// the new theme before it returns: the state update is flushed and the class written
// there, not left to a later render and effect. Reduced motion, and any browser without
// the API, get the instant switch.
export function useTheme(): { dark: boolean; toggle: (origin?: RevealOrigin) => void } {
  const [dark, setDark] = useState<boolean>(initialDark);
  const latest = useRef<ViewTransition | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      window.localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch {
      // Not persistable; the in-session toggle still works.
    }
    // Both metas, whatever their media query: once the user has chosen a theme the
    // browser chrome follows that choice, not the system scheme.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", dark ? CHROME.dark : CHROME.light);
    }
  }, [dark]);

  const toggle = (origin?: RevealOrigin) => {
    const root = document.documentElement;
    if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
      setDark((d) => !d);
      return;
    }
    // No origin (a caller without a control to measure) opens from the top-right
    // corner, where the home's switch sits. The radius reaches the farthest corner, so
    // the circle has covered the whole viewport when it stops.
    const { x, y } = origin ?? { x: window.innerWidth, y: 0 };
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty("--reveal-x", `${x}px`);
    root.style.setProperty("--reveal-y", `${y}px`);
    root.style.setProperty("--reveal-r", `${r}px`);
    root.style.setProperty("--reveal-duration", `${DURATION_MS.reveal}ms`);
    root.style.setProperty("--reveal-ease", EASE_CSS.enter);
    // Colour transitions would animate the new snapshot a second time inside the
    // circle; index.css holds them still while this class is on.
    root.classList.add("theme-switching");
    const transition = document.startViewTransition(() => {
      // Read from the class, not from `dark`: a second tap before the first callback
      // has run must flip the theme back, and only the DOM has the first tap's result.
      const next = !root.classList.contains("dark");
      flushSync(() => setDark(next));
      root.classList.toggle("dark", next);
    });
    latest.current = transition;
    // A transition skipped by the next tap settles early; only the last one clears.
    const done = () => {
      if (latest.current === transition) root.classList.remove("theme-switching");
    };
    transition.finished.then(done, done);
  };

  return { dark, toggle };
}
