# Pick origin/destination by clicking the map — design

Date: 2026-07-01
Status: approved (brainstorming) — pending spec review
Repo: `fiets-of-ov-frontend`
Branch: `feat/map-click-endpoints` (based on `feat/multimodal-rain-aware-routing`)

## Problem

You can only set the trip origin/destination by typing into the `From`/`To` fields.
There is no way to drop a point on the map. The map already renders `A`/`B` pins but
captures no clicks.

## Goals

- In the results view, arm "set start" or "set end", then click the map to place that
  endpoint. Reverse-geocode the click to a readable name for the field, but send the
  exact coordinates to the planner so the point is precise.
- Re-plan automatically once both endpoints are set.

## Non-goals

- No map on the landing (`HomeHero`) screen — you still start from a text search; the map
  picker only refines/replaces endpoints in the results view.
- No draggable markers (YAGNI for now; clicking again re-places).
- No new backend work — `GET /v1/plan` already accepts `"lat,lon"` for `from`/`to`.

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| How a click chooses A vs B | **Set start / Set end buttons** — arm one, the next map click sets it and disarms. |
| Where clicking works | **Results view only** — start via text search, then adjust by clicking. |
| Clicked-point display | **Reverse-geocode to a name** for the field; **send `"lat,lon"`** to the planner. |
| Re-plan trigger | **Automatic** once both endpoints have a value and one changed. |

## Architecture

### Data model — `{ label, query }` per endpoint (App.tsx)

Today `SearchBar` owns `from`/`to` as strings and passes them to `getPlan`. To let both the
text inputs and map clicks write the same state, **lift endpoint state into `App`** and model
each endpoint as:

```ts
interface Endpoint {
  label: string;  // shown in the From/To field
  query: string;  // sent to getPlan: a typed name, or "lat,lon" for a map click
}
```

- Typing in a field sets `label === query === text` (a name the backend geocodes — current behavior).
- A map click sets `label = <reverse-geocoded name>` (or `"lat, lon"` on failure) and
  `query = "lat,lon"` (precise). The planner receives `origin.query` / `destination.query`.

`SearchBar` becomes **controlled**: it receives `fromLabel`/`toLabel` and calls
`onFromChange`/`onToChange` (which reset that endpoint to typed text) and `onSubmit`.

`App` also holds `armed: "start" | "end" | null`.

**Initialization from the landing search:** `HomeHero`'s `onSearch({from, to})` (and the
`SearchBar` submit) seed both endpoints as `label = query = text`. So arriving in the results
view, the two `Endpoint`s already hold the searched terms; map clicks then replace one or the
other. The planned `trip` is derived from `origin.query`/`destination.query` (not from a
separate `SearchBar` submit), so text submit and map click share one path to `useTripPlan`.

### Components

- **`MapView`**: add an optional `onPick?: (c: { lat: number; lon: number }) => void` prop and
  an internal child `MapClicker` that calls `useMapEvents({ click })` → `onPick`. The handler is
  only wired when `onPick` is provided. Existing `A`/`B` pins already render from
  `origin`/`destination`. When a point is armed, show a crosshair cursor on the map container.
- **`MapPickToolbar`** (new, small): rendered over the map (top-left). Two toggle buttons —
  "Set start" and "Set end". Clicking arms that endpoint (button highlighted); clicking the map
  places it and disarms. A hint line: "Click the map to set the start/end."
- **`SearchBar`**: inputs become controlled (`value` from `App`); `onChange` resets that
  endpoint to typed text (`label = query = text`). Submit still triggers a plan.

### Data flow (map click)

1. User clicks "Set start" → `App.armed = "start"`.
2. User clicks the map → `MapView.onPick({lat,lon})` → `App`:
   - `query = "\`${lat.toFixed(6)},${lon.toFixed(6)}\`"`,
   - `label = await reverseGeocode(lat, lon)` (fallback `"lat, lon"` on error),
   - set `origin` (or `destination`), `armed = null`.
3. If both `origin.query` and `destination.query` are set → update the planned `trip`
   (`{ from: origin.query, to: destination.query }`) → `useTripPlan` re-plans.

### Reverse geocoding — `geocode.ts`

Add:

```ts
export async function reverseGeocode(lat: number, lon: number): Promise<string>
```

- Live: Nominatim `/reverse?format=json&lat=&lon=&zoom=16` with the identifying Accept
  header; return `display_name`'s leading part (name/road) or the full `display_name`.
- Mock: return the nearest `KNOWN` place name within a small radius, else `"<lat>, <lon>"`.
- On any error / not found: return `"<lat.toFixed(5)>, <lon.toFixed(5)>"`. Never throws.

### Re-plan trigger

`App` recomputes the `trip` whenever both endpoints have a non-empty `query`. Setting an
endpoint (by click or by submitting typed text) that completes the pair triggers a re-plan
via the existing `useTripPlan(trip)` query key (`["plan", from, to]`).

## Error handling

- `reverseGeocode` never throws — worst case the field shows coordinates.
- A map click while nothing is armed is ignored (no-op).
- Clicking to set only one endpoint does not plan until the other is present (the panel keeps
  showing the last result / idle).

## Testing

- **`geocode.test.ts`**: `reverseGeocode` mock path returns a nearest-known name; unknown
  coordinates return the `"lat, lon"` string; a simulated fetch failure returns coordinates
  (never throws).
- **`__mocks__/react-leaflet.tsx`**: extend the stub so `useMapEvents` registers the handler
  and a test can invoke the map `click` (e.g. expose a helper that fires the registered click
  with a fixed `latlng`).
- **`MapPickToolbar.test.tsx`** (or an `App`-level test): arming "Set start" then firing a map
  click sets the `From` field label and the endpoint `query` to `"lat,lon"`, disarms, and once
  both endpoints are set the trip re-plans (assert `getPlan`/mock called with the coord query).
- Existing tests stay green; `SearchBar` controlled-input change still submits.

## File structure

- Modify: `src/App.tsx` (endpoint state, armed, wiring, re-plan).
- Modify: `src/components/SearchBar.tsx` (controlled inputs).
- Modify: `src/components/MapView.tsx` (`onPick` + `MapClicker`, crosshair cursor).
- Create: `src/components/MapPickToolbar.tsx`.
- Modify: `src/geocode.ts` (`reverseGeocode`).
- Modify/create tests: `src/geocode.test.ts`, `src/__mocks__/react-leaflet.tsx`,
  `src/components/MapPickToolbar.test.tsx`.

## Risks / notes

- The map only appears after an initial search (results view). Accepted per the flow decision;
  a from-scratch map picker on the landing is a possible later enhancement.
- A map-click endpoint's pin sits exactly where clicked; the reverse-geocoded label is display
  only and may differ slightly from the coordinate — intentional (coordinate is authoritative).
