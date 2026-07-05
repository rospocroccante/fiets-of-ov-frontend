import { useQueries } from "@tanstack/react-query";
import { isLive } from "../api/client";

// Named points of interest (bars, restaurants, museums...) for the Maps-style POI
// layer. Only fetched at neighbourhood zoom, where names are readable and the
// Overpass payload stays small. 14 covers the typical fitBounds zoom of a cross-town
// route, so places appear without hunting for the zoom control.
export const POI_MIN_ZOOM = 14;
const MAX_POIS = 60;

// Overpass instances, tried in order. In dev the first stop is the vite proxy
// (same-origin, server-side hop: this network has intermittently refused browser
// connections to overpass-api.de); then the canonical host and public mirrors.
// A dead endpoint must not mean "no places".
const OVERPASS_ENDPOINTS = [
  ...(import.meta.env.DEV ? ["/overpass"] : []),
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export type PoiKind = "food" | "drink" | "culture" | "other";

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  kindLabel: string;
  lat: number;
  lon: number;
}

export interface Viewport {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

const AMENITY_KIND: Record<string, PoiKind> = {
  restaurant: "food",
  fast_food: "food",
  ice_cream: "food",
  cafe: "drink",
  bar: "drink",
  pub: "drink",
};

const TOURISM_KIND: Record<string, PoiKind> = {
  museum: "culture",
  attraction: "culture",
  gallery: "culture",
};

function label(tag: string): string {
  return tag.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export function toPoi(el: OverpassElement): Poi | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;
  const amenity = tags.amenity ? AMENITY_KIND[tags.amenity] : undefined;
  const tourism = tags.tourism ? TOURISM_KIND[tags.tourism] : undefined;
  const kind = amenity ?? tourism ?? "other";
  const kindTag = amenity ? tags.amenity : tourism ? tags.tourism : null;
  return {
    id: `osm-${el.id}`,
    name,
    kind,
    kindLabel: kindTag ? label(kindTag) : "Place",
    lat: el.lat,
    lon: el.lon,
  };
}

// Offline fixture around the Amsterdam centre for mock mode and tests.
const MOCK_POIS: Poi[] = [
  { id: "m1", name: "Cafe de Sluis", kind: "drink", kindLabel: "Cafe", lat: 52.374, lon: 4.892 },
  { id: "m2", name: "Bar Noord", kind: "drink", kindLabel: "Bar", lat: 52.4, lon: 4.9 },
  { id: "m3", name: "Pizzeria Amstel", kind: "food", kindLabel: "Restaurant", lat: 52.366, lon: 4.898 },
  { id: "m4", name: "Museum Het Schip", kind: "culture", kindLabel: "Museum", lat: 52.385, lon: 4.877 },
];

interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function overpassQuery(v: Bbox): string {
  const bbox = `${v.south.toFixed(4)},${v.west.toFixed(4)},${v.north.toFixed(4)},${v.east.toFixed(4)}`;
  return (
    "[out:json][timeout:10];(" +
    `node["amenity"~"^(restaurant|fast_food|ice_cream|cafe|bar|pub)$"]["name"](${bbox});` +
    `node["tourism"~"^(museum|attraction|gallery)$"]["name"](${bbox});` +
    `);out body ${MAX_POIS} qt;`
  );
}

// POIs are fetched and cached per ~1 km grid cell: panning only loads the cells
// entering the view, while every cell already visited renders instantly from the
// react-query cache (the session's in-memory database of places). Cell borders are
// grid-aligned, so their keys are identical across pans.
const CELL_LAT = 0.01; // ~1.1 km
const CELL_LON = 0.015; // ~1.0 km at Amsterdam's latitude
const MAX_CELLS = 12;

interface Cell extends Bbox {
  key: string;
}

function cellsFor(v: Bbox): Cell[] {
  const s0 = Math.floor(v.south / CELL_LAT);
  const s1 = Math.floor(v.north / CELL_LAT);
  const w0 = Math.floor(v.west / CELL_LON);
  const w1 = Math.floor(v.east / CELL_LON);
  const cells: Cell[] = [];
  for (let i = s0; i <= s1; i++) {
    for (let j = w0; j <= w1; j++) {
      if (cells.length >= MAX_CELLS) return cells;
      cells.push({
        south: i * CELL_LAT,
        west: j * CELL_LON,
        north: (i + 1) * CELL_LAT,
        east: (j + 1) * CELL_LON,
        key: `${i}:${j}`,
      });
    }
  }
  return cells;
}

// Each attempt gets its own timeout so a hanging mirror cannot eat the whole retry
// chain; the react-query signal still aborts everything when the viewport moves on.
function attemptSignal(outer: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return outer;
  }
  const t = AbortSignal.timeout(ms);
  if (!outer) return t;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([outer, t]) : t;
}

async function fetchPois(v: Bbox, signal: AbortSignal | undefined): Promise<Poi[]> {
  let lastError: unknown = new Error("overpass unavailable");
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: overpassQuery(v),
        signal: attemptSignal(signal, 6000),
      });
      if (!res.ok) throw new Error(`overpass failed: ${res.status}`);
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return (data.elements ?? [])
        .map(toPoi)
        .filter((p): p is Poi => p !== null)
        .slice(0, MAX_POIS);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

// Label decluttering, Maps-style: at each zoom keep only POIs a minimum distance
// apart, so names never pile into an unreadable heap; zooming in reveals more.
// Museums win over bars, bars over snack corners, when they compete for a spot.
const KIND_PRIORITY: Record<PoiKind, number> = { culture: 0, drink: 1, food: 2, other: 3 };

function minSeparationM(zoom: number): number {
  if (zoom >= 17) return 0;
  if (zoom >= 16) return 40;
  if (zoom >= 15) return 80;
  return 150;
}

function poiDistM(a: Poi, b: Poi): number {
  const mLon = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dx = (a.lon - b.lon) * mLon;
  const dy = (a.lat - b.lat) * 110_574;
  return Math.hypot(dx, dy);
}

export function declutterPois(pois: Poi[], zoom: number): Poi[] {
  const sep = minSeparationM(zoom);
  if (sep === 0) return pois;
  const ranked = [...pois].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  const kept: Poi[] = [];
  for (const p of ranked) {
    if (kept.every((k) => poiDistM(k, p) >= sep)) kept.push(p);
  }
  return kept;
}

export function usePois(viewport: Viewport | null): { pois: Poi[]; error: boolean } {
  const active = viewport != null && viewport.zoom >= POI_MIN_ZOOM;
  const cells = active ? cellsFor(viewport as Viewport) : [];
  const results = useQueries({
    queries: cells.map((c) => ({
      queryKey: ["pois", c.key],
      staleTime: 30 * 60 * 1000,
      retry: 1,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Poi[]> => {
        if (!isLive()) {
          return MOCK_POIS.filter(
            (p) => p.lat >= c.south && p.lat < c.north && p.lon >= c.west && p.lon < c.east,
          );
        }
        return fetchPois(c, signal);
      },
    })),
  });
  // Union of every loaded cell (dedupe on OSM id): the already-visited area keeps
  // rendering while newly entered cells stream in, so a pan never blanks the layer.
  const seen = new Set<string>();
  const pois: Poi[] = [];
  for (const r of results) {
    for (const p of r.data ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        pois.push(p);
      }
    }
  }
  const error = active && results.length > 0 && pois.length === 0 && results.some((r) => r.isError);
  return { pois, error };
}
