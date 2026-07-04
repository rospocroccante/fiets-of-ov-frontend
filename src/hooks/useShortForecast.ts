import { useQuery } from "@tanstack/react-query";
import { isLive } from "../api/client";

export interface ForecastHour {
  // Local wall-clock label for the slot, e.g. "15:00".
  time: string;
  tempC: number;
  code: number;
  precipProb: number; // 0..100
}

export interface ShortForecast {
  current: { tempC: number; code: number; isDay: boolean };
  hours: ForecastHour[]; // the next few full hours, oldest first
}

// Deterministic fixture for mock mode: the UI stays fully offline (and tests stay
// hermetic) while still exercising every rendering path, including a rainy hour.
const MOCK_FORECAST: ShortForecast = {
  current: { tempC: 18, code: 2, isDay: true },
  hours: [
    { time: "14:00", tempC: 18, code: 2, precipProb: 10 },
    { time: "15:00", tempC: 19, code: 3, precipProb: 25 },
    { time: "16:00", tempC: 17, code: 61, precipProb: 70 },
    { time: "17:00", tempC: 16, code: 61, precipProb: 60 },
  ],
};

interface OpenMeteoShort {
  current: { temperature_2m: number; weather_code: number; is_day: number };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
}

function buildUrl(lat: number, lon: number): string {
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    "&current=temperature_2m,weather_code,is_day" +
    "&hourly=temperature_2m,weather_code,precipitation_probability" +
    "&forecast_hours=6&timezone=Europe%2FAmsterdam"
  );
}

export function parseShortForecast(data: OpenMeteoShort, nowIso: string): ShortForecast {
  const hours: ForecastHour[] = data.hourly.time
    .map((t, i) => ({
      iso: t,
      time: t.slice(11, 16),
      tempC: Math.round(data.hourly.temperature_2m[i]),
      code: data.hourly.weather_code[i],
      precipProb: data.hourly.precipitation_probability[i] ?? 0,
    }))
    // Keep only slots after "now" so the strip always shows what is coming.
    .filter((h) => h.iso > nowIso)
    .slice(0, 4)
    .map(({ iso: _iso, ...h }) => h);
  return {
    current: {
      tempC: Math.round(data.current.temperature_2m),
      code: data.current.weather_code,
      isDay: data.current.is_day === 1,
    },
    hours,
  };
}

// Short-term forecast (Open-Meteo, free, no key) at the trip's origin. Refreshes
// every 15 minutes; coordinates are rounded so tiny pin nudges reuse the cache entry.
export function useShortForecast(lat: number, lon: number, enabled = true) {
  const query = useQuery<ShortForecast>({
    queryKey: ["short-forecast", lat.toFixed(3), lon.toFixed(3)],
    enabled,
    refetchInterval: 15 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (!isLive()) return MOCK_FORECAST;
      const res = await fetch(buildUrl(lat, lon), { signal });
      if (!res.ok) throw new Error(`forecast failed: ${res.status}`);
      const data = (await res.json()) as OpenMeteoShort;
      if (!data?.current || !Array.isArray(data.hourly?.time)) {
        throw new Error("forecast: unexpected shape");
      }
      // Open-Meteo returns local (Amsterdam) times; compare in that same frame.
      const nowIso = new Date(Date.now())
        .toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" })
        .slice(0, 16)
        .replace(" ", "T");
      return parseShortForecast(data, nowIso);
    },
  });
  return { forecast: query.data ?? null, error: query.isError };
}
