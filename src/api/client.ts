import type { Plan, Stop, Place } from "./types";
import { mockPlanFor, mockStops, mockSearchPlaces } from "./mock";

const MODE = import.meta.env.VITE_API_MODE ?? "mock";
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export function isLive(): boolean {
  return MODE === "live";
}

export async function getStops(lat: number, lon: number, radius = 500): Promise<Stop[]> {
  if (!isLive()) return mockStops(lat, lon);
  return liveGetStops(lat, lon, radius);
}

export async function getPlan(from: string, to: string): Promise<Plan> {
  if (!isLive()) return mockPlanFor(from, to);
  return liveGetPlan(from, to);
}

export async function liveGetPlan(from: string, to: string): Promise<Plan> {
  const url = `${BASE}/v1/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(await errorDetail(res, "plan unavailable"));
  const plan = (await res.json()) as Plan;
  // The Plan shape is hand-maintained against the backend. Fail with a readable
  // message on drift instead of letting a TypeError escape from deep inside the
  // view builder and reach the results panel verbatim.
  if (!plan || typeof plan.recommendation !== "string" || !Array.isArray(plan.options)) {
    throw new Error("unexpected server response");
  }
  return plan;
}

export async function liveGetStops(lat: number, lon: number, radius: number): Promise<Stop[]> {
  const url = `${BASE}/v1/stops?lat=${lat}&lon=${lon}&radius=${radius}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  return (await res.json()) as Stop[];
}

// Amsterdam bias + bbox for place autocomplete.
const AMS_CENTER = { lat: 52.3728, lon: 4.8936 };
function inAmsterdam(lat: number, lon: number): boolean {
  return lon >= 4.728 && lon <= 5.079 && lat >= 52.278 && lat <= 52.431;
}

// The signal is how a superseded keystroke stops costing bandwidth: the caller aborts
// the previous lookup as soon as the query moves on, instead of leaving it running and
// having to ignore an answer that arrives out of order.
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (!isLive()) return mockSearchPlaces(query);
  return photonSearch(query, signal);
}

interface PhotonFeature {
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    osm_value?: string;
  };
  geometry: { coordinates: [number, number] };
}

async function photonSearch(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}` +
    `&lat=${AMS_CENTER.lat}&lon=${AMS_CENTER.lon}&limit=8&lang=en`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .map((f, i) => {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry.coordinates;
      const extra = [p.street && p.street !== p.name ? p.street : null, p.district]
        .filter(Boolean)
        .join(", ");
      return {
        id: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : `photon-${i}`,
        name: p.name ?? q,
        label: extra ? `${p.name ?? q}, ${extra}` : (p.name ?? q),
        lat,
        lon,
        kind: p.osm_value,
      } as Place;
    })
    .filter((p) => inAmsterdam(p.lat, p.lon))
    .slice(0, 6);
}

async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}
