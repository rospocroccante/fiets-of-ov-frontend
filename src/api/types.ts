export type Mode = "bike" | "transit";

export interface Advice {
  recommendation: Mode;
  reason: string;
  bike_minutes: number;
  transit_minutes: number | null;
  max_rain_mm_per_h: number | null;
  rain_expected: boolean | null;
}

export interface Stop {
  stop_id: string;
  code: string | null;
  name: string;
  lat: number;
  lon: number;
  location_type: number;
  distance_m: number;
}

export interface Coords {
  lat: number;
  lon: number;
}

export interface Place {
  id: string;
  name: string;
  label: string;
  lat: number;
  lon: number;
  kind?: string;
}

// --- Rich trip plan (GET /v1/plan): drawable route + step-by-step detail ---

export interface PlaceRef {
  name: string | null;
  lat: number | null;
  lon: number | null;
}

export interface PlanStep {
  distance_m: number | null;
  direction: string | null;
  street: string | null;
}

export interface PlanLeg {
  mode: string; // BICYCLE | WALK | SUBWAY | TRAM | BUS | RAIL | FERRY
  minutes: number;
  distance_m: number | null;
  route: string | null; // transit line short name, e.g. "52"
  route_long_name: string | null;
  headsign: string | null;
  from: PlaceRef;
  to: PlaceRef;
  geometry: string | null; // encoded polyline (precision 5)
  start_time: number; // epoch ms
  end_time: number; // epoch ms
  steps: PlanStep[];
}

export interface Itinerary {
  minutes: number;
  distance_m: number;
  start_time: number;
  end_time: number;
  legs: PlanLeg[];
}

export interface Plan {
  recommendation: Mode;
  reason: string;
  max_rain_mm_per_h: number | null;
  rain_expected: boolean | null;
  origin: PlaceRef;
  destination: PlaceRef;
  bike: Itinerary;
  transit: Itinerary | null;
}
