import { useCallback, useState } from "react";
import { loadJson, saveJson } from "../lib/storage";

const KEY = "fov.recentTrips.v1";
const MAX = 8;

export interface RecentTrip {
  fromLabel: string;
  fromQuery: string;
  toLabel: string;
  toQuery: string;
  at: number;
}

// Search history (Maps-style recents), persisted locally. Deduped on the query pair:
// re-running a trip moves it to the top instead of stacking copies.
export function useRecentTrips(now: () => number = Date.now) {
  const [trips, setTrips] = useState<RecentTrip[]>(() => loadJson(KEY, []));

  const record = useCallback(
    (t: Omit<RecentTrip, "at">) => {
      setTrips((prev) => {
        const next = [
          { ...t, at: now() },
          ...prev.filter((r) => r.fromQuery !== t.fromQuery || r.toQuery !== t.toQuery),
        ].slice(0, MAX);
        saveJson(KEY, next);
        return next;
      });
    },
    [now],
  );

  const clear = useCallback(() => {
    setTrips([]);
    saveJson(KEY, []);
  }, []);

  return { trips, record, clear };
}
