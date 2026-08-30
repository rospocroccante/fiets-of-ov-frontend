# Google Maps-style Endpoint Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose trip origin/destination the way Google Maps does — current
location, autocomplete everywhere, draggable pins, right-click/long-press "from/to here"
menu, and swap — with precise coordinates sent to the planner.

**Architecture:** Endpoints modeled as `{label, query}`; precise picks store
`"lat,lon"` (toFixed 6) as `query`. A reusable `EndpointField` (PlaceInput + GPS button)
is used in both the landing and the results search bar; `MapView` gains draggable markers
and a context menu; `App` orchestrates all endpoint mutations and re-plans.

**Tech Stack:** React 18 + TypeScript, react-leaflet + Leaflet, @tanstack/react-query,
Vitest + Testing Library. Tests run offline in `mock` mode (see `vite.config` test env).

## Global Constraints

- Precise picks send `` `${lat.toFixed(6)},${lon.toFixed(6)}` `` as `query`; reverse
  geocoding is display-label only. Backend `parseLatLon` consumes `"lat,lon"` directly.
- No backend changes. No new runtime deps beyond Leaflet (already present).
- No emoji and no AI/Claude trailer in commits or files.
- Every task: write failing test(s) first, implement minimally, run the named tests, commit.
- Tests must run green in `mock` mode; do not require network.
- Commands (run in repo root `/Users/Rospo/Vibecoding/fiets-of-ov-frontend`):
  `npm test` (vitest run), `npx tsc --noEmit`, `npm run lint`.

---

### Task 1: Shared trip types (`src/trip.ts`)

**Files:**
- Create: `src/trip.ts`
- Modify: `src/components/SearchBar.tsx` (re-export `Trip` from `../trip`; remove local
  `export interface Trip`)
- Modify: `src/hooks/useTripPlan.ts` (import `Trip` from `../trip`)
- Modify: `src/App.tsx` (import `Endpoint`, `TripDraft` from `./trip`; delete the local
  `interface Endpoint`)

**Interfaces — Produces:**
```ts
export interface Endpoint { label: string; query: string }
export interface Trip { from: string; to: string }
export interface TripDraft { from: Endpoint; to: Endpoint }
```

**Notes:** `SearchBar` currently declares `export interface Trip`. Move the declaration to
`src/trip.ts` and add `export type { Trip } from "../trip";` in SearchBar so existing
imports (`import { SearchBar, type Trip } from "./components/SearchBar"`) keep working.

- [ ] Step 1: Create `src/trip.ts` with the three interfaces above.
- [ ] Step 2: In `SearchBar.tsx` replace `export interface Trip {...}` with
  `export type { Trip } from "../trip";`.
- [ ] Step 3: Point `useTripPlan.ts` and `App.tsx` at the new module; delete App's local
  `Endpoint`.
- [ ] Step 4: `npx tsc --noEmit` clean; `npm test` still green.
- [ ] Step 5: Commit `feat: shared Endpoint/TripDraft/Trip types`.

---

### Task 2: Geolocation wrapper (`src/geolocate.ts`)

**Files:**
- Create: `src/geolocate.ts`
- Test: `src/geolocate.test.ts`

**Interfaces — Produces:**
```ts
export interface Fix { lat: number; lon: number; accuracy: number }
export type GeoErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";
export class GeoError extends Error { kind: GeoErrorKind }
export const ACCURACY_WARN_M = 100;
export function getCurrentPosition(): Promise<Fix>
export function geoErrorMessage(err: unknown): string
export function accuracyWarning(accuracy: number): string | null
```

**Behavior:**
- `getCurrentPosition` rejects `new GeoError("unsupported", ...)` when
  `typeof navigator === "undefined" || !navigator.geolocation`. Else calls
  `navigator.geolocation.getCurrentPosition(ok, err, { enableHighAccuracy: true,
  timeout: 10000, maximumAge: 0 })`. `ok` resolves `{lat: coords.latitude, lon:
  coords.longitude, accuracy: coords.accuracy}`. `err` maps `err.code`:
  `PERMISSION_DENIED->"denied"`, `TIMEOUT->"timeout"`, else `"unavailable"`.
- `accuracyWarning(a)` returns null when `a <= 100`, else
  `` `Approximate location (±${Math.round(a)}m). Refine the start on the map if needed.` ``.
- `geoErrorMessage` maps kinds to friendly text (denied/timeout/unsupported/unavailable),
  and any non-`GeoError` to a generic "Location unavailable.".

**Tests (`geolocate.test.ts`):** stub `navigator.geolocation` with a fake `getCurrentPosition`
that invokes the success or error callback. Assert: success -> `Fix`; error code 1 ->
`kind === "denied"`; code 3 -> `"timeout"`; missing `navigator.geolocation` -> `"unsupported"`.
`accuracyWarning(50) === null`; `accuracyWarning(500)` contains `"±500m"`.
`geoErrorMessage(new GeoError("denied",""))` mentions permission.

- [ ] Step 1: Write `geolocate.test.ts` (failing).
- [ ] Step 2: Run it, verify it fails.
- [ ] Step 3: Implement `geolocate.ts`.
- [ ] Step 4: `npx vitest run src/geolocate.test.ts` green; `tsc --noEmit` clean.
- [ ] Step 5: Commit `feat: high-accuracy geolocation wrapper`.

---

### Task 3: react-leaflet mock extensions (`src/__mocks__/react-leaflet.tsx`)

**Files:**
- Modify: `src/__mocks__/react-leaflet.tsx`

**Produces (test helpers):**
```ts
export function __fireMapClick(lat: number, lng: number): void        // keep existing
export function __fireMapContextMenu(lat: number, lng: number, x?: number, y?: number): void
export function __fireMarkerDragEnd(which: string, lat: number, lng: number): void
```

**Behavior:**
- `useMapEvents(handlers)` stores the whole handlers object (module-level). `__fireMapClick`
  calls `handlers.click?.({ latlng: { lat, lng } })`. `__fireMapContextMenu` calls
  `handlers.contextmenu?.({ latlng: { lat, lng }, containerPoint: { x: x ?? 0, y: y ?? 0 } })`.
- `Marker` accepts `title`, `draggable`, `eventHandlers`, `children`; on render it records
  `eventHandlers` in a module-level map keyed by `title`. `__fireMarkerDragEnd(which, lat,
  lng)` looks up that entry and calls `dragend?.({ target: { getLatLng: () => ({ lat,
  lng }) } })`. Marker still renders `children` (so the divIcon/tooltip content is present).
- Keep `MapContainer`, `TileLayer`, `CircleMarker`, `Polyline`, `Popup`, `Tooltip`,
  `useMap` as-is.

**Test:** covered indirectly by MapView tests (Task 6). No standalone test file required, but
`tsc --noEmit` must stay clean.

- [ ] Step 1: Extend the mock with handler storage + the three helpers.
- [ ] Step 2: `tsc --noEmit` clean; `npm test` still green (existing MapView.test uses
  `__fireMapClick`).
- [ ] Step 3: Commit `test: extend react-leaflet mock for drag + contextmenu`.

---

### Task 4: GPS button component (`src/components/UseMyLocationButton.tsx`)

**Files:**
- Create: `src/components/UseMyLocationButton.tsx`
- Test: `src/components/UseMyLocationButton.test.tsx`

**Consumes:** `getCurrentPosition`, `geoErrorMessage`, `accuracyWarning` (Task 2);
`reverseGeocode` (`../geocode`); `Endpoint` (`../trip`).

**Produces:**
```ts
export function UseMyLocationButton(props: {
  onLocated: (ep: Endpoint) => void;
  className?: string;
}): JSX.Element
```

**Behavior:** button `aria-label="Use my location"`, `type="button"`. On click: set `busy`,
clear status; `try { fix = await getCurrentPosition(); query =
`${fix.lat.toFixed(6)},${fix.lon.toFixed(6)}`; label = await reverseGeocode(fix.lat,
fix.lon); onLocated({label, query}); const w = accuracyWarning(fix.accuracy); if (w)
setStatus({kind:"warn", text:w}); } catch (e) { setStatus({kind:"error", text:
geoErrorMessage(e)}); } finally { setBusy(false); }`. While `busy`, button is `disabled`
and shows a spinner glyph. Status renders below as a small line: `role="alert"` +
`text-red-600` for error, `role="status"` + `text-amber-600` for warn.

**Tests:** set `navigator.geolocation = { getCurrentPosition: (ok) => ok({ coords: {
latitude: 52.358, longitude: 4.8686, accuracy: 20 } }) }` (Vondelpark, a KNOWN mock place)
-> click -> `await` -> `onLocated` called once with `query === "52.358000,4.868600"` and a
label matching `/vondelpark/i` (mock reverseGeocode). Second test: `accuracy: 800` ->
`role="status"` text contains `"±800m"`. Third: `getCurrentPosition: (_ok, err) => err({
code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3, POSITION_UNAVAILABLE: 2 })` -> `role="alert"`
appears. Use `findBy*` for async.

- [ ] Step 1: Write the three failing tests.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement the component.
- [ ] Step 4: `vitest run src/components/UseMyLocationButton.test.tsx` green; tsc clean.
- [ ] Step 5: Commit `feat: UseMyLocationButton (GPS, high-accuracy, precise coords)`.

---

### Task 5: Endpoint field component (`src/components/EndpointField.tsx`)

**Files:**
- Create: `src/components/EndpointField.tsx`
- Test: `src/components/EndpointField.test.tsx`

**Consumes:** `PlaceInput` (`./PlaceInput`), `UseMyLocationButton` (Task 4), `Place`
(`../api/types`), `Endpoint` (`../trip`).

**Produces:**
```ts
export function EndpointField(props: {
  value: string;
  placeholder: string;
  onText: (text: string) => void;
  onSelect: (place: Place) => void;
  onLocate: (ep: Endpoint) => void;
  className?: string;
}): JSX.Element
```

**Behavior:** renders `<PlaceInput value placeholder onChange={onText} onSelect={onSelect} />`
next to `<UseMyLocationButton onLocated={onLocate} />` in a flex row. No local state.

**Tests:** typing in the input calls `onText` with the text; selecting a suggestion (the
mock `searchPlaces` returns places for a >=2-char query) calls `onSelect`; GPS button
present (`getByRole("button", { name: /use my location/i })`).

- [ ] Step 1: Write failing tests.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement.
- [ ] Step 4: tests green; tsc clean.
- [ ] Step 5: Commit `feat: EndpointField (autocomplete + GPS)`.

---

### Task 6: Draggable pins + context menu (`src/components/MapView.tsx`)

**Files:**
- Modify: `src/components/MapView.tsx`
- Test: `src/components/MapView.test.tsx`

**Consumes:** react-leaflet mock helpers (Task 3).

**Produces (new optional props on `MapView`):**
```ts
onMovePoint?: (which: "start" | "end", c: { lat: number; lon: number }) => void;
onContextPick?: (which: "start" | "end", c: { lat: number; lon: number }) => void;
```

**Behavior:**
- Replace the A/B `Pin` (`CircleMarker`) with a Leaflet `Marker` using
  `L.divIcon({ className, html, iconSize })` that reproduces the colored circle + letter.
  Pass `draggable={!!onMovePoint}`, `title={"start"|"end"}`, and
  `eventHandlers={{ dragend: (e) => onMovePoint?.(which, toLatLon(e.target.getLatLng())) }}`
  where `toLatLon({lat,lng}) => ({lat, lon: lng})`. Import `L` from `"leaflet"`.
- Wrap the return in a new `relative h-full w-full` div; render `MapContainer` inside it.
- Add a `MapEvents` child inside `MapContainer` using `useMapEvents({ click, contextmenu })`.
  `click` still calls `onPick` (keep existing) AND closes any open menu. `contextmenu`
  sets menu state `{ lat, lon, x, y }` from `e.latlng` + `e.containerPoint`.
- When menu state is set, render an overlay `div` (absolute, `style={{ left: x, top: y }}`,
  `z-[1000]`) as a sibling of `MapContainer` with two buttons: "Directions from here" ->
  `onContextPick?.("start", {lat,lon})` then clear menu; "Directions to here" ->
  `onContextPick?.("end", {lat,lon})` then clear menu.
- All new handlers no-op when their prop is undefined.

**Tests (extend `MapView.test.tsx`):**
- Render with `origin`/`destination` set and an `onMovePoint` spy; `__fireMarkerDragEnd(
  "start", 52.36, 4.90)` -> `onMovePoint` called with `("start", {lat:52.36, lon:4.90})`.
- With `onContextPick` spy: `__fireMapContextMenu(52.36, 4.90, 10, 20)` -> a menu appears;
  click "Directions from here" -> `onContextPick("start", {lat:52.36, lon:4.90})`; the menu
  then closes. Repeat for "to here" -> `"end"`.
- Existing route/click tests stay green.

- [ ] Step 1: Write the new failing tests.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement draggable markers + context menu overlay.
- [ ] Step 4: `vitest run src/components/MapView.test.tsx` green; tsc clean.
- [ ] Step 5: Commit `feat: draggable A/B pins + right-click directions menu on map`.

---

### Task 7: Results search bar refactor (`src/components/SearchBar.tsx`)

**Files:**
- Modify: `src/components/SearchBar.tsx`
- Test: `src/components/SearchBar.test.tsx`

**Consumes:** `EndpointField` (Task 5), `Place` (`../api/types`), `Endpoint` (`../trip`).

**Produces (new prop shape):**
```ts
export function SearchBar(props: {
  fromValue: string;
  toValue: string;
  onFromText: (t: string) => void;
  onToText: (t: string) => void;
  onFromSelect: (p: Place) => void;
  onToSelect: (p: Place) => void;
  onFromLocate: (ep: Endpoint) => void;
  onToLocate: (ep: Endpoint) => void;
  onSwap: () => void;
  onSubmit: () => void;
  onHome?: () => void;
}): JSX.Element
export type { Trip } from "../trip";
```

**Behavior:** wordmark button (onHome) | From `EndpointField` | Swap button
(`aria-label="Swap start and end"`) | To `EndpointField` | "Now" | search button (onSubmit)
| Menu. Enter in either field still triggers `onSubmit` (PlaceInput input handles key? — add
an `onKeyDown` wrapper if needed; simplest: keep a submit button and Enter via a form or a
key handler on the wrapping div). The From/To values are controlled via `fromValue`/`toValue`
passed to each `EndpointField`.

**Tests (rewrite `SearchBar.test.tsx`):** render with spies; clicking the search button
calls `onSubmit`; clicking the swap button calls `onSwap`; typing in the From field calls
`onFromText`. (Enter-to-submit: assert if implemented; otherwise button submit only.)

- [ ] Step 1: Rewrite failing tests for the new props.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement.
- [ ] Step 4: tests green; tsc clean.
- [ ] Step 5: Commit `feat: results search bar with autocomplete, GPS, swap`.

---

### Task 8: Landing refactor (`src/components/HomeHero.tsx`)

**Files:**
- Modify: `src/components/HomeHero.tsx`
- Test: `src/components/HomeHero.test.tsx`

**Consumes:** `EndpointField` (Task 5), `Endpoint`/`TripDraft` (`../trip`), `Place`.

**Produces:** `onSearch: (t: TripDraft) => void` (was `(t: Trip)`).

**Behavior:** hold `from`/`to` as `Endpoint` in local state (`{label:"", query:""}` init).
`EndpointField` per field:
- `onText(text)` -> set that endpoint to `{label: text, query: text}`.
- `onSelect(place)` -> `{label: place.name, query: `${place.lat},${place.lon}`}`.
- `onLocate(ep)` -> set that endpoint to `ep`.
`submit()` guards `from.query.trim()` and `to.query.trim()` non-empty, then
`onSearch({ from, to })`. Popular quick-picks call
`onSearch({ from: {label: t.from, query: t.from}, to: {label: t.to, query: t.to} })`.

**Tests (update `HomeHero.test.tsx`):**
- Typing From="Centraal", To="Vondelpark", Search -> `onSearch` called with
  `{ from: { label: "Centraal", query: "Centraal" }, to: { label: "Vondelpark",
  query: "Vondelpark" } }`.
- Popular quick-pick -> `onSearch` called once; arg has `from.label` and `to.label`.
- GPS on From (stub `navigator.geolocation` -> Vondelpark coords) -> From field shows a name;
  then Search -> `onSearch` arg `from.query` matches `/^52\.35/` (coordinates, not the name).

- [ ] Step 1: Update failing tests.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement.
- [ ] Step 4: tests green; tsc clean.
- [ ] Step 5: Commit `feat: landing endpoint fields with GPS + precise handoff`.

---

### Task 9: App orchestration (`src/App.tsx`)

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Consumes:** everything above.

**Behavior:** import `Endpoint`/`TripDraft` from `./trip`. Handlers:
- `startTrip(t: TripDraft)`: `setFromText(t.from.label); setToText(t.to.label);
  setOrigin(t.from); setDestination(t.to); setSelectedMode(null); setArmed(null)`.
- `commitSearch()`: unchanged semantics — build endpoints from trimmed `fromText`/`toText`
  with `query === label === text`.
- `selectEndpoint(which, place)`: set the endpoint to `{label: place.name, query:
  `${place.lat},${place.lon}`}` and its text; `setSelectedMode(null)` (re-plans).
- `locateEndpoint(which, ep)`: set the endpoint to `ep`, set its text to `ep.label`;
  `setSelectedMode(null)`.
- `onMovePoint(which, c)` and `onContextPick(which, c)`: same shape as `handlePick` but for
  the named endpoint — `query = "lat,lon"`, `label = await reverseGeocode(...)`, set endpoint
  + text, `setSelectedMode(null)`. For context menu also `setArmed(null)`.
- `swap()`: swap `origin`<->`destination` and `fromText`<->`toText`; `setSelectedMode(null)`.
- Wire `SearchBar` with the new props; pass `onMovePoint`/`onContextPick` to `MapView`.
  Keep `armPick`/`handlePick`/`MapPickToolbar`.

**Tests (extend `App.test.tsx`, keep the existing one):**
- Existing: arm Start + `__fireMapClick(Vondelpark)` -> From shows the name. (keep)
- Drag: after searching, `__fireMarkerDragEnd("end", 52.36, 4.90)` -> To field updates to a
  reverse-geocoded value (await), and the plan query re-runs (From/To reflect the new point).
- Context menu: `__fireMapContextMenu(52.358, 4.8686)` then click "Directions from here" ->
  From field updates to `/vondelpark/i`.
- Swap: set From="Centraal"/To="Dam", search, click swap -> From shows "Dam", To shows
  "Centraal".

- [ ] Step 1: Update/extend failing tests.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement wiring.
- [ ] Step 4: full `npm test` green; `tsc --noEmit` clean; `npm run lint` exit 0;
  `npm run build` ok.
- [ ] Step 5: Commit `feat: wire Google-Maps endpoint picking into App`.

---

## Self-review checklist (author)

- Spec coverage: GPS (T2,T4,T8,T9), draggable (T6,T9), context menu (T6,T9),
  autocomplete-everywhere+swap (T5,T7,T8,T9), precise coords (all picks toFixed 6),
  shared types (T1). Covered.
- Type consistency: `Endpoint`/`TripDraft`/`Trip` from `src/trip.ts` used uniformly;
  `which: "start"|"end"`; `LatLon = {lat, lon}` (note Leaflet uses `lng`; adapters convert).
- No placeholders: each task has interfaces + concrete test cases.
