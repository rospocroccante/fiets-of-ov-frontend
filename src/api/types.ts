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
