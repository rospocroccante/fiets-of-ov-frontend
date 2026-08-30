# Google Maps-style origin/destination picker — design

Date: 2026-07-01
Status: approved (design) — proceeding to plan + subagent execution
Repo: `fiets-of-ov-frontend`
Branch: `feat/gm-endpoint-picker` (based on `main`)

## Problem

Today you can set the trip origin/destination by (a) typing in the From/To fields
(autocomplete only on the landing) and (b) arming Start/End and clicking the map (results
view only). We want general-purpose endpoint selection with the same interactions Google
Maps offers: current location, autocomplete everywhere, draggable pins, a right-click /
long-press map menu, and origin/destination swap.

## Goals (approved feature set — all four)

1. **Current location (GPS)** for both start and end, high accuracy. Raw coordinates are
   sent to the planner; if the device reports poor accuracy (>100 m) we warn and suggest
   refining on the map. Available on landing and in results.
2. **Draggable A/B pins** — drag a pin to adjust that endpoint; on drop, reverse-geocode a
   display name and re-plan.
3. **Right-click / long-press map menu** — "Directions from here" / "Directions to here"
   at the clicked point (Google's signature interaction).
4. **Autocomplete everywhere + Swap** — bring the autocomplete search field into the
   results search bar (currently plain inputs) and add a swap origin<->destination button.

Base interactions that already exist and must keep working: typed text search, and
arm-Start/End + map click (`MapPickToolbar`).

## Non-goals (YAGNI)

- No turn-by-turn navigation, Street View, saved/recent places, or multi-stop trips.
- No backend changes — `GET /v1/plan` already accepts `"lat,lon"` for `from`/`to`.
- No landing-screen map. The map picker (pins, context menu) stays in the results view.

## Precision model (the core requirement: "deve essere precisa")

Every non-text pick resolves to raw coordinates, formatted `` `${lat.toFixed(6)},${lon.toFixed(6)}` ``
(~0.1 m), stored as the endpoint's `query` and sent verbatim to the planner. The backend's
`parseLatLon` consumes `"lat,lon"` directly — no lossy geocoding round-trip. Reverse
geocoding is used ONLY to produce a human `label` for the field; the coordinate is
authoritative. Selecting an autocomplete suggestion likewise stores the place's exact
`lat,lon` as `query` (Google behavior: a chosen suggestion is an exact point). Free typed
text (no selection) stores the text as `query` and lets the backend geocode it.

## Data model

```ts
// src/trip.ts
export interface Endpoint {
  label: string; // shown in the From/To field
  query: string; // sent to the planner: a name, or "lat,lon" for a precise pick
}
export interface Trip { from: string; to: string } // planner query pair (unchanged)
export interface TripDraft { from: Endpoint; to: Endpoint } // landing -> results handoff
```

`App` is the single source of truth for `origin: Endpoint | null`, `destination:
Endpoint | null`, and `armed: "start" | "end" | null`. The planner `Trip` is derived from
`origin.query` / `destination.query`.

**Re-plan timing:** precise picks (autocomplete select, GPS, map click, drag, context menu,
swap) set the endpoint immediately, which re-plans via the existing
`useTripPlan` query key `["plan", from, to]`. Free typed text updates only the label until
the user presses Enter or Search (`App.commitSearch`), matching current behavior.

## Architecture

### New: `src/geolocate.ts`

```ts
export interface Fix { lat: number; lon: number; accuracy: number }
export type GeoErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";
export class GeoError extends Error { kind: GeoErrorKind }
export const ACCURACY_WARN_M = 100;
export function getCurrentPosition(): Promise<Fix>       // enableHighAccuracy, timeout 10s, maximumAge 0
export function geoErrorMessage(err: unknown): string    // user-facing text by kind
export function accuracyWarning(accuracy: number): string | null  // non-null when > ACCURACY_WARN_M
```

`getCurrentPosition` rejects with `GeoError("unsupported")` when `navigator.geolocation`
is absent; maps `PositionError.code` to `denied` / `timeout` / `unavailable`.

### New: `src/components/UseMyLocationButton.tsx`

Reusable GPS button. Props: `{ onLocated: (ep: Endpoint) => void; className?: string }`.
Flow: click -> `busy` (spinner, disabled) -> `getCurrentPosition()` ->
`query = "lat,lon"`, `label = await reverseGeocode(lat, lon)` -> `onLocated({label, query})`
-> if `accuracyWarning(acc)` non-null, show amber status. On error show red status from
`geoErrorMessage`. `busy` always resets (finally). Renders its own status line.

### New: `src/components/EndpointField.tsx`

The reusable one-endpoint input = `PlaceInput` (autocomplete) + `UseMyLocationButton`.
Props: `{ value: string; placeholder: string; onText: (t: string) => void; onSelect:
(p: Place) => void; onLocate: (ep: Endpoint) => void }`. Used 2x in `HomeHero` and 2x in
`SearchBar`. `PlaceInput` is reused unchanged.

### Modified: `src/components/MapView.tsx`

- **Draggable pins:** A/B become Leaflet `Marker`s with `draggable` and a `L.divIcon` that
  reproduces the current circular colored pin (letter A/B). `eventHandlers.dragend` ->
  `onMovePoint(which, { lat, lon })`. `which` is `"start"` for A, `"end"` for B. Markers
  carry `title="start" | "end"` so the test mock can target them.
- **Context menu:** `useMapEvents({ contextmenu })` -> open an overlay menu positioned by
  `e.containerPoint` (pixel x/y) inside a new `relative` wrapper div that MapView owns. The
  menu has "Directions from here" -> `onContextPick("start", latlon)` and "Directions to
  here" -> `onContextPick("end", latlon)`. The menu closes after a choice and on the next
  map `click`.
- New optional props: `onMovePoint?: (which: "start"|"end", c: LatLon) => void`,
  `onContextPick?: (which: "start"|"end", c: LatLon) => void`. Existing `onPick`/`picking`
  and the arm-toolbar flow stay unchanged (additive).

### Modified: `src/components/SearchBar.tsx`

Two `EndpointField`s (autocomplete + GPS on both) plus a **Swap** button between them and
the existing submit + home. New props (controlled by App): per-endpoint `onText`,
`onSelect`, `onLocate`, plus `onSwap`, keeping `fromValue`/`toValue`, `onSubmit`, `onHome`.
Re-export `Trip` from `../trip` for back-compat with existing importers.

### Modified: `src/components/HomeHero.tsx`

Internal `from`/`to` become `Endpoint`s. Two `EndpointField`s (GPS on both). `submit()`
emits `onSearch(TripDraft)`; popular quick-picks and typed text produce `query = name`;
GPS/select produce `query = "lat,lon"`. Only From/To fields; no map here.

### Modified: `src/App.tsx`

Import `Endpoint`/`TripDraft` from `../trip` (stop redefining `Endpoint` locally). Add
handlers: `setEndpointText(which, text)`, `selectEndpoint(which, place)`,
`locateEndpoint(which, ep)`, `onMovePoint(which, c)`, `onContextPick(which, c)`, `swap()`.
`startTrip(t: TripDraft)` seeds both endpoints from the draft. Wire everything into
`SearchBar` (results) and pass `onMovePoint`/`onContextPick` into `MapView`. The existing
`armPick`/`handlePick` tap-to-set path is preserved.

### Modified: `src/__mocks__/react-leaflet.tsx`

Extend the stub so tests can drive the new interactions:
- `useMapEvents` stores the full handlers object (click + contextmenu).
- `Marker` records its `eventHandlers` keyed by `title` prop.
- Helpers: `__fireMapClick(lat, lng)` (keep), `__fireMapContextMenu(lat, lng, x?, y?)`,
  `__fireMarkerDragEnd(which, lat, lng)`.

## Error handling

- `getCurrentPosition` never leaves a hung spinner; permission denied / unsupported /
  timeout surface a message, never a crash.
- `reverseGeocode` never throws (worst case the field shows coordinates).
- A drag or context-menu pick outside known places still yields valid coordinates.
- Context menu with no `onContextPick` wired, or drag with no `onMovePoint`, is inert.

## Testing

- `geolocate.test.ts`: success resolves `Fix`; denied/timeout/unsupported produce the right
  `GeoError.kind`; `accuracyWarning` threshold (<=100 -> null, >100 -> "±Xm"); message map.
- `UseMyLocationButton.test.tsx`: stub `navigator.geolocation` -> click calls `onLocated`
  with `query = "lat,lon"` and the reverse-geocoded label; accuracy >100 shows amber; denied
  shows red; spinner while busy.
- `EndpointField.test.tsx`: renders the input + GPS button; typing forwards `onText`;
  selecting a suggestion forwards `onSelect`; GPS forwards `onLocate`.
- `MapView.test.tsx`: dragging A/B fires `onMovePoint("start"/"end", coords)`; contextmenu
  opens the menu and "from/to here" fire `onContextPick`.
- `SearchBar.test.tsx`: autocomplete fields present; swap fires `onSwap`; submit fires.
- `HomeHero.test.tsx`: `onSearch` receives a `TripDraft`; GPS fills From with a name while
  its query is coordinates.
- `App.test.tsx`: existing arm+click still sets From; a drag re-plans; a context-menu pick
  sets an endpoint; swap swaps; GPS sets From.
- Existing tests stay green.

## File structure

- Create: `src/trip.ts`, `src/geolocate.ts`, `src/components/UseMyLocationButton.tsx`,
  `src/components/EndpointField.tsx` (+ their tests).
- Modify: `src/App.tsx`, `src/components/SearchBar.tsx`, `src/components/HomeHero.tsx`,
  `src/components/MapView.tsx`, `src/__mocks__/react-leaflet.tsx`, and update `Trip`
  importers (`src/hooks/useTripPlan.ts`) to keep compiling.

## Risks / notes

- Browser geolocation accuracy depends on the device (desktop can be city-level). Surfaced
  via the >100 m warning; the coordinate sent is always the exact fix.
- Leaflet `CircleMarker` is not draggable; switching A/B to `Marker` + `divIcon` preserves
  the look while enabling drag.
- The context menu overlay is positioned by container pixels and does not track pan/zoom; it
  is transient (closes on action or next click), so this is acceptable.
