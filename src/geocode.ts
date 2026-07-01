import type { Coords } from "./api/types";
import { isLive } from "./api/client";

export class GeocodeError extends Error {}

const AMS_CENTER: Coords = { lat: 52.3728, lon: 4.8936 };

// Amsterdam viewbox for bounding Nominatim (lon_min, lat_min, lon_max, lat_max).
const AMS_VIEWBOX = "4.728,52.278,5.079,52.431";

const KNOWN: Record<string, Coords> = {
  "amsterdam centraal": { lat: 52.3791, lon: 4.9003 },
  centraal: { lat: 52.3791, lon: 4.9003 },
  vondelpark: { lat: 52.3580, lon: 4.8686 },
  dam: { lat: 52.3731, lon: 4.8926 },
  bijlmer: { lat: 52.3169, lon: 4.9469 },
  polder: { lat: 52.3400, lon: 4.8200 },
};

export function parseLatLon(value: string): Coords | null {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

export async function geocode(query: string): Promise<Coords> {
  const direct = parseLatLon(query);
  if (direct) return direct;
  if (!isLive()) return mockGeocode(query);
  return nominatimGeocode(query);
}

function mockGeocode(query: string): Coords {
  const key = query.trim().toLowerCase();
  for (const [name, coords] of Object.entries(KNOWN)) {
    if (key.includes(name)) return coords;
  }
  return AMS_CENTER;
}

async function nominatimGeocode(query: string): Promise<Coords> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1" +
    `&viewbox=${AMS_VIEWBOX}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new GeocodeError(`geocoder ${res.status}`);
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (data.length === 0) throw new GeocodeError(`place not found: ${query}`);
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

function coordLabel(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// Nearest KNOWN place within ~500 m, else null. Mock stand-in for reverse geocoding.
function mockReverse(lat: number, lon: number): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [name, c] of Object.entries(KNOWN)) {
    const d = Math.hypot(c.lat - lat, c.lon - lon);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return bestDist < 0.005 ? best : null; // ~0.005 deg ~ 500 m
}

// Reverse-geocode a coordinate to a human label for display. Never throws: on any
// failure or miss it returns the coordinates as a string, so callers always get text.
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if (!isLive()) return mockReverse(lat, lon) ?? coordLabel(lat, lon);
  try {
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=json&zoom=16" +
      `&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return coordLabel(lat, lon);
    const data = (await res.json()) as { name?: string; display_name?: string };
    const name = (data.name && data.name.trim()) || data.display_name?.split(",")[0]?.trim();
    return name && name.length > 0 ? name : coordLabel(lat, lon);
  } catch {
    return coordLabel(lat, lon);
  }
}
