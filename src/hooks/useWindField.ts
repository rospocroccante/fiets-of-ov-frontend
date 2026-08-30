import { useQuery } from "@tanstack/react-query";
import { isLive } from "../api/client";

// A regular grid over the wider Amsterdam region for the animated wind field.
// leaflet-velocity interpolates between nodes, so ~0.1 deg spacing is plenty.
const LAT_NORTH = 52.62;
const LAT_SOUTH = 52.1;
const LON_WEST = 4.4;
const LON_EAST = 5.4;
const NY = 9;
const NX = 9;

export interface VelocityRecord {
  header: {
    parameterCategory: number;
    parameterNumber: number;
    nx: number;
    ny: number;
    lo1: number;
    la1: number;
    lo2: number;
    la2: number;
    dx: number;
    dy: number;
  };
  data: number[];
}

interface OpenMeteoPoint {
  current: { wind_speed_10m: number; wind_direction_10m: number };
}

// Meteorological direction is where the wind comes FROM (degrees clockwise from
// north): eastward u and northward v components therefore point the opposite way.
export function toUV(speedMs: number, directionDeg: number): [number, number] {
  const rad = (directionDeg * Math.PI) / 180;
  return [-speedMs * Math.sin(rad), -speedMs * Math.cos(rad)];
}

function gridUrl(): string {
  const lats: number[] = [];
  const lons: number[] = [];
  for (let iy = 0; iy < NY; iy++) {
    for (let ix = 0; ix < NX; ix++) {
      // Row-major from the north-west corner, scanning east then south — the order
      // leaflet-velocity expects the data arrays in.
      lats.push(LAT_NORTH - (iy * (LAT_NORTH - LAT_SOUTH)) / (NY - 1));
      lons.push(LON_WEST + (ix * (LON_EAST - LON_WEST)) / (NX - 1));
    }
  }
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lats.map((v) => v.toFixed(3)).join(",")}` +
    `&longitude=${lons.map((v) => v.toFixed(3)).join(",")}` +
    "&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms"
  );
}

// leaflet-velocity's grib-json shape: one record for U (2,2), one for V (2,3), both
// over the same grid.
function toRecords(u: number[], v: number[]): VelocityRecord[] {
  const header = {
    nx: NX,
    ny: NY,
    lo1: LON_WEST,
    la1: LAT_NORTH,
    lo2: LON_EAST,
    la2: LAT_SOUTH,
    dx: (LON_EAST - LON_WEST) / (NX - 1),
    dy: (LAT_NORTH - LAT_SOUTH) / (NY - 1),
  };
  return [
    { header: { ...header, parameterCategory: 2, parameterNumber: 2 }, data: u },
    { header: { ...header, parameterCategory: 2, parameterNumber: 3 }, data: v },
  ];
}

// Offline fixture for mock mode: a steady 6 m/s south-wester, the Amsterdam default,
// so the particle layer animates without a call to open-meteo.com (same rule as
// useShortForecast's MOCK_FORECAST).
function mockWindField(): VelocityRecord[] {
  const [u, v] = toUV(6, 225);
  return toRecords(Array(NX * NY).fill(u), Array(NX * NY).fill(v));
}

export interface WindFieldState {
  data: VelocityRecord[] | null;
  error: boolean;
}

export function useWindField(enabled: boolean): WindFieldState {
  const query = useQuery<VelocityRecord[]>({
    queryKey: ["wind-field"],
    enabled,
    refetchInterval: 15 * 60 * 1000,
    // Current conditions change slowly; a chip re-toggle within the refresh window
    // must not refetch the 81-point grid.
    staleTime: 15 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (!isLive()) return mockWindField();
      const res = await fetch(gridUrl(), { signal });
      if (!res.ok) throw new Error(`wind field failed: ${res.status}`);
      const points = (await res.json()) as OpenMeteoPoint[];
      if (!Array.isArray(points) || points.length !== NX * NY) {
        throw new Error("wind field: unexpected shape");
      }
      const u: number[] = [];
      const v: number[] = [];
      for (const p of points) {
        const [pu, pv] = toUV(p.current.wind_speed_10m, p.current.wind_direction_10m);
        u.push(pu);
        v.push(pv);
      }
      return toRecords(u, v);
    },
  });
  return { data: query.data ?? null, error: query.isError };
}
