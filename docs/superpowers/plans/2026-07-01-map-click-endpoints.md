# Map-Click Origin/Destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set the trip start/end by arming "Set start"/"Set end" and clicking the map; the field shows a reverse-geocoded name while the planner receives exact `"lat,lon"`, and the trip re-plans automatically once both endpoints are set.

**Architecture:** Endpoint state is lifted into `App` as `{ label, query }` per endpoint (label shown in the field, query sent to the planner). `SearchBar` becomes controlled. `MapView` gains an `onPick` handler via a `useMapEvents` child; a `MapPickToolbar` arms which endpoint the next click sets. Clicks reverse-geocode for display but store `"lat,lon"`.

**Tech Stack:** React 18 + TypeScript, react-leaflet + Leaflet, Vitest + Testing Library.

## Global Constraints

- Repo: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend`, branch `feat/map-click-endpoints` (already created; never touch `main`).
- No emoji, no `Co-Authored-By`/`Generated with` trailers in commits. Plain text.
- `Endpoint = { label: string; query: string }`; `Armed = "start" | "end" | null`.
- Map-click endpoints send `query = \`${lat.toFixed(6)},${lon.toFixed(6)}\`` (the backend `GET /v1/plan` accepts `"lat,lon"`). Typed text sends `query === label === text`.
- `reverseGeocode` NEVER throws — on any failure it returns `"<lat.toFixed(5)>, <lon.toFixed(5)>"`.
- Map picking is results-view only; do not add a map to `HomeHero`. No draggable markers.
- Test/build: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test` (vitest) and `npm run build` (`tsc --noEmit && vite build`). Tests run in mock mode (`VITE_API_MODE=mock`), so `isLive()` is false.

---

## File Structure

- Modify `src/geocode.ts` — add `reverseGeocode`.
- Modify `src/__mocks__/react-leaflet.tsx` — add `useMapEvents` + `__fireMapClick` test helper.
- Modify `src/components/MapView.tsx` — `onPick`/`picking` props + `MapClicker` child + crosshair cursor.
- Create `src/components/MapPickToolbar.tsx` — the Set start / Set end control.
- Modify `src/components/SearchBar.tsx` — controlled inputs.
- Modify `src/App.tsx` — lift endpoint state, arming, pick handler, derived trip / re-plan.
- Tests: append to `src/geocode.test.ts`; create `src/components/MapView.test.tsx` additions or new test; create `src/components/MapPickToolbar.test.tsx`; add an App-level test (in `src/test/` or `src/App.test.tsx`).

---

## Task 1: `reverseGeocode` in geocode.ts

**Files:**
- Modify: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/geocode.ts`
- Test: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/geocode.test.ts` (append)

**Interfaces:**
- Produces: `reverseGeocode(lat: number, lon: number): Promise<string>` — a display name; never throws; returns `"lat, lon"` on miss/failure.

- [ ] **Step 1: Append the failing tests**

```ts
// src/geocode.test.ts (append)
import { reverseGeocode } from "./geocode";

test("reverseGeocode maps a click near a known place to its name (mock mode)", async () => {
  // Vondelpark is a KNOWN place at (52.3580, 4.8686).
  const name = await reverseGeocode(52.3581, 4.8687);
  expect(name.toLowerCase()).toContain("vondelpark");
});

test("reverseGeocode of coordinates far from any known place returns the coordinates", async () => {
  const name = await reverseGeocode(52.30, 4.70);
  expect(name).toMatch(/52\.3/);
  expect(name).toMatch(/4\.7/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- geocode`
Expected: FAIL — `reverseGeocode` is not exported.

- [ ] **Step 3: Implement in `src/geocode.ts`**

Append to the file (it already imports `isLive` and defines `KNOWN`):

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- geocode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend
git add src/geocode.ts src/geocode.test.ts
git commit -m "feat: reverseGeocode a coordinate to a display name (mock-aware, never throws)"
```

---

## Task 2: Map click plumbing — mock `useMapEvents` + `MapView.onPick`

**Files:**
- Modify: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/__mocks__/react-leaflet.tsx`
- Modify: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/components/MapView.tsx`
- Test: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/components/MapView.test.tsx`

**Interfaces:**
- Consumes: (leaflet click event `{ latlng: { lat, lng } }`).
- Produces: `MapView` gains optional props `onPick?: (c: { lat: number; lon: number }) => void` and `picking?: boolean`. Mock exports `useMapEvents(handlers)` and `__fireMapClick(lat, lng)`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/MapView.test.tsx
import { render } from "@testing-library/react";
import { MapView } from "./MapView";
import { __fireMapClick } from "../__mocks__/react-leaflet";

test("clicking the map calls onPick with lat/lon (lng mapped to lon)", () => {
  const picks: Array<{ lat: number; lon: number }> = [];
  render(
    <MapView origin={null} destination={null} stops={[]} route={null} onPick={(c) => picks.push(c)} picking />
  );
  __fireMapClick(52.36, 4.89);
  expect(picks).toEqual([{ lat: 52.36, lon: 4.89 }]);
});

test("without onPick, firing a map click is a no-op (no handler registered)", () => {
  render(<MapView origin={null} destination={null} stops={[]} route={null} />);
  // Should not throw; no handler registered by MapView this render.
  expect(() => __fireMapClick(52.36, 4.89)).not.toThrow();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- MapView`
Expected: FAIL — `__fireMapClick` not exported / `onPick` not wired.

- [ ] **Step 3a: Extend the mock `src/__mocks__/react-leaflet.tsx`**

Append:

```tsx
let _clickHandler: ((e: { latlng: { lat: number; lng: number } }) => void) | null = null;

export function useMapEvents(handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) {
  _clickHandler = handlers.click ?? null;
  return {};
}

// Test helper: simulate a user clicking the map at (lat, lng).
export function __fireMapClick(lat: number, lng: number) {
  _clickHandler?.({ latlng: { lat, lng } });
}
```

- [ ] **Step 3b: Wire `onPick` into `src/components/MapView.tsx`**

Add `useMapEvents` to the react-leaflet import, add the `MapClicker` child, extend props, and set the crosshair cursor. Concretely:

Change the import line to include `useMapEvents`:

```tsx
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
```

Add this component near `FitRoute`:

```tsx
function MapClicker({ onPick }: { onPick: (c: LatLon) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}
```

Extend the `MapView` signature and container. Change the props destructure to add `onPick` and `picking`:

```tsx
export function MapView({
  origin,
  destination,
  stops,
  route,
  onPick,
  picking,
}: {
  origin: LatLon | null;
  destination: LatLon | null;
  stops: Stop[];
  route: Itinerary | null;
  onPick?: (c: LatLon) => void;
  picking?: boolean;
}) {
```

Change the `MapContainer` opening tag to append a crosshair cursor when picking, and render the clicker:

```tsx
    <MapContainer
      center={AMS}
      zoom={13}
      className={`h-full w-full rounded-card ${picking ? "cursor-crosshair" : ""}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap, &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {onPick && <MapClicker onPick={onPick} />}
      <FitRoute coords={allCoords} fallback={origin ?? destination} />
```

(Leave the rest of `MapView` unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- MapView && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend
git add src/__mocks__/react-leaflet.tsx src/components/MapView.tsx src/components/MapView.test.tsx
git commit -m "feat: MapView reports map clicks via onPick; crosshair cursor when picking"
```

---

## Task 3: `MapPickToolbar` component

**Files:**
- Create: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/components/MapPickToolbar.tsx`
- Test: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/components/MapPickToolbar.test.tsx`

**Interfaces:**
- Produces: `MapPickToolbar({ armed, onArm }: { armed: "start" | "end" | null; onArm: (which: "start" | "end") => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/MapPickToolbar.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MapPickToolbar } from "./MapPickToolbar";

test("clicking Start requests arming the start endpoint", () => {
  const armed: string[] = [];
  render(<MapPickToolbar armed={null} onArm={(w) => armed.push(w)} />);
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  expect(armed).toEqual(["start"]);
});

test("the armed endpoint's button is pressed and a hint is shown", () => {
  render(<MapPickToolbar armed="end" onArm={() => {}} />);
  expect(screen.getByRole("button", { name: /^end$/i })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/click the map/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- MapPickToolbar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/MapPickToolbar.tsx`**

```tsx
type Armed = "start" | "end" | null;

export function MapPickToolbar({
  armed,
  onArm,
}: {
  armed: Armed;
  onArm: (which: "start" | "end") => void;
}) {
  const btn = (which: "start" | "end", label: string) => (
    <button
      onClick={() => onArm(which)}
      aria-pressed={armed === which}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        armed === which ? "bg-brand text-white" : "border border-gray-200 bg-white hover:shadow"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-1 rounded-card bg-white/95 p-2 shadow-md">
      <span className="px-1 text-xs font-medium text-gray-600">Set on map</span>
      <div className="flex gap-1">
        {btn("start", "Start")}
        {btn("end", "End")}
      </div>
      {armed && <span className="px-1 text-xs text-brand">Click the map to set the {armed}.</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- MapPickToolbar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend
git add src/components/MapPickToolbar.tsx src/components/MapPickToolbar.test.tsx
git commit -m "feat: MapPickToolbar to arm start/end endpoint picking"
```

---

## Task 4: App wiring + controlled SearchBar

**Files:**
- Modify: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/components/SearchBar.tsx`
- Modify: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/App.tsx`
- Test: `/Users/Rospo/Vibecoding/fiets-of-ov-frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `reverseGeocode` (Task 1), `MapView` `onPick`/`picking` (Task 2), `MapPickToolbar` (Task 3), the mock `__fireMapClick` (Task 2, tests only).
- Produces: controlled `SearchBar({ fromValue, toValue, onFromChange, onToChange, onSubmit, onHome })` (still exports `interface Trip { from: string; to: string }`). `App` holds `Endpoint`/`armed` state and derives the trip.

- [ ] **Step 1: Write the failing App integration test**

```tsx
// src/App.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { __fireMapClick } from "./__mocks__/react-leaflet";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

test("arming Start and clicking the map sets the From field to the reverse-geocoded name", async () => {
  renderApp();
  // Start a trip from the hero to reach the results view (which shows the map).
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));

  // Arm the start endpoint and click the map near Vondelpark (a KNOWN mock place).
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  __fireMapClick(52.3581, 4.8687);

  // reverseGeocode is async: the From field updates to the mock name.
  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test -- App`
Expected: FAIL — `SearchBar` isn't controlled / no `Start` button in the results view yet.

- [ ] **Step 3a: Rewrite `src/components/SearchBar.tsx` (controlled)**

```tsx
export interface Trip {
  from: string;
  to: string;
}

export function SearchBar({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  onSubmit,
  onHome,
}: {
  fromValue: string;
  toValue: string;
  onFromChange: (text: string) => void;
  onToChange: (text: string) => void;
  onSubmit: () => void;
  onHome?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button onClick={onHome} className="text-2xl font-bold text-brand">
        Fiets of OV
      </button>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center rounded-full border border-gray-200 bg-white shadow-sm">
          <input
            className="w-40 rounded-l-full px-5 py-3 text-sm outline-none"
            placeholder="From"
            value={fromValue}
            onChange={(e) => onFromChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
          <span className="h-6 w-px bg-gray-200" />
          <input
            className="w-40 px-5 py-3 text-sm outline-none"
            placeholder="To"
            value={toValue}
            onChange={(e) => onToChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
          <span className="h-6 w-px bg-gray-200" />
          <span className="px-5 py-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={onSubmit}
            className="m-1 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            &#9906;
          </button>
        </div>
      </div>

      <button className="rounded-full border border-gray-200 px-5 py-2 text-sm font-medium">
        Menu &#9776;
      </button>
    </div>
  );
}
```

(`HomeHero` still imports `type Trip` from this file — unchanged export.)

- [ ] **Step 3b: Rewrite `src/App.tsx`**

```tsx
import { useMemo, useState } from "react";
import { SearchBar, type Trip } from "./components/SearchBar";
import { FilterBar } from "./components/FilterBar";
import { ResultsPanel, type PanelState } from "./components/ResultsPanel";
import { MapView } from "./components/MapView";
import { MapPickToolbar } from "./components/MapPickToolbar";
import { HomeHero } from "./components/HomeHero";
import { useTripPlan } from "./hooks/useTripPlan";
import { isLive } from "./api/client";
import { reverseGeocode } from "./geocode";
import type { Mode } from "./api/types";

interface Endpoint {
  label: string; // shown in the From/To field
  query: string; // sent to the planner: a name, or "lat,lon" for a map click
}
type Armed = "start" | "end" | null;

export default function App() {
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const [hideMap, setHideMap] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);

  const trip: Trip | null = useMemo(
    () => (origin && destination ? { from: origin.query, to: destination.query } : null),
    [origin, destination]
  );
  const view = useTripPlan(trip);

  function startTrip(t: Trip) {
    setFromText(t.from);
    setToText(t.to);
    setOrigin({ label: t.from, query: t.from });
    setDestination({ label: t.to, query: t.to });
    setSelectedMode(null);
    setArmed(null);
  }
  function goHome() {
    setFromText("");
    setToText("");
    setOrigin(null);
    setDestination(null);
    setSelectedMode(null);
    setArmed(null);
  }
  function commitSearch() {
    const f = fromText.trim();
    const t = toText.trim();
    if (!f || !t) return;
    setOrigin({ label: f, query: f });
    setDestination({ label: t, query: t });
    setSelectedMode(null);
  }
  function armPick(which: "start" | "end") {
    setArmed((a) => (a === which ? null : which));
  }
  async function handlePick(c: { lat: number; lon: number }) {
    if (!armed) return;
    const query = `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`;
    const label = await reverseGeocode(c.lat, c.lon);
    if (armed === "start") {
      setFromText(label);
      setOrigin({ label, query });
    } else {
      setToText(label);
      setDestination({ label, query });
    }
    setArmed(null);
    setSelectedMode(null);
  }

  if (trip === null) {
    return <HomeHero onSearch={startTrip} />;
  }

  const planView = view.status === "ready" && view.view ? view.view : null;
  const effectiveMode: Mode = selectedMode ?? planView?.recommendation ?? "bike";
  const selectedOption =
    planView?.options.find((o) => o.mode === effectiveMode) ?? planView?.options[0];
  const route = selectedOption?.itinerary ?? null;

  const panel: PanelState = planView
    ? { status: "ready", view: planView, selectedMode: effectiveMode, onSelect: setSelectedMode }
    : view.status === "error"
      ? { status: "error", message: view.message ?? "error" }
      : view.status === "loading"
        ? { status: "loading" }
        : { status: "idle" };

  const count = planView ? planView.options.length : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 px-6 py-3">
        <SearchBar
          fromValue={fromText}
          toValue={toText}
          onFromChange={setFromText}
          onToChange={setToText}
          onSubmit={commitSearch}
          onHome={goHome}
        />
      </header>

      <div className="px-6">
        <FilterBar count={count} hideMap={hideMap} onToggleMap={() => setHideMap((v) => !v)} />
      </div>

      <main className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
        <section className={hideMap ? "w-full overflow-y-auto" : "w-1/2 overflow-y-auto"}>
          <ResultsPanel state={panel} />
        </section>
        {!hideMap && (
          <section className="relative w-1/2">
            <MapPickToolbar armed={armed} onArm={armPick} />
            <MapView
              origin={view.origin}
              destination={view.destination}
              stops={view.stops}
              route={route}
              onPick={handlePick}
              picking={armed !== null}
            />
          </section>
        )}
      </main>

      {!isLive() && (
        <div className="pointer-events-none fixed bottom-3 left-3 rounded-full bg-brand px-3 py-1 text-xs text-white">
          mock
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass + full suite + build**

Run: `cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend && npm test && npx tsc --noEmit && npm run build`
Expected: ALL tests pass (incl. the existing `smoke.test.tsx`, which still drives HomeHero → results view), tsc clean, build ok. If `smoke.test` fails because the results-view `SearchBar` now needs props, confirm it only interacts with HomeHero (it does) — no change needed there.

- [ ] **Step 5: Commit**

```bash
cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend
git add src/App.tsx src/components/SearchBar.tsx src/App.test.tsx
git commit -m "feat: pick trip start/end by clicking the map, with auto re-plan"
```

---

## Task 5: Manual end-to-end verification

**Files:** none (manual).

- [ ] **Step 1: Run the app (mock mode)**

```bash
cd /Users/Rospo/Vibecoding/fiets-of-ov-frontend
npm run dev
```

- [ ] **Step 2: Verify the flow**

Search any trip from the hero (e.g. Centraal → Dam) to reach the results view. Then:
- Click "Start", click a point on the map → the `From` field shows a place name (or coordinates), the map re-plans, and the `A` pin moves to (near) the clicked point.
- Click "End", click another point → `To` updates and the route re-plans.
- Toggling the map off/on still works; typing in `From`/`To` and pressing Enter/Search still plans.

- [ ] **Step 3: (Optional) live mode**

With `VITE_API_MODE=live` and the backend + OTP running, confirm reverse geocoding shows real street names and the plan uses the clicked coordinates.

---

## Self-Review

**1. Spec coverage:**
- Set start/end buttons → arm → click sets endpoint: Tasks 3 (toolbar) + 4 (App wiring). ✓
- Results-view only; no HomeHero map: Task 4 (map + toolbar only in results view). ✓
- Reverse-geocode to name, send `"lat,lon"`: Task 1 (`reverseGeocode`) + Task 4 (`query` = coords, `label` = name). ✓
- Auto re-plan when both set: Task 4 (derived `trip` from `origin.query`/`destination.query` → `useTripPlan`). ✓
- `{label, query}` model; controlled SearchBar; init from HomeHero: Task 4. ✓
- `reverseGeocode` never throws: Task 1 (try/catch + coord fallback). ✓
- Tests: reverseGeocode (T1), MapView onPick (T2), toolbar (T3), App integration (T4). ✓

**2. Placeholder scan:** No TBD/TODO; every step has complete code and exact commands.

**3. Type consistency:** `Endpoint {label, query}`, `Armed = "start"|"end"|null`, `onPick: (c:{lat,lon})=>void`, `onArm:(which:"start"|"end")=>void`, `reverseGeocode(lat,lon):Promise<string>`, controlled `SearchBar` props — consistent across Tasks 2, 3, 4. `MapView.onPick` maps leaflet `latlng.lng` → `lon`. ✓
