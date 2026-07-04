import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toPoi, usePois } from "./usePois";
import type { Viewport } from "./usePois";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CENTRE: Viewport = { south: 52.36, west: 4.88, north: 52.39, east: 4.91, zoom: 16 };

test("returns fixture POIs inside the viewport (mock mode), none below the zoom gate", async () => {
  const { result } = renderHook(() => usePois(CENTRE), { wrapper });
  await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
  // Cafe de Sluis (52.374, 4.892) is inside; Bar Noord (52.40) is outside.
  expect(result.current.map((p) => p.name)).toContain("Cafe de Sluis");
  expect(result.current.map((p) => p.name)).not.toContain("Bar Noord");

  const { result: low } = renderHook(() => usePois({ ...CENTRE, zoom: 13 }), { wrapper });
  expect(low.current).toEqual([]);
});

test("toPoi maps OSM tags to kinds and drops unnamed elements", () => {
  expect(toPoi({ id: 1, lat: 52, lon: 4, tags: { amenity: "bar", name: "Bruin Cafe" } })).toMatchObject({
    kind: "drink",
    kindLabel: "Bar",
    name: "Bruin Cafe",
  });
  expect(toPoi({ id: 2, lat: 52, lon: 4, tags: { tourism: "museum", name: "Rijks" } })).toMatchObject({
    kind: "culture",
    kindLabel: "Museum",
  });
  expect(
    toPoi({ id: 3, lat: 52, lon: 4, tags: { amenity: "fast_food", name: "Snackbar" } }),
  ).toMatchObject({ kindLabel: "Fast food" });
  expect(toPoi({ id: 4, lat: 52, lon: 4, tags: { amenity: "bar" } })).toBeNull();
});
