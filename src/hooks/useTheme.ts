import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DURATION_MS, EASE_CSS, prefersReducedMotion } from "../lib/motion";

const KEY = "fov.theme.v1";

// The page colour of each theme, for the browser chrome: white by day, `night.bg` in
// tailwind.config.js at night. index.html carries the same pair as its two
// theme-color metas, which follow the system scheme until the user picks Light or Dark
// here, and follow it again once they pick System.
const CHROME = { light: "#ffffff", dark: "#0C1E32" } as const;

const SCHEME = "(prefers-color-scheme: dark)";

// Light and Dark are a choice and are stored. System is the absence of one: nothing is
// stored and the app follows prefers-color-scheme, including when the OS switches while
// the app is open.
export type ThemeMode = "light" | "dark" | "system";

function initialMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Storage may be unavailable (private mode); fall through to the system default.
  }
  return "system";
}

function systemDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(SCHEME).matches;
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
// the single source of truth for CSS; this hook owns that class. It stores an explicit
// Light or Dark. System mode, which is what a first visit gets, stores nothing and
// follows the system scheme; storing whatever a first visit happened to show used to
// freeze the system default into a choice the user never made.
//
// Where the browser has view transitions, the new theme opens as a circle from the
// switch over the old one (the keyframes are in index.css). The browser snapshots the
// page, runs the callback, and snapshots again, so the callback has to leave the DOM in
// the new theme before it returns: the state update is flushed and the class written
// there, not left to a later render and effect. Reduced motion, and any browser without
// the API, get the instant switch. So does the OS switching under System mode: nobody
// pressed anything for a circle to open from.
export function useTheme(): {
  dark: boolean;
  mode: ThemeMode;
  toggle: (origin?: RevealOrigin) => void;
  setMode: (mode: ThemeMode, origin?: RevealOrigin) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [dark, setDark] = useState<boolean>(() => (mode === "system" ? systemDark() : mode === "dark"));
  const latest = useRef<ViewTransition | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    // A chosen theme drives both metas, whatever their media query: the browser chrome
    // follows the choice, not the system scheme. System mode gives each meta its own
    // scheme's colour back, which hands the chrome to the browser again.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      const media = meta.getAttribute("media") ?? "";
      const own = mode === "system" && media.includes("prefers-color-scheme");
      const metaDark = own ? media.includes("dark") : dark;
      meta.setAttribute("content", metaDark ? CHROME.dark : CHROME.light);
    }
  }, [dark, mode]);

  useEffect(() => {
    try {
      if (mode === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, mode);
    } catch {
      // Not persistable; the in-session choice still works.
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(SCHEME);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Legacy Safari (< 14) has only addListener; see useMediaQuery.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [mode]);

  // Moves the page to `next`. "flip" is the toggle's: the opposite of whatever the page
  // shows when the switch actually runs, which is not always `dark` (see the callback).
  const switchTo = (next: boolean | "flip", origin?: RevealOrigin) => {
    const root = document.documentElement;
    if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
      setDark((d) => (next === "flip" ? !d : next));
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
      // A flip settles the mode here too, for the same reason: the toggle's guess from
      // `dark` is stale on that second tap and would record the opposite choice.
      const to = next === "flip" ? !root.classList.contains("dark") : next;
      flushSync(() => {
        setDark(to);
        if (next === "flip") setModeState(to ? "dark" : "light");
      });
      root.classList.toggle("dark", to);
    });
    latest.current = transition;
    // A transition skipped by the next tap settles early; only the last one clears.
    const done = () => {
      if (latest.current === transition) root.classList.remove("theme-switching");
    };
    transition.finished.then(done, done);
  };

  // The mode changes either way; the page only moves if the darkness does (Dark to
  // System on a dark OS is a change of mode with nothing to show).
  const setMode = (next: ThemeMode, origin?: RevealOrigin) => {
    setModeState(next);
    const target = next === "system" ? systemDark() : next === "dark";
    if (target !== dark) switchTo(target, origin);
  };

  const toggle = (origin?: RevealOrigin) => {
    setModeState(dark ? "light" : "dark");
    switchTo("flip", origin);
  };

  return { dark, mode, toggle, setMode };
}
