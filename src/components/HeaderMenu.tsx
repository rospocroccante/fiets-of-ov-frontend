import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

// The header's real menu: theme switch, language switch and local-data actions plus
// the about/attribution block (the map's attribution control is hidden, so credits
// live here).
export function HeaderMenu({
  onClearRecents,
  onClearSaved,
  dark,
  onToggleTheme,
}: {
  onClearRecents: () => void;
  onClearSaved: () => void;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const { t, toggle: toggleLang } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // min-h-[44px]: the rows measured 36px, which is under a fingertip and this menu is
  // where a phone user reaches for the theme and language switches.
  const item =
    "flex min-h-[44px] w-full items-center px-4 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-night-hover";

  // Escape closes the menu and hands focus back to the button that opened it. Without
  // this a keyboard user who opens the menu can only leave it by tabbing through every
  // row (the backdrop that closes it on click is not reachable from the keyboard).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className="relative" aria-label={t("menu")}>
      <button
        ref={triggerRef}
        type="button"
        aria-pressed={open}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[44px] items-center rounded-full border border-gray-200 px-4 text-sm font-medium transition hover:bg-gray-50 dark:border-night-border dark:hover:bg-night-hover"
      >
        {t("menu")} &#9776;
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t("closeMenu")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-card border border-gray-100 bg-white py-2 shadow-lg dark:border-white/10 dark:bg-night-raised">
            <button type="button" aria-pressed={dark} className={item} onClick={onToggleTheme}>
              <span
                aria-hidden="true"
                className="material-symbols-rounded mr-2 text-[18px] leading-none text-slate-400 dark:text-emerald-300"
              >
                {dark ? "light_mode" : "dark_mode"}
              </span>
              {dark ? t("lightMode") : t("darkMode")}
            </button>
            <div className="my-2 h-px bg-gray-100 dark:bg-night-border" />
            {/* Named in the language it switches TO; the menu stays open so the flip
                of every label is immediately visible. */}
            <button type="button" className={item} onClick={toggleLang}>
              {t("otherLanguage")}
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                onClearRecents();
                setOpen(false);
              }}
            >
              {t("clearRecentSearches")}
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                onClearSaved();
                setOpen(false);
              }}
            >
              {t("clearSavedPlaces")}
            </button>
            <div className="my-2 h-px bg-gray-100 dark:bg-night-border" />
            <div className="px-4 py-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-night-text">Fiets of OV</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400 dark:text-night-subtle">
                {t("aboutText")}
              </p>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
