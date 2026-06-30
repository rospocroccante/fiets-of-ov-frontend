import type { Advice, Stop, Place } from "./types";
import { mockAdviceFor, mockStops, mockSearchPlaces } from "./mock";

const MODE = import.meta.env.VITE_API_MODE ?? "mock";

export function isLive(): boolean {
  return MODE === "live";
}

export async function getAdvice(from: string, to: string): Promise<Advice> {
  if (!isLive()) return mockAdviceFor(from, to);
  return liveGetAdvice(from, to);
}

export async function getStops(lat: number, lon: number, radius = 500): Promise<Stop[]> {
  if (!isLive()) return mockStops(lat, lon);
  return liveGetStops(lat, lon, radius);
}

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export async function liveGetAdvice(from: string, to: string): Promise<Advice> {
  const url = `${BASE}/v1/advice?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(await errorDetail(res, "advice unavailable"));
  return (await res.json()) as Advice;
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

export async function searchPlaces(query: string): Promise<Place[]> {
  if (!isLive()) return mockSearchPlaces(query);
  return photonSearch(query);
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

async function photonSearch(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}` +
    `&lat=${AMS_CENTER.lat}&lon=${AMS_CENTER.lon}&limit=8&lang=en`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
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
