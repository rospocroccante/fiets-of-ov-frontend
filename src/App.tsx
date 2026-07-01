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
    setHideMap(false);
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
