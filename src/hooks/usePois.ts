import { useQueries } from "@tanstack/react-query";
import { isLive } from "../api/client";
import { anySignal } from "../lib/abortSignal";
import { getCell, putCell, putMany } from "../lib/poiStore";

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

export type PoiKind = "food" | "drink" | "culture" | "nature" | "shop" | "other";

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  kindLabel: string;
  // Raw OSM tag value (cafe, pub, museum...) so the marker can pick a per-category
  // glyph. Optional because POIs persisted by poiStore before this field existed
  // come back without it; consumers must fall back per kind.
  tag?: string | null;
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

// Every named amenity/tourism/leisure/shop element is a POI. These maps only pin
// down the tags that get their own colour and declutter priority; any other tag in
// those namespaces falls back to a kind instead of being dropped, so "all of OSM"
// really means all of it.
const AMENITY_KIND: Record<string, PoiKind> = {
  restaurant: "food",
  fast_food: "food",
  ice_cream: "food",
  food_court: "food",
  cafe: "drink",
  bar: "drink",
  pub: "drink",
  biergarten: "drink",
  nightclub: "drink",
  theatre: "culture",
  cinema: "culture",
  arts_centre: "culture",
  library: "culture",
  place_of_worship: "culture",
};

const TOURISM_KIND: Record<string, PoiKind> = {
  museum: "culture",
  attraction: "culture",
  gallery: "culture",
  artwork: "culture",
  viewpoint: "culture",
  zoo: "culture",
  aquarium: "culture",
  theme_park: "culture",
};

const LEISURE_KIND: Record<string, PoiKind> = {
  park: "nature",
  garden: "nature",
  nature_reserve: "nature",
  playground: "nature",
  dog_park: "nature",
};

// Tag families in display-priority order: a snack bar inside a park is a snack
// bar first. `shop` needs no per-value map - every shop is kind "shop"; the raw
// value still reaches the marker so a bakery gets a bakery glyph.
function classify(tags: Record<string, string>): { kind: PoiKind; tag: string } | null {
  if (tags.amenity) return { kind: AMENITY_KIND[tags.amenity] ?? "other", tag: tags.amenity };
  if (tags.tourism) return { kind: TOURISM_KIND[tags.tourism] ?? "other", tag: tags.tourism };
  if (tags.leisure) return { kind: LEISURE_KIND[tags.leisure] ?? "other", tag: tags.leisure };
  if (tags.shop) return { kind: "shop", tag: tags.shop };
  return null;
}

function label(tag: string): string {
  return tag.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

interface OverpassElement {
  type?: "node" | "way" | "relation";
  id: number;
  // Nodes carry lat/lon; ways and relations carry an Overpass-computed `center`.
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function toPoi(el: OverpassElement): Poi | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const c = classify(tags);
  return {
    // Node and way ids live in separate OSM sequences and can collide, so the
    // element type must be part of the identity or dedupe eats real places.
    id: `osm-${el.type ?? "node"}-${el.id}`,
    name,
    kind: c?.kind ?? "other",
    kindLabel: c ? label(c.tag) : "Place",
    tag: c?.tag ?? null,
    lat,
    lon,
  };
}

// Offline fixture around the Amsterdam centre for mock mode and tests.
const MOCK_POIS: Poi[] = [
  { id: "m1", name: "Cafe de Sluis", kind: "drink", kindLabel: "Cafe", tag: "cafe", lat: 52.374, lon: 4.892 },
  { id: "m2", name: "Bar Noord", kind: "drink", kindLabel: "Bar", tag: "bar", lat: 52.4, lon: 4.9 },
  { id: "m3", name: "Pizzeria Amstel", kind: "food", kindLabel: "Restaurant", tag: "restaurant", lat: 52.366, lon: 4.898 },
  { id: "m4", name: "Museum Het Schip", kind: "culture", kindLabel: "Museum", tag: "museum", lat: 52.385, lon: 4.877 },
  { id: "m5", name: "Westerpark", kind: "nature", kindLabel: "Park", tag: "park", lat: 52.387, lon: 4.873 },
  { id: "m6", name: "Bakkerij Centrum", kind: "shop", kindLabel: "Bakery", tag: "bakery", lat: 52.372, lon: 4.895 },
];

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function overpassQuery(v: Bbox, cap: number): string {
  const bbox = `${v.south.toFixed(4)},${v.west.toFixed(4)},${v.north.toFixed(4)},${v.east.toFixed(4)}`;
  const timeout = cap > MAX_POIS ? 25 : 10;
  // `nwr` + `out center` folds ways and relations (parks, museums drawn as
  // building outlines) to a single labelled point. The name filter is what keeps
  // "every POI" honest: an unnamed bench has nothing for a label to say.
  return (
    `[out:json][timeout:${timeout}];(` +
    `nwr["amenity"]["name"](${bbox});` +
    `nwr["tourism"]["name"](${bbox});` +
    `nwr["leisure"]["name"](${bbox});` +
    `nwr["shop"]["name"](${bbox});` +
    `);out center ${cap} qt;`
  );
}

// POIs are fetched and cached per ~1 km grid cell: panning only loads the cells
// entering the view, while every cell already visited renders instantly from the
// react-query cache (the session's in-memory database of places). Cell borders are
// grid-aligned, so their keys are identical across pans.
const CELL_LAT = 0.01; // ~1.1 km
const CELL_LON = 0.015; // ~1.0 km at Amsterdam's latitude
// A full-screen desktop map at zoom 14 spans ~9x6 km, so the cap must admit ~60
// cells or part of the view simply never loads. 12 was tuned for a phone viewport
// and truncated a desktop view to its south-west quadrant - places visibly "loaded
// halfway". The cap is affordable because in Amsterdam the bulk prefetch answers
// almost every cell from the store with zero network.
const MAX_CELLS = 60;

interface Cell extends Bbox {
  key: string;
}

function cellsFor(v: Bbox): Cell[] {
  const s0 = Math.floor(v.south / CELL_LAT);
  const s1 = Math.floor(v.north / CELL_LAT);
  const w0 = Math.floor(v.west / CELL_LON);
  const w1 = Math.floor(v.east / CELL_LON);
  const cells: Array<Cell & { d: number }> = [];
  for (let i = s0; i <= s1; i++) {
    for (let j = w0; j <= w1; j++) {
      cells.push({
        south: i * CELL_LAT,
        west: j * CELL_LON,
        north: (i + 1) * CELL_LAT,
        east: (j + 1) * CELL_LON,
        key: `${i}:${j}`,
        // Squared distance from the viewport centre, in cell units (cells are
        // near-square, so no lat/lon weighting needed).
        d: (i - (s0 + s1) / 2) ** 2 + (j - (w0 + w1) / 2) ** 2,
      });
    }
  }
  // Centre-out order: if a viewport still exceeds the cap (deep zoom-out races
  // POI_MIN_ZOOM, ultra-wide screens), the cells that drop are the corners - the
  // least noticeable loss - rather than the entire northern half, which is what
  // the raw row scan surrendered. Key tie-break keeps the order deterministic.
  cells.sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : 1));
  return cells.slice(0, MAX_CELLS).map(({ d: _d, ...cell }) => cell);
}

// Each attempt gets its own timeout so a hanging mirror cannot eat the whole retry
// chain; the react-query signal still aborts everything when the viewport moves on.
// anySignal keeps that true even where AbortSignal.any is missing - falling back to
// the bare timeout there left superseded viewports downloading to their deadline.
function attemptSignal(outer: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return outer;
  }
  const t = AbortSignal.timeout(ms);
  return outer ? anySignal(outer, t) : t;
}

async function fetchPois(
  v: Bbox,
  signal: AbortSignal | undefined,
  cap = MAX_POIS,
): Promise<Poi[]> {
  let lastError: unknown = new Error("overpass unavailable");
  // Bulk prefetch queries need a longer leash than a single-cell fill.
  const attemptMs = cap > MAX_POIS ? 30_000 : 6000;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: overpassQuery(v, cap),
        signal: attemptSignal(signal, attemptMs),
      });
      if (!res.ok) throw new Error(`overpass failed: ${res.status}`);
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return (data.elements ?? [])
        .map(toPoi)
        .filter((p): p is Poi => p !== null)
        .slice(0, cap);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

// Warm the whole city in one shot: a single bulk Overpass query covering central
// Amsterdam, chunked into grid cells and persisted (poiStore), so the POI layer
// renders instantly wherever the user pans - no per-cell network on the way. Cells
// the bulk result leaves empty are stored as known-empty (water, parks) so they do
// not refetch either; that marking is skipped if the result hit the cap, because a
// truncated sweep cannot prove a cell empty. Runs at most once a week; a failure is
// silent (the on-demand per-cell path still works).
// v2: the sweep now covers every named amenity/tourism/leisure/shop element, so a
// v1 timestamp (narrow tag list) must not suppress the wider refetch.
const PREFETCH_META_KEY = "fov.poisPrefetch.v2";
const PREFETCH_TTL_MS = 7 * 24 * 3600 * 1000;
// Central Amsterdam holds well over 8k named places under the widened query; a
// bigger cap keeps the known-empty marking (which requires an uncapped result)
// reachable. ~12k elements is a few MB of JSON, paid at most once a week.
const PREFETCH_CAP = 12_000;
const AMS_CORE: Bbox = { south: 52.32, west: 4.8, north: 52.43, east: 4.99 };

// The cells the sweep can prove empty: only those the swept bbox covers whole. The
// old Math.floor bounds also took every boundary cell that pokes past the sweep
// (the top row spans 52.43-52.44 against a query that stops at 52.43) and marked it
// known-empty - and a stored [] is an answer (see poiStore.getCell), so the
// on-demand path never repaired those cells for a week. Exported for the
// cell-arithmetic regression test. The epsilon absorbs IEEE division noise on
// exactly-aligned edges (4.8 / 0.015 lands a hair above 320); at ~a millionth of a
// cell it is far below any real coordinate step, so a truly partial cell can never
// slip back in.
const CELL_EPS = 1e-6;
export function fullyCoveredCellKeys(v: Bbox): string[] {
  const i0 = Math.ceil(v.south / CELL_LAT - CELL_EPS);
  const i1 = Math.floor(v.north / CELL_LAT + CELL_EPS) - 1;
  const j0 = Math.ceil(v.west / CELL_LON - CELL_EPS);
  const j1 = Math.floor(v.east / CELL_LON + CELL_EPS) - 1;
  const keys: string[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) keys.push(`${i}:${j}`);
  }
  return keys;
}

export async function prefetchAmsterdamPois(): Promise<void> {
  if (!isLive()) return;
  try {
    const raw = window.localStorage.getItem(PREFETCH_META_KEY);
    if (raw && Date.now() - ((JSON.parse(raw) as { at?: number }).at ?? 0) < PREFETCH_TTL_MS) {
      return;
    }
  } catch {
    // Unreadable meta: just prefetch again.
  }
  let all: Poi[];
  try {
    all = await fetchPois(AMS_CORE, undefined, PREFETCH_CAP);
  } catch {
    return;
  }
  const byCell = new Map<string, Poi[]>();
  for (const p of all) {
    const key = `${Math.floor(p.lat / CELL_LAT)}:${Math.floor(p.lon / CELL_LON)}`;
    const list = byCell.get(key) ?? [];
    list.push(p);
    byCell.set(key, list);
  }
  const entries: Array<readonly [string, Poi[]]> = [...byCell.entries()].map(([key, pois]) => [
    key,
    pois.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]).slice(0, MAX_POIS),
  ]);
  if (all.length < PREFETCH_CAP) {
    for (const key of fullyCoveredCellKeys(AMS_CORE)) {
      if (!byCell.has(key)) entries.push([key, []]);
    }
  }
  putMany(entries);
  try {
    window.localStorage.setItem(PREFETCH_META_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // Not persistable: the store entries still serve this session.
  }
}

// Label decluttering, Maps-style: a label is not a point but a box on screen -
// a dot with the name running to its right - so two POIs a fair ground distance
// apart still collide when they sit side by side at city zoom. Collision is
// checked between those boxes in CSS pixels, which makes the filter anisotropic
// exactly like Google's: stacked names pack tight, east-west neighbours need
// room for the text. Zooming in stretches metres into more pixels, so more
// labels fit with no per-zoom tuning table.
// Museums win over parks, parks over bars, bars over snack corners, snack corners
// over shops, when they compete for a spot.
const KIND_PRIORITY: Record<PoiKind, number> = {
  culture: 0,
  nature: 1,
  drink: 2,
  food: 3,
  shop: 4,
  other: 5,
};

// Mirrors the .poi-marker CSS: 16px glyph badge (border-box) + 4px gap, 11px
// semibold text capped at 130px, one line high; CHAR_W is that font's average
// glyph width.
const LABEL_DOT_W = 20;
const LABEL_MAX_TEXT_W = 130;
const LABEL_CHAR_W = 6.5;
const LABEL_H = 20;
const LABEL_PAD = 4;

function labelWidthPx(p: Poi): number {
  return LABEL_DOT_W + Math.min(p.name.length * LABEL_CHAR_W, LABEL_MAX_TEXT_W);
}

// Web Mercator ground resolution at the given latitude and zoom.
function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

// Both boxes are anchored at the dot and extend rightwards, vertically centred.
function labelsCollide(a: Poi, b: Poi, zoom: number): boolean {
  const mpp = metersPerPixel(a.lat, zoom);
  const mLon = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dxPx = ((b.lon - a.lon) * mLon) / mpp;
  const dyPx = ((b.lat - a.lat) * 110_574) / mpp;
  const xOverlap = dxPx < labelWidthPx(a) + LABEL_PAD && dxPx + labelWidthPx(b) > -LABEL_PAD;
  const yOverlap = Math.abs(dyPx) < LABEL_H + LABEL_PAD;
  return xOverlap && yOverlap;
}

export function declutterPois(pois: Poi[], zoom: number): Poi[] {
  if (zoom >= 17) return pois;
  const ranked = [...pois].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  const kept: Poi[] = [];
  for (const p of ranked) {
    if (kept.every((k) => !labelsCollide(k, p, zoom))) kept.push(p);
  }
  return kept;
}

export function usePois(viewport: Viewport | null): {
  pois: Poi[];
  error: boolean;
  // True when part of the view is missing: the layer is showing real places, just not
  // all of them. Reporting only the total outage let a few dead cells pass for "there
  // is nothing here", which is the one thing a places layer must never imply.
  partial: boolean;
} {
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
        // The persistent store answers first (bulk-prefetched or previously fetched
        // cells, including known-empty ones); the network only fills true gaps.
        const stored = getCell(c.key);
        if (stored) return stored;
        const pois = await fetchPois(c, signal);
        putCell(c.key, pois);
        return pois;
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
  // Every cell dead is an outage; some cells dead while others answered is a hole in
  // the coverage. Cells still loading count as neither, so a slow mirror does not raise
  // an alarm on its own.
  const failed = results.filter((r) => r.isError).length;
  const error = active && failed > 0 && failed === results.length;
  const partial = active && failed > 0 && failed < results.length;
  return { pois, error, partial };
}
