import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPlan, getStops } from "../api/client";
import { useI18n } from "../lib/i18n";
import { buildPlanView, type PlanView } from "../lib/planView";
import type { PlaceRef, Plan, Stop } from "../api/types";
import type { Trip } from "../trip";

type LatLon = { lat: number; lon: number };

export interface TripPlanView {
  status: "idle" | "loading" | "error" | "ready";
  view?: PlanView;
  origin: LatLon | null;
  destination: LatLon | null;
  stops: Stop[];
  message?: string;
}

interface TripData {
  plan: Plan;
  origin: LatLon | null;
  destination: LatLon | null;
  stops: Stop[];
}

function coords(ref: PlaceRef): LatLon | null {
  return ref.lat != null && ref.lon != null ? { lat: ref.lat, lon: ref.lon } : null;
}

export function useTripPlan(trip: Trip | null): TripPlanView {
  const { lang } = useI18n();
  const query = useQuery<TripData>({
    // The submit nonce is part of the key on purpose: this hook lives in an
    // always-mounted component, so without it a second Search on the same route would
    // hand back the first plan forever, departure times and all.
    queryKey: ["plan", trip?.from, trip?.to, trip?.submit],
    enabled: trip !== null,
    queryFn: async ({ signal }) => {
      const t = trip!;
      // react-query aborts `signal` when this query is superseded (a new submit, a
      // changed endpoint) or unmounted; forwarding it is what actually stops the
      // old request - without it the stale plan kept downloading to its timeout.
      const plan = await getPlan(t.from, t.to, signal);
      const destination = coords(plan.destination);
      const stops = destination
        ? await getStops(destination.lat, destination.lon, 500, signal).catch(() => [])
        : [];
      return { plan, origin: coords(plan.origin), destination, stops };
    },
  });

  // The view's text depends on the UI language, so it is derived outside the query:
  // a language toggle must rebuild it without refetching the plan.
  const view = useMemo(
    () => (query.data ? buildPlanView(query.data.plan, lang) : undefined),
    [query.data, lang],
  );

  if (trip === null) {
    return { status: "idle", origin: null, destination: null, stops: [] };
  }
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "unexpected error";
    return { status: "error", message, origin: null, destination: null, stops: [] };
  }
  if (query.isPending || !query.data) {
    return { status: "loading", origin: null, destination: null, stops: [] };
  }
  return {
    status: "ready",
    view,
    origin: query.data.origin,
    destination: query.data.destination,
    stops: query.data.stops,
  };
}
