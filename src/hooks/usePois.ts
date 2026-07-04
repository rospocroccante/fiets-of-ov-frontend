import { useQuery } from "@tanstack/react-query";
import { isLive } from "../api/client";

// Named points of interest (bars, restaurants, museums...) for the Maps-style POI
// layer. Only fetched at neighbourhood zoom, where names are readable and the
// Overpass payload stays small.
export const POI_MIN_ZOOM = 16;
const MAX_POIS = 60;

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

function overpassQuery(v: Viewport): string {
  const bbox = `${v.south.toFixed(4)},${v.west.toFixed(4)},${v.north.toFixed(4)},${v.east.toFixed(4)}`;
  return (
    "[out:json][timeout:10];(" +
    `node["amenity"~"^(restaurant|fast_food|ice_cream|cafe|bar|pub)$"]["name"](${bbox});` +
    `node["tourism"~"^(museum|attraction|gallery)$"]["name"](${bbox});` +
    `);out body ${MAX_POIS} qt;`
  );
}

// Cache key cell: bbox rounded so tiny pans reuse the same entry.
function cellKey(v: Viewport): string {
  return [v.south, v.west, v.north, v.east].map((x) => x.toFixed(3)).join(",");
}

export function usePois(viewport: Viewport | null): Poi[] {
  const enabled = viewport != null && viewport.zoom >= POI_MIN_ZOOM;
  const query = useQuery<Poi[]>({
    queryKey: ["pois", viewport ? cellKey(viewport) : "off"],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const v = viewport as Viewport;
      if (!isLive()) {
        return MOCK_POIS.filter(
          (p) => p.lat >= v.south && p.lat <= v.north && p.lon >= v.west && p.lon <= v.east,
        );
      }
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: overpassQuery(v),
        signal,
      });
      if (!res.ok) throw new Error(`overpass failed: ${res.status}`);
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return (data.elements ?? [])
        .map(toPoi)
        .filter((p): p is Poi => p !== null)
        .slice(0, MAX_POIS);
    },
  });
  return query.data ?? [];
}
