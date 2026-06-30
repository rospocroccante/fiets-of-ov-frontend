import { useQuery } from "@tanstack/react-query";
import { getPlan, getStops } from "../api/client";
import { buildPlanView, type PlanView } from "../lib/planView";
import type { PlaceRef, Stop } from "../api/types";
import type { Trip } from "../components/SearchBar";

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
  view: PlanView;
  origin: LatLon | null;
  destination: LatLon | null;
  stops: Stop[];
}

function coords(ref: PlaceRef): LatLon | null {
  return ref.lat != null && ref.lon != null ? { lat: ref.lat, lon: ref.lon } : null;
}

export function useTripPlan(trip: Trip | null): TripPlanView {
  const query = useQuery<TripData>({
    queryKey: ["plan", trip?.from, trip?.to],
    enabled: trip !== null,
    queryFn: async () => {
      const t = trip!;
      const plan = await getPlan(t.from, t.to);
      const destination = coords(plan.destination);
      const stops = destination
        ? await getStops(destination.lat, destination.lon).catch(() => [])
        : [];
      return { view: buildPlanView(plan), origin: coords(plan.origin), destination, stops };
    },
  });

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
    view: query.data.view,
    origin: query.data.origin,
    destination: query.data.destination,
    stops: query.data.stops,
  };
}
