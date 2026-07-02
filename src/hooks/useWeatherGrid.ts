import { useQuery } from "@tanstack/react-query";

export interface WeatherPoint {
  lat: number;
  lon: number;
  windKmh: number;
  gustKmh: number;
  windDeg: number; // meteorological: direction the wind comes FROM
  cloudPct: number;
}

// A coarse grid over greater Amsterdam: enough to show how wind and cloud cover vary
// across the city without hammering the API (one request, 16 points).
const GRID_LATS = [52.28, 52.34, 52.4, 52.46];
const GRID_LONS = [4.72, 4.84, 4.96, 5.08];

interface OpenMeteoPoint {
  latitude: number;
  longitude: number;
  current: {
    wind_speed_10m: number;
    wind_gusts_10m: number;
    wind_direction_10m: number;
    cloud_cover: number;
  };
}

// Open-Meteo: free, no key, supports multi-point queries via comma lists.
function gridUrl(): string {
  const pts = GRID_LATS.flatMap((lat) => GRID_LONS.map((lon) => [lat, lon] as const));
  const lats = pts.map(([lat]) => lat).join(",");
  const lons = pts.map(([, lon]) => lon).join(",");
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lats}&longitude=${lons}` +
    "&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover"
  );
}

export function useWeatherGrid(enabled: boolean): WeatherPoint[] {
  const query = useQuery<WeatherPoint[]>({
    queryKey: ["weather-grid"],
    enabled,
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(gridUrl());
      if (!res.ok) throw new Error(`weather grid failed: ${res.status}`);
      const data = (await res.json()) as OpenMeteoPoint[];
      if (!Array.isArray(data)) throw new Error("weather grid: unexpected shape");
      return data.map((p) => ({
        lat: p.latitude,
        lon: p.longitude,
        windKmh: p.current.wind_speed_10m,
        gustKmh: p.current.wind_gusts_10m,
        windDeg: p.current.wind_direction_10m,
        cloudPct: p.current.cloud_cover,
      }));
    },
  });
  return query.data ?? [];
}
