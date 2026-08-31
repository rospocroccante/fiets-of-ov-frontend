import type { Plan, Stop, Place } from "./types";
import { mockPlanFor, mockStops, mockSearchPlaces } from "./mock";
import { anySignal } from "../lib/abortSignal";

// Defaults are dev-server defaults, not deploy defaults. A production build cannot
// reach this fallback: vite.config.ts refuses to build unless VITE_API_MODE is set
// explicitly, so a host with no configuration fails at build time instead of shipping
// fixtures that look like real answers. See the deployment section of the README.
const MODE = import.meta.env.VITE_API_MODE ?? "mock";
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export function isLive(): boolean {
  return MODE === "live";
}

// How long a live request may hang before it is given up on. The backend plans a
// multimodal route through OpenTripPlanner, which is slower than a lookup, so it gets
// the longest leash; stops and places are enrichments and should not hold the UI.
const PLAN_TIMEOUT_MS = 15_000;
const STOPS_TIMEOUT_MS = 8000;
const PLACES_TIMEOUT_MS = 6000;

export type ApiErrorKind = "timeout" | "network" | "http" | "shape";

// Callers only get a message today - useTripPlan turns a thrown Error into
// `{ status: "error", message }` and ResultsPanel prints that string - so the messages
// below have to stand on their own in front of a user. `kind` is there for the day the
// UI wants to branch (offer a retry on a timeout, not on a 400) without parsing prose.
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
  }
}

const TIMEOUT_MESSAGE = "the routing service did not answer in time";
const NETWORK_MESSAGE = "could not reach the routing service";

// Same shape as the one in usePois: a per-request deadline that still honours a caller
// that has moved on. Feature-guarded because AbortSignal.timeout is recent enough that
// an older browser would otherwise take down every request instead of a few; anySignal
// covers the engines that have timeout() but not any(), where the caller's own signal
// used to be silently dropped in favour of the deadline.
function withTimeout(outer: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return outer;
  }
  const t = AbortSignal.timeout(ms);
  return outer ? anySignal(outer, t) : t;
}

// A fetch rejection carries no status, so the two cases have to be told apart by the
// abort reason. Our own deadline surfaces as TimeoutError; some engines still report a
// plain AbortError, and since the deadline is the only abort we install ourselves (a
// caller's abort is checked before this is consulted), both mean "took too long".
function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

async function fetchOrExplain(
  url: string,
  signal: AbortSignal | undefined,
  ms: number,
): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: withTimeout(signal, ms),
    });
  } catch (e) {
    // The caller cancelled deliberately (a superseded query, an unmounted view). That
    // is not a failure to report, so it is passed through untouched.
    if (signal?.aborted) throw e;
    throw isTimeout(e)
      ? new ApiError("timeout", TIMEOUT_MESSAGE)
      : new ApiError("network", NETWORK_MESSAGE);
  }
}

export async function getStops(
  lat: number,
  lon: number,
  radius = 500,
  signal?: AbortSignal,
): Promise<Stop[]> {
  if (!isLive()) return mockStops(lat, lon);
  return liveGetStops(lat, lon, radius, signal);
}

export async function getPlan(from: string, to: string, signal?: AbortSignal): Promise<Plan> {
  if (!isLive()) return mockPlanFor(from, to);
  return liveGetPlan(from, to, signal);
}

export async function liveGetPlan(from: string, to: string, signal?: AbortSignal): Promise<Plan> {
  const url = `${BASE}/v1/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetchOrExplain(url, signal, PLAN_TIMEOUT_MS);
  if (!res.ok) throw new ApiError("http", await errorDetail(res, "plan unavailable"));
  let plan: Plan;
  try {
    plan = (await res.json()) as Plan;
  } catch (e) {
    // A 200 that is not JSON is the signature of a static host answering for a backend
    // that is not there, which is what a live build deployed without a proxy does. The
    // raw SyntaxError ("Unexpected token <") would reach the results panel verbatim.
    if (signal?.aborted) throw e;
    throw isTimeout(e)
      ? new ApiError("timeout", TIMEOUT_MESSAGE)
      : new ApiError("shape", "unexpected server response");
  }
  // The Plan shape is hand-maintained against the backend. Fail with a readable
  // message on drift instead of letting a TypeError escape from deep inside the
  // view builder and reach the results panel verbatim.
  if (!plan || typeof plan.recommendation !== "string" || !Array.isArray(plan.options)) {
    throw new ApiError("shape", "unexpected server response");
  }
  return plan;
}

// Stops decorate a plan that is already on screen, so every failure - including the
// timeout - degrades to "no stops" rather than taking the plan down with it. Only a
// deliberate cancellation propagates.
export async function liveGetStops(
  lat: number,
  lon: number,
  radius: number,
  signal?: AbortSignal,
): Promise<Stop[]> {
  const url = `${BASE}/v1/stops?lat=${lat}&lon=${lon}&radius=${radius}`;
  try {
    const res = await fetchOrExplain(url, signal, STOPS_TIMEOUT_MS);
    if (!res.ok) return [];
    return (await res.json()) as Stop[];
  } catch (e) {
    if (signal?.aborted) throw e;
    return [];
  }
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
  // Photon is a third party on the typing path: it gets a deadline too, so a hung
  // autocomplete cannot leave the field spinning. PlaceInput already treats a
  // rejection as "no suggestions", so the abort needs no special handling here.
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: withTimeout(signal, PLACES_TIMEOUT_MS),
  });
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
