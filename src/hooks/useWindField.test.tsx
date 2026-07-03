import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toUV, useWindField } from "./useWindField";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test("toUV converts meteorological from-direction to eastward/northward components", () => {
  // Wind FROM the north (0 deg) blows south: v negative, u ~0.
  const [u0, v0] = toUV(10, 0);
  expect(u0).toBeCloseTo(0);
  expect(v0).toBeCloseTo(-10);
  // Wind FROM the west (270) blows east: u positive.
  const [u270, v270] = toUV(10, 270);
  expect(u270).toBeCloseTo(10);
  expect(v270).toBeCloseTo(0);
});

test("hook builds the two grib-style U/V records from the 81-point grid", async () => {
  const point = { current: { wind_speed_10m: 5, wind_direction_10m: 270 } };
  const fetchMock = vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => Array.from({ length: 81 }, () => point),
  }));
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useWindField(true), { wrapper });
  await waitFor(() => expect(result.current.data).not.toBeNull());

  const url = fetchMock.mock.calls[0][0];
  expect(url).toContain("wind_speed_unit=ms");
  expect(url.match(/latitude=([\d.,]+)/)![1].split(",")).toHaveLength(81);

  const [u, v] = result.current.data!;
  expect(u.header).toMatchObject({ parameterCategory: 2, parameterNumber: 2, nx: 9, ny: 9 });
  expect(v.header.parameterNumber).toBe(3);
  expect(u.header.la1).toBeGreaterThan(u.header.la2); // scan starts at the north edge
  expect(u.data).toHaveLength(81);
  expect(u.data[0]).toBeCloseTo(5); // from the west -> eastward u
  expect(v.data[0]).toBeCloseTo(0);
});

test("an upstream failure surfaces error instead of silent null", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
  );
  const { result } = renderHook(() => useWindField(true), { wrapper });
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.data).toBeNull();
});
