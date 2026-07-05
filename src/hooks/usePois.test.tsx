import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { declutterPois, toPoi, usePois } from "./usePois";
import type { Poi, Viewport } from "./usePois";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CENTRE: Viewport = { south: 52.36, west: 4.88, north: 52.39, east: 4.91, zoom: 16 };

test("returns fixture POIs inside the viewport (mock mode), none below the zoom gate", async () => {
  const { result } = renderHook(() => usePois(CENTRE), { wrapper });
  await waitFor(() => expect(result.current.pois.length).toBeGreaterThan(0));
  // Cafe de Sluis (52.374, 4.892) is inside; Bar Noord (52.40) is outside.
  expect(result.current.pois.map((p) => p.name)).toContain("Cafe de Sluis");
  expect(result.current.pois.map((p) => p.name)).not.toContain("Bar Noord");
  expect(result.current.error).toBe(false);

  const { result: low } = renderHook(() => usePois({ ...CENTRE, zoom: 13 }), { wrapper });
  expect(low.current.pois).toEqual([]);
});

test("declutterPois thins crowded labels by zoom and lets culture win the spot", () => {
  const at = (name: string, kind: Poi["kind"], lat: number, lon: number): Poi => ({
    id: name,
    name,
    kind,
    kindLabel: kind,
    lat,
    lon,
  });
  // Three POIs within ~30 m of each other, one 300 m away.
  const cluster = [
    at("bar", "drink", 52.37, 4.89),
    at("museum", "culture", 52.3701, 4.89),
    at("snack", "food", 52.3702, 4.89),
    at("faraway", "food", 52.373, 4.89),
  ];
  // At zoom 14 (150 m separation) only one of the cluster survives - the museum
  // (culture outranks drink and food) - plus the distant one.
  const thin = declutterPois(cluster, 14);
  expect(thin.map((p) => p.name).sort()).toEqual(["faraway", "museum"]);
  // At street zoom everything shows.
  expect(declutterPois(cluster, 17)).toHaveLength(4);
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
