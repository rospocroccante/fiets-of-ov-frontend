import { useState } from "react";
import { SearchBar, type Trip } from "./components/SearchBar";
import { FilterBar } from "./components/FilterBar";
import { ResultsPanel, type PanelState } from "./components/ResultsPanel";
import { MapView } from "./components/MapView";
import { HomeHero } from "./components/HomeHero";
import { useTripPlan } from "./hooks/useTripPlan";
import { isLive } from "./api/client";
import type { Mode } from "./api/types";

export default function App() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [hideMap, setHideMap] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const view = useTripPlan(trip);

  function startTrip(t: Trip) {
    setSelectedMode(null);
    setTrip(t);
  }
  function goHome() {
    setSelectedMode(null);
    setTrip(null);
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
        <SearchBar onSearch={startTrip} onHome={goHome} />
      </header>

      <div className="px-6">
        <FilterBar count={count} hideMap={hideMap} onToggleMap={() => setHideMap((v) => !v)} />
      </div>

      <main className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
        <section className={hideMap ? "w-full overflow-y-auto" : "w-1/2 overflow-y-auto"}>
          <ResultsPanel state={panel} />
        </section>
        {!hideMap && (
          <section className="w-1/2">
            <MapView
              origin={view.origin}
              destination={view.destination}
              stops={view.stops}
              route={route}
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
