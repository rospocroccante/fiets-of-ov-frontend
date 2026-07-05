import type { Itinerary, PlanLeg } from "../api/types";
import { decodePolyline } from "./polyline";
import { transitLabel } from "./planView";

// Pure geometry + nav-plan builder for turn-by-turn navigation. No React.

export interface NavManeuver {
  at: number; // meters from route start where the maneuver occurs
  direction: string; // OTP relative direction, plus synthetic BOARD | ALIGHT | ARRIVE
  street: string | null; // street name, or transit description for BOARD/ALIGHT
  legIndex: number;
}

export interface NavRoute {
  points: [number, number][]; // all leg geometries concatenated, [lat, lon]
  cum: number[]; // cumulative meters at each point; cum[0] === 0
  total: number; // === cum[cum.length - 1]
  maneuvers: NavManeuver[]; // sorted by `at`, ends with ARRIVE at `total`
}

export interface NavProgress {
  snapped: { lat: number; lon: number }; // nearest point on the route
  along: number; // meters from route start
  offRouteM: number; // meters from the raw fix to `snapped`
  remaining: number; // total - along
  next: NavManeuver | null; // first maneuver with at > along + 5
  toNext: number; // max(0, next.at - along)
}

// Equirectangular plane: at city scale the error vs the ellipsoid is well under 1%,
// far below GPS accuracy, and it keeps snapping O(n) with cheap math.
const M_LAT = 110_574;
const mLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function distM(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * M_LAT;
  const dx = (b[1] - a[1]) * mLon((a[0] + b[0]) / 2);
  return Math.hypot(dx, dy);
}

// Same fallback rule as MapView legCoords, minus the ferry special case: navigation
// wants the real dock-to-dock line, not a straight shortcut across the water.
function legCoords(leg: PlanLeg): [number, number][] {
  if (leg.geometry) return decodePolyline(leg.geometry);
  const pts: [number, number][] = [];
  if (leg.from.lat != null && leg.from.lon != null) pts.push([leg.from.lat, leg.from.lon]);
  if (leg.to.lat != null && leg.to.lon != null) pts.push([leg.to.lat, leg.to.lon]);
  return pts;
}

export function buildNavRoute(itinerary: Itinerary): NavRoute {
  const points: [number, number][] = [];
  const cum: number[] = [];
  const maneuvers: NavManeuver[] = [];

  itinerary.legs.forEach((leg, legIndex) => {
    const coords = legCoords(leg);
    if (coords.length < 2) return;

    const legStart = cum.length ? cum[cum.length - 1] : 0;
    for (const pt of coords) {
      const prev = points[points.length - 1];
      if (!prev) {
        points.push(pt);
        cum.push(0);
        continue;
      }
      // Deduplicate the seam point when a leg starts where the previous ended.
      if (prev[0] === pt[0] && prev[1] === pt[1]) continue;
      points.push(pt);
      cum.push(cum[cum.length - 1] + distM(prev, pt));
    }
    const legEnd = cum[cum.length - 1];

    if (leg.steps.length > 0) {
      // The k-th step's turn happens where the step begins: legStart plus the
      // distances of all previous steps, clamped to the leg's polyline length.
      let offset = legStart;
      for (const s of leg.steps) {
        // DEPART is dropped: the banner starts with the first real turn.
        if (s.direction && s.direction !== "DEPART") {
          maneuvers.push({
            at: Math.min(offset, legEnd),
            direction: s.direction,
            street: s.street,
            legIndex,
          });
        }
        offset += s.distance_m ?? 0;
      }
    } else if (leg.route != null) {
      const line = `${transitLabel(leg.mode)} ${leg.route}`;
      maneuvers.push({
        at: legStart,
        direction: "BOARD",
        street: leg.headsign != null ? `${line} towards ${leg.headsign}` : line,
        legIndex,
      });
      maneuvers.push({
        at: legEnd,
        direction: "ALIGHT",
        street: leg.to.name ?? "your stop",
        legIndex,
      });
    }
  });

  const total = cum.length ? cum[cum.length - 1] : 0;
  // Construction order already yields ascending `at`; sort is a stable safeguard.
  maneuvers.sort((a, b) => a.at - b.at);
  maneuvers.push({
    at: total,
    direction: "ARRIVE",
    street: null,
    legIndex: Math.max(0, itinerary.legs.length - 1),
  });
  return { points, cum, total, maneuvers };
}

// Project the fix onto segment a-b in a plane centred on the fix; returns the clamped
// parametric position t in [0, 1] and the fix-to-projection distance in meters.
function projectOnSegment(
  lat: number,
  lon: number,
  a: [number, number],
  b: [number, number],
): { t: number; dist: number } {
  const kx = mLon(lat);
  const ax = (a[1] - lon) * kx;
  const ay = (a[0] - lat) * M_LAT;
  const dx = (b[1] - lon) * kx - ax;
  const dy = (b[0] - lat) * M_LAT - ay;
  const len2 = dx * dx + dy * dy;
  // Zero-length segments must not divide by zero: treat them as their start point.
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return { t, dist: Math.hypot(ax + t * dx, ay + t * dy) };
}

export function progressAlong(route: NavRoute, lat: number, lon: number): NavProgress {
  const { points, cum, total, maneuvers } = route;

  let snapped = { lat, lon };
  let along = 0;
  let offRouteM = 0;

  if (points.length === 1) {
    snapped = { lat: points[0][0], lon: points[0][1] };
    offRouteM = distM([lat, lon], points[0]);
  } else if (points.length > 1) {
    let bestI = 0;
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i + 1 < points.length; i++) {
      const { t, dist } = projectOnSegment(lat, lon, points[i], points[i + 1]);
      if (dist < bestDist) {
        bestI = i;
        bestT = t;
        bestDist = dist;
      }
    }
    const a = points[bestI];
    const b = points[bestI + 1];
    snapped = { lat: a[0] + bestT * (b[0] - a[0]), lon: a[1] + bestT * (b[1] - a[1]) };
    along = cum[bestI] + bestT * (cum[bestI + 1] - cum[bestI]);
    offRouteM = bestDist;
  }

  // The 5 m margin keeps the banner from flipping to a passed maneuver while the
  // snapped position jitters right at it.
  const next = maneuvers.find((m) => m.at > along + 5) ?? null;
  return {
    snapped,
    along,
    offRouteM,
    remaining: total - along,
    next,
    toNext: next ? Math.max(0, next.at - along) : 0,
  };
}
