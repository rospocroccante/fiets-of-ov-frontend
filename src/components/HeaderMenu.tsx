import { useState } from "react";

// The header's real menu: local-data actions plus the about/attribution block
// (the map's attribution control is hidden, so credits live here).
export function HeaderMenu({
  onClearRecents,
  onClearSaved,
}: {
  onClearRecents: () => void;
  onClearSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium transition hover:bg-gray-50"
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
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-card border border-gray-100 bg-white py-2 shadow-lg">
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onClearRecents();
                setOpen(false);
              }}
            >
              Clear recent searches
            </button>
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onClearSaved();
                setOpen(false);
              }}
            >
              Clear saved places
            </button>
            <div className="my-2 h-px bg-gray-100" />
            <div className="px-4 py-1">
              <p className="text-sm font-semibold text-slate-800">Fiets of OV</p>
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
