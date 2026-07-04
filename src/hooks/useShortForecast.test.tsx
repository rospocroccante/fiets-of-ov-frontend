import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { parseShortForecast, useShortForecast } from "./useShortForecast";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test("parseShortForecast keeps only future slots, capped at four", () => {
  const data = {
    current: { temperature_2m: 17.6, weather_code: 2, is_day: 1 },
    hourly: {
      time: ["2026-07-04T13:00", "2026-07-04T14:00", "2026-07-04T15:00", "2026-07-04T16:00", "2026-07-04T17:00", "2026-07-04T18:00"],
      temperature_2m: [17, 18, 18.4, 17.2, 16.8, 16],
      weather_code: [1, 2, 3, 61, 61, 3],
      precipitation_probability: [5, 10, 30, 75, 60, 20],
    },
  };
  const f = parseShortForecast(data, "2026-07-04T13:30");
  expect(f.current).toEqual({ tempC: 18, code: 2, isDay: true });
  expect(f.hours).toHaveLength(4);
  expect(f.hours[0]).toEqual({ time: "14:00", tempC: 18, code: 2, precipProb: 10 });
  expect(f.hours[3].time).toBe("17:00");
});

test("mock mode returns the offline fixture without fetching", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useShortForecast(52.37, 4.89), { wrapper });
  await waitFor(() => expect(result.current.forecast).not.toBeNull());
  expect(result.current.forecast!.hours).toHaveLength(4);
  expect(fetchMock).not.toHaveBeenCalled();
});
