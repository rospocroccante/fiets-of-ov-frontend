import { useQuery } from "@tanstack/react-query";
import { getAdvice, getStops } from "../api/client";
import { geocode } from "../geocode";
import { scoreAdvice, type ScoreResult } from "../lib/score";
import type { Coords, Stop } from "../api/types";
import type { Trip } from "../components/SearchBar";

export interface TripView {
  status: "idle" | "loading" | "error" | "ready";
  result?: ScoreResult;
  origin: Coords | null;
  destination: Coords | null;
  stops: Stop[];
  message?: string;
}

interface TripData {
  result: ScoreResult;
  origin: Coords;
  destination: Coords;
  stops: Stop[];
}

export function useTripAdvice(trip: Trip | null): TripView {
  const query = useQuery<TripData>({
    queryKey: ["trip", trip?.from, trip?.to],
    enabled: trip !== null,
    queryFn: async () => {
      const t = trip!;
      const [advice, origin, destination] = await Promise.all([
        getAdvice(t.from, t.to),
        geocode(t.from),
        geocode(t.to),
      ]);
      const stops = await getStops(destination.lat, destination.lon).catch(() => []);
      return { result: scoreAdvice(advice), origin, destination, stops };
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
    result: query.data.result,
    origin: query.data.origin,
    destination: query.data.destination,
    stops: query.data.stops,
  };
}
