import { useEffect, useState } from "react";

const KEY = "fov.theme.v1";

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

// Dark theme switch: Tailwind runs in class mode, so the `dark` class on <html> is
// the single source of truth for CSS; this hook owns that class, persists the choice,
// and defaults to the system preference on first visit.
export function useTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState<boolean>(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      window.localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch {
      // Not persistable; the in-session toggle still works.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
