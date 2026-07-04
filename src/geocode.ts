import type { Coords } from "./api/types";
import { isLive } from "./api/client";

// Forward geocoding is the backend's job (/v1/plan resolves names itself); the
// frontend only reverse-geocodes map picks and pin drags into display labels.
const KNOWN: Record<string, Coords> = {
  "amsterdam centraal": { lat: 52.3791, lon: 4.9003 },
  centraal: { lat: 52.3791, lon: 4.9003 },
  vondelpark: { lat: 52.3580, lon: 4.8686 },
  dam: { lat: 52.3731, lon: 4.8926 },
  bijlmer: { lat: 52.3169, lon: 4.9469 },
  polder: { lat: 52.3400, lon: 4.8200 },
};

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

export interface ReverseDetail {
  name: string;
  // Human-readable address line (Nominatim display_name without the leading name),
  // null when nothing better than coordinates is known.
  address: string | null;
}

// Reverse-geocode a coordinate to a name plus address detail. Never throws: on any
// failure it falls back to the coordinates as the name, so callers always get text.
export async function reverseGeocodeDetail(lat: number, lon: number): Promise<ReverseDetail> {
  if (!isLive()) {
    const known = mockReverse(lat, lon);
    return known
      ? { name: known, address: "Amsterdam" }
      : { name: coordLabel(lat, lon), address: null };
  }
  try {
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=json&zoom=16" +
      `&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { name: coordLabel(lat, lon), address: null };
    const data = (await res.json()) as { name?: string; display_name?: string };
    const display = data.display_name?.trim() || null;
    const name = (data.name && data.name.trim()) || display?.split(",")[0]?.trim();
    if (!name || name.length === 0) return { name: coordLabel(lat, lon), address: null };
    const address = display && display !== name ? display.replace(`${name}, `, "") : null;
    return { name, address };
  } catch {
    return { name: coordLabel(lat, lon), address: null };
  }
}

// Name-only variant used by pin drags and map picks.
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  return (await reverseGeocodeDetail(lat, lon)).name;
}
