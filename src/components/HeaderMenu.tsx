import { useState } from "react";

// The header's real menu: theme switch and local-data actions plus the
// about/attribution block (the map's attribution control is hidden, so credits
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
  const [open, setOpen] = useState(false);
  const item =
    "block w-full px-4 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-white/10";
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium transition hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
      >
        Menu &#9776;
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-card border border-gray-100 bg-white py-2 shadow-lg dark:border-white/10 dark:bg-[#2A2F34]">
            <button type="button" aria-pressed={dark} className={item} onClick={onToggleTheme}>
              <span
                aria-hidden="true"
                className="material-symbols-rounded mr-2 align-[-4px] text-[18px] leading-none text-slate-400 dark:text-emerald-300"
              >
                {dark ? "light_mode" : "dark_mode"}
              </span>
              {dark ? "Light mode" : "Dark mode"}
            </button>
            <div className="my-2 h-px bg-gray-100 dark:bg-white/10" />
            <button
              type="button"
              className={item}
              onClick={() => {
                onClearRecents();
                setOpen(false);
              }}
            >
              Clear recent searches
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                onClearSaved();
                setOpen(false);
              }}
            >
              Clear saved places
            </button>
            <div className="my-2 h-px bg-gray-100 dark:bg-white/10" />
            <div className="px-4 py-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Fiets of OV</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                Rain-aware bike vs transit advice for Amsterdam. Routing by OpenTripPlanner.
                Map data &copy; OpenStreetMap contributors, tiles &copy; CARTO. Rain radar by
                RainViewer, weather by Open-Meteo, places via Overpass.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
