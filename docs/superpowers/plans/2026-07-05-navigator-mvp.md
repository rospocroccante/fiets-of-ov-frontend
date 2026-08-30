# Navigator MVP Implementation Plan

> For agentic workers: execute task-by-task; each task ends with tsc + eslint + vitest
> green and one commit.

**Goal:** Google-Maps-style turn-by-turn navigation for the selected itinerary: live
position dot, snap-to-route, maneuver banner, remaining ETA, off-route replan, wake lock.

**Architecture:** All frontend. The backend already returns per-leg encoded polylines
and street steps ({distance_m, direction, street}). A pure lib builds a NavRoute
(concatenated points, cumulative meters, maneuvers at route offsets) and computes
progress for a GPS fix. A location hook wraps watchPosition and, in mock mode, a
simulator that replays the route. The overlay renders the next maneuver; MapView shows
the live dot and follows it. App owns the nav state machine and the replan rule.

**Tech stack:** React 18 + TS strict, react-leaflet v4 (frozen options — imperative map
work via useMap children), vitest + testing-library, existing mock in
`src/__mocks__/react-leaflet.tsx` (see vitest alias), Material Symbols via
`index.html` icon_names (MUST stay alphabetical and in sync).

## Global constraints

- No emoji anywhere. No AI/Claude trailers in commits.
- `npx tsc --noEmit`, `npx eslint src --max-warnings 0`, `npx vitest run` all green
  before every commit.
- TDD: failing test first for pure logic (Task 1 especially).
- Comments explain constraints, not narration; match existing file style.
- Distances in meters, coordinates as `{ lat, lon }`, map tuples as `[lat, lon]`.

---

### Task 1: src/lib/routeProgress.ts (+ routeProgress.test.ts)

Pure geometry + nav-plan builder. No React.

Interfaces (exact):

```ts
import type { Itinerary } from "../api/types";

export interface NavManeuver {
  at: number;              // meters from route start where the maneuver occurs
  direction: string;       // OTP relative direction, plus synthetic BOARD | ALIGHT | ARRIVE
  street: string | null;   // street name, or transit description for BOARD/ALIGHT
  legIndex: number;
}

export interface NavRoute {
  points: [number, number][]; // all leg geometries concatenated, [lat, lon]
  cum: number[];              // cumulative meters at each point; cum[0] === 0
  total: number;              // === cum[cum.length - 1]
  maneuvers: NavManeuver[];   // sorted by `at`, ends with ARRIVE at `total`
}

export function buildNavRoute(itinerary: Itinerary): NavRoute;

export interface NavProgress {
  snapped: { lat: number; lon: number }; // nearest point on the route
  along: number;                          // meters from route start
  offRouteM: number;                      // meters from the raw fix to `snapped`
  remaining: number;                      // total - along
  next: NavManeuver | null;               // first maneuver with at > along + 5
  toNext: number;                         // max(0, next.at - along)
}

export function progressAlong(route: NavRoute, lat: number, lon: number): NavProgress;
```

Details:
- Meters math: equirectangular approximation is fine at city scale. Helper
  `const M_LAT = 110_574; const mLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);`
  Distance between two coords and point-to-segment projection both use this plane.
- `buildNavRoute`: decode each leg geometry with `decodePolyline` from `./polyline`
  (skip legs with null geometry or < 2 points; fall back to [from,to] coords when both
  non-null — reuse the same rule as MapView legCoords, minus the ferry special case).
  Deduplicate the seam point when a leg starts where the previous ended.
- Maneuvers: for legs with steps, the k-th step sits at
  legStartCum + sum(steps[0..k-1].distance_m), clamped to legEndCum.
  For transit legs (no steps, route != null): synthesize
  BOARD at legStart (street = `"<mode label> <route> towards <headsign>"`, headsign may
  be null -> just `"<mode label> <route>"`) and ALIGHT at legEnd
  (street = leg.to.name ?? "your stop"). Use `transitLabel` from `./planView`.
  Always append ARRIVE at `total` (street = null).
  Drop DEPART steps (direction === "DEPART"): the banner starts with the first real turn.
- `progressAlong`: O(n) scan over segments, keep the segment with the minimum
  perpendicular distance; `along` = cum[i] + distance from segment start to the
  projection. Ties/degenerate zero-length segments must not divide by zero.

Test cases (write first, RED, then implement):
1. A straight 2-point route of known length: total is ~correct (+-1%), progress at the
   midpoint returns along ~= total/2, offRouteM ~= perpendicular offset for a point
   10 m beside the line, remaining = total - along.
2. Snapping picks the nearest segment on an L-shaped route (a point near the corner's
   second arm maps onto the second segment, along > first segment length).
3. buildNavRoute on a 2-leg itinerary (bike leg with 2 steps + tram leg with route "1",
   headsign "Osdorp"): maneuver offsets are cumulative, BOARD/ALIGHT present with the
   right labels, ARRIVE at total, DEPART dropped.
4. progressAlong past the last maneuver: next is the ARRIVE maneuver until along
   reaches total (then next may be null), remaining reaches ~0.
   Build geometries with encodePolyline? No encoder exists: construct itineraries with
   geometry: null and from/to coords so legCoords falls back to straight lines - that
   keeps fixtures readable.

Commit: `feat: routeProgress lib for turn-by-turn navigation`

---

### Task 2: src/hooks/useLiveLocation.ts + src/hooks/useWakeLock.ts (+ tests)

```ts
export interface Fix {
  lat: number;
  lon: number;
  accuracy: number;        // meters
  heading: number | null;  // degrees, may be null/NaN from the API -> null
  speed: number | null;    // m/s
  at: number;              // epoch ms
}

export interface Simulation {
  points: [number, number][]; // route to replay
  intervalMs?: number;        // default 1000
  stepM?: number;             // meters advanced per tick, default 55 (~200 km/h... no: bike ~5.5 m/s -> default 6)
}

export function useLiveLocation(
  active: boolean,
  simulate?: Simulation,
): { fix: Fix | null; error: string | null };
```

- `active=false`: no watch, fix null, cleanup any previous watch/timer.
- Real path (`simulate` undefined): `navigator.geolocation.watchPosition(ok, err,
  { enableHighAccuracy: true, maximumAge: 1000, timeout: 10_000 })`; map
  GeolocationPosition -> Fix (coords.heading NaN -> null); on error set a short
  human message ("location unavailable" / "location permission denied" for code 1)
  and keep the last fix. `clearWatch` on cleanup. Guard `!("geolocation" in navigator)`
  -> error "location not supported".
- Simulated path: walk the polyline advancing `stepM` (default 6) meters per tick every
  `intervalMs` (default 1000), emitting the interpolated point ON the line with
  accuracy 8, speed = stepM/(intervalMs/1000), heading = bearing of the current
  segment; emit the FIRST fix synchronously on activation (tests and demo need no
  timer to see the dot). Stop at the last point (keep emitting it). Reuse the meter
  helpers pattern from routeProgress locally (do not import private helpers; a tiny
  local copy is fine and keeps the lib private).
- `useWakeLock(active: boolean)`: request `navigator.wakeLock.request("screen")` when
  active, re-acquire on `visibilitychange` when document becomes visible, release on
  cleanup. All in try/catch; absent API = silent no-op. No return value.

Tests (vi.useFakeTimers where needed):
1. simulated: activation emits an immediate fix at the first point; advancing timers
   moves the fix strictly forward along the line; deactivating stops emissions.
2. real: stub `navigator.geolocation` with a fake watchPosition capturing the callback;
   emitting a position updates fix; unmount calls clearWatch with the returned id.
3. wake lock: stub `navigator.wakeLock.request` -> returns { release: vi.fn() };
   active mounts requests once; unmount releases. Missing API does not throw.

Commit: `feat: live location and wake lock hooks`

---

### Task 3: NavigationOverlay + MapView live dot/follow + icons

**src/components/NavigationOverlay.tsx**

```ts
export function NavigationOverlay({
  next,        // NavManeuver | null
  toNext,      // meters
  remaining,   // meters
  etaMinutes,  // number
  onExit,
}: { ... })
```

- Absolute overlay for the map pane top area (`absolute left-3 right-3 top-3
  z-[1000]`): one card (white, rounded-card, shadow-lg) with: a big Material Symbol
  for the maneuver, `formatM(toNext)` ("650 m", under 1 km; "1.2 km" above), the
  street/description line, and a right-side Exit button (aria-label "Exit navigation").
  Below, a slim sub-row: remaining distance + `~{etaMinutes} min`.
- Direction -> glyph map (exhaustive object, default "straight"):
  LEFT/HARD_LEFT -> turn_left; RIGHT/HARD_RIGHT -> turn_right;
  SLIGHTLY_LEFT -> turn_slight_left; SLIGHTLY_RIGHT -> turn_slight_right;
  UTURN_LEFT -> u_turn_left; UTURN_RIGHT -> u_turn_right;
  CIRCLE_CLOCKWISE/CIRCLE_COUNTERCLOCKWISE -> roundabout_right/roundabout_left;
  CONTINUE -> straight; BOARD/ALIGHT -> tram; ARRIVE -> sports_score.
  When next is null: show sports_score + "You have arrived".
- `index.html` icon_names gains (alphabetical, merged into the existing list):
  roundabout_left, roundabout_right, straight, tram, turn_left, turn_right,
  turn_slight_left, turn_slight_right, u_turn_left, u_turn_right.

**MapView** new optional props:

```ts
liveFix?: { lat: number; lon: number; accuracy: number } | null;
navigating?: boolean;
```

- Live dot: `CircleMarker` center fix, radius 7, pathOptions
  `{ color: "#ffffff", weight: 2, fillColor: "#1A73E8", fillOpacity: 1 }` plus a
  `Circle` (import from react-leaflet) with radius = accuracy, pathOptions
  `{ color: "#1A73E8", opacity: 0.25, fillColor: "#1A73E8", fillOpacity: 0.1, weight: 1 }`.
  The test mock (`src/__mocks__/react-leaflet.tsx`) must export `Circle` like
  CircleMarker if it does not already.
- Follow camera: a `FollowCamera({ target, active })` useMap child; on activation
  `map.setView(target, 17)`, then `map.panTo(target)` per target change; guard
  `typeof map.panTo === "function"` (mock safety). While `navigating`, FitRoute must
  not run (pass it `active={!navigating}` and early-return when inactive) or every
  replan snaps the camera away.

Tests:
- NavigationOverlay: renders "650 m" + street + right glyph text for RIGHT; ALIGHT
  shows the stop name; null next -> arrived state; Exit fires onExit.
- MapView: with liveFix set, the dot and accuracy circle render (extend the mock if
  needed); with navigating, FitRoute does not call fitBounds (mock map records calls).
  Keep to what the existing MapView tests can observe cheaply; do not overbuild.

Commit: `feat: navigation overlay, live dot and follow camera`

---

### Task 4: App wiring (Start/Exit, replan, recents guard) + integration test

- State: `const [navigating, setNavigating] = useState(false)`.
- Derivations (memoized): navRoute = buildNavRoute(route) when navigating && route;
  simulation = `!isLive() && navRoute ? { points: navRoute.points } : undefined`;
  `const { fix } = useLiveLocation(navigating, simulation);`
  progress = progressAlong(navRoute, fix.lat, fix.lon) when both exist.
  `useWakeLock(navigating);`
- ETA: `etaMinutes = Math.max(1, Math.round((progress.remaining / navRoute.total) * (route?.minutes ?? 0)))`.
- Start: ResultsPanel gains optional `onStartNav?: () => void`; when provided AND the
  selected option exists, render a compact primary button "Start" next to the
  departure line. App passes `() => setNavigating(true)` only when a route exists.
  Exit: overlay onExit -> setNavigating(false).
- Render: overlay inside the map `<section>` (sibling of MapView, above PlaceInfoCard)
  only while navigating && progress; MapView gets `liveFix={fix}` and
  `navigating={navigating}`.
- Replan rule: an effect watching progress: if `offRouteM > 40` for 3 consecutive
  fixes and at least 20 s since the last replan (useRef timestamps), then
  `geocodeSeq.current.start++`, `setFromText("Current location")`,
  `setOrigin({ label: "Current location", query: coordQuery(fix.lat, fix.lon) })`.
  Keep navigating: when the new plan lands, navRoute rebuilds automatically.
- Recents guard: the recordTrip effect must skip while navigating (do not pollute
  history with "Current location" trips).
- goHome() also setNavigating(false).
- App integration test (mock mode): start a trip, wait for the plan, click Start ->
  the overlay appears (first simulated fix is synchronous; the maneuver banner or the
  arrived state is visible), recents unchanged after Start, click Exit -> overlay gone.

Commit: `feat: turn-by-turn navigation MVP wired into the app`

---

## Final verification

- Full suite + build; manual smoke on :5173 (mock mode demo: Start plays the route).
- Update the Obsidian to-do checkboxes for Fase 1.
