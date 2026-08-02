import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { declutterPois, toPoi, usePois } from "./usePois";
import type { Poi, Viewport } from "./usePois";
import { __resetPoiStore } from "../lib/poiStore";

// Overpass is a live-mode feature: the suite runs in mock mode (offline fixture), and
// the partial-failure test flips the flag to exercise the network path.
const mode = vi.hoisted(() => ({ live: false }));
vi.mock("../api/client", () => ({ isLive: () => mode.live }));

afterEach(() => {
  mode.live = false;
  __resetPoiStore();
  window.localStorage.clear();
});

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

test("cells that fail while others answer report a partial gap, not an outage", async () => {
  mode.live = true;
  // The first cell answers, every later attempt fails: the layer shows real places but
  // is missing part of the view, which must not be reported as "no places here".
  let served = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (served) return { ok: false, status: 503, json: async () => ({}) };
      served = true;
      return {
        ok: true,
        json: async () => ({
          elements: [{ id: 7, lat: 52.3705, lon: 4.8905, tags: { amenity: "bar", name: "Bar A" } }],
        }),
      };
    }),
  );
  // retryDelay 0: usePois asks for one retry per cell, and the default backoff would
  // park this test on a timer for a second.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const live = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => usePois(CENTRE), { wrapper: live });

  await waitFor(() => expect(result.current.partial).toBe(true));
  expect(result.current.error).toBe(false);
  expect(result.current.pois.map((p) => p.name)).toContain("Bar A");
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

test("declutterPois collides on label boxes: east-west neighbours drop, north-south survive", () => {
  const at = (name: string, kind: Poi["kind"], lat: number, lon: number): Poi => ({
    id: name,
    name,
    kind,
    kindLabel: kind,
    lat,
    lon,
  });
  // Two long names 250 m apart. At zoom 14 that is ~43 px: far more than the
  // ~20 px label height, far less than the ~150 px label width. Side by side the
  // boxes overlap and the museum wins; stacked vertically both fit, like Google.
  const eastWest = [
    at("Museum Van Loon Annex", "culture", 52.37, 4.89),
    at("Home Couture by De Ys", "food", 52.37, 4.8936779),
  ];
  expect(declutterPois(eastWest, 14).map((p) => p.name)).toEqual(["Museum Van Loon Annex"]);
  const northSouth = [
    at("Museum Van Loon Annex", "culture", 52.37, 4.89),
    at("Home Couture by De Ys", "food", 52.3722609, 4.89),
  ];
  expect(declutterPois(northSouth, 14)).toHaveLength(2);
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
