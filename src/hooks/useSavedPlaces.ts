import { useCallback, useState } from "react";
import type { Place } from "../api/types";
import { loadJson, saveJson } from "../lib/storage";

const KEY = "fov.savedPlaces.v1";
const MAX = 20;

// A stable identity for "the same spot": ~11 m grid, so re-saving after a tiny pin
// nudge toggles the existing entry instead of duplicating it.
export function placeKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export interface SavedPlace extends Place {
  savedAt: number;
}

// Locally saved places (Maps-style favourites), persisted in localStorage.
export function useSavedPlaces(now: () => number = Date.now) {
  const [places, setPlaces] = useState<SavedPlace[]>(() => loadJson(KEY, []));

  const isSaved = useCallback(
    (lat: number, lon: number) => places.some((p) => p.id === placeKey(lat, lon)),
    [places],
  );

  const toggle = useCallback(
    (p: { name: string; label?: string; lat: number; lon: number }) => {
      setPlaces((prev) => {
        const id = placeKey(p.lat, p.lon);
        const without = prev.filter((s) => s.id !== id);
        const next: SavedPlace[] =
          without.length === prev.length
            ? [
                {
                  id,
                  name: p.name,
                  label: p.label ?? p.name,
                  lat: p.lat,
                  lon: p.lon,
                  savedAt: now(),
                },
                ...prev,
              ].slice(0, MAX)
            : without;
        saveJson(KEY, next);
        return next;
      });
    },
    [now],
  );

  return { places, isSaved, toggle };
}
