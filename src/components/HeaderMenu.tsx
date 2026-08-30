import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

// The header's real menu: theme switch, language switch, local-data actions, the
// privacy notice, and the about block that names every source by name. The map carries
// its own permanent credit (see components/Attribution); this block is the "more
// information" route the OSMF attribution guidelines ask for on top of it, and the only
// place Photon, Nominatim and Overpass are named outside the privacy notice.
export function HeaderMenu({
  onClearRecents,
  onClearSaved,
  onOpenPrivacy,
  dark,
  onToggleTheme,
}: {
  onClearRecents: () => void;
  onClearSaved: () => void;
  onOpenPrivacy: () => void;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const { t, toggle: toggleLang } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  // min-h-[44px]: the rows measured 36px, which is under a fingertip and this menu is
  // where a phone user reaches for the theme and language switches.
  const item =
    "flex min-h-[44px] w-full items-center px-4 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-night-hover";

  // One way out, used by every row that closes: focus has to come back to the trigger,
  // or the row that was focused unmounts and the next Tab starts from the top of the
  // document. This used to be true only for Escape.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Escape closes the menu and hands focus back to the button that opened it, and Tab
  // stays inside it.
  //
  // Measured before the trap: with the menu open at 390x844, six Tabs walked the rows
  // and the seventh landed on the search pill's entry button *behind* the open menu —
  // the panel was still on screen, still covering it, and the focus ring was under it.
  // An open menu is the only thing on screen, so Tab cycles: rows, then the row that
  // closes it ("Close menu", which is also the scrim), then back to the first row.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const nav = navRef.current;
      if (!nav) return;
      // Everything focusable inside the menu, in DOM order, minus the trigger itself:
      // the trigger is outside the panel and Tab must not park on it while the panel
      // is up.
      const stops = [...nav.querySelectorAll<HTMLElement>("button")].filter(
        (b) => b !== triggerRef.current,
      );
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const at = document.activeElement;
      if (!e.shiftKey && (at === last || at === triggerRef.current || !nav.contains(at))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (at === first || at === triggerRef.current || !nav.contains(at))) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav ref={navRef} className="relative" aria-label={t("menu")}>
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
          {/* max-h + overflow, or the menu runs off a phone on its side. Measured at
              844x390: the panel is 423px tall in English and 453px in Dutch against a
              390px screen, anchored under a 48px header — 82px in English and 113px in
              Dutch below the fold, `overflow: visible`, inside a sticky box that clips
              at the viewport. The privacy row was the last thing reachable and the whole
              about block (the only place the map's sources are named) was gone. 6rem is
              the tallest this panel is ever anchored at, so the clamp only bites where
              the panel would otherwise overflow: at 390x844 it is 780px against a 453px
              panel and nothing changes. */}
          <div className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-64 overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white py-2 shadow-lg dark:border-white/10 dark:bg-night-raised">
            <button type="button" aria-pressed={dark} className={item} onClick={onToggleTheme}>
              <span
                aria-hidden="true"
                className="material-symbols-rounded mr-2 text-[18px] leading-none text-slate-400 dark:text-ams-ns"
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
                close();
              }}
            >
              {t("clearRecentSearches")}
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                onClearSaved();
                close();
              }}
            >
              {t("clearSavedPlaces")}
            </button>
            <div className="my-2 h-px bg-gray-100 dark:bg-night-border" />
            <button
              type="button"
              className={item}
              onClick={() => {
                onOpenPrivacy();
                close();
              }}
            >
              {t("privacy")}
            </button>
            <div className="px-4 py-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-night-text">Fiets of OV</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400 dark:text-night-subtle">
                {t("aboutText")}
              </p>
            </div>
          </div>
          {/* Last in the DOM, and therefore the last Tab stop before the trap wraps: the
              scrim is also the explicit "close" the cycle ends on. It used to come
              first, which put a full-screen invisible button ahead of every row. */}
          <button
            type="button"
            aria-label={t("closeMenu")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={close}
          />
        </>
      )}
    </nav>
  );
}
