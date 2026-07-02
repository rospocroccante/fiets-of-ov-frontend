import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWeatherGrid } from "./useWeatherGrid";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const point = (lat: number, lon: number) => ({
  latitude: lat,
  longitude: lon,
  current: {
    wind_speed_10m: 23.4,
    wind_gusts_10m: 45.7,
    wind_direction_10m: 313,
    cloud_cover: 30,
  },
});

test("fetches the 16-point grid and maps wind + cloud fields", async () => {
  const fetchMock = vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => [point(52.28, 4.72), point(52.46, 5.08)],
  }));
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useWeatherGrid(true), { wrapper });

  await waitFor(() => expect(result.current).toHaveLength(2));
  const url = fetchMock.mock.calls[0][0];
  expect(url).toContain("api.open-meteo.com");
  // 16 grid points: 16 comma-separated latitudes requested.
  expect(url.match(/latitude=([\d.,]+)/)![1].split(",")).toHaveLength(16);
  expect(url).toContain("wind_speed_10m");
  expect(url).toContain("cloud_cover");
  expect(result.current[0]).toEqual({
    lat: 52.28,
    lon: 4.72,
    windKmh: 23.4,
    gustKmh: 45.7,
    windDeg: 313,
    cloudPct: 30,
  });
});

test("disabled hook never fetches", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderHook(() => useWeatherGrid(false), { wrapper });
  expect(fetchMock).not.toHaveBeenCalled();
});
