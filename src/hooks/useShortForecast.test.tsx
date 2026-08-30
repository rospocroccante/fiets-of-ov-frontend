import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { parseShortForecast, useShortForecast } from "./useShortForecast";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test("parseShortForecast keeps only future slots, capped at ten", () => {
  const data = {
    current: { temperature_2m: 17.6, weather_code: 2, is_day: 1 },
    hourly: {
      // 13:00..24:00 hourly: one past slot (13:00) plus eleven future ones.
      time: Array.from({ length: 12 }, (_, i) => `2026-07-04T${13 + i}:00`),
      temperature_2m: [17, 18, 18.4, 17.2, 16.8, 16, 16, 15, 15, 14, 14, 13],
      weather_code: [1, 2, 3, 61, 61, 3, 80, 3, 2, 2, 1, 1],
      precipitation_probability: [5, 10, 30, 75, 60, 20, 45, 30, 15, 10, 5, 5],
    },
  };
  const f = parseShortForecast(data, "2026-07-04T13:30");
  expect(f.current).toEqual({ tempC: 18, code: 2, isDay: true });
  expect(f.hours).toHaveLength(10);
  expect(f.hours[0]).toEqual({ time: "14:00", tempC: 18, code: 2, precipProb: 10 });
  expect(f.hours[9].time).toBe("23:00");
});

test("mock mode returns the offline fixture without fetching", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useShortForecast(52.37, 4.89), { wrapper });
  await waitFor(() => expect(result.current.forecast).not.toBeNull());
  expect(result.current.forecast!.hours).toHaveLength(10);
  expect(fetchMock).not.toHaveBeenCalled();
});
