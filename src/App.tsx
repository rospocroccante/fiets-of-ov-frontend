import { useState } from "react";
import { SearchBar, type Trip } from "./components/SearchBar";
import { FilterBar } from "./components/FilterBar";
import { ResultsPanel, type PanelState } from "./components/ResultsPanel";
import { MapView } from "./components/MapView";
import { HomeHero } from "./components/HomeHero";
import { useTripAdvice } from "./hooks/useTripAdvice";
import { isLive } from "./api/client";

export default function App() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [hideMap, setHideMap] = useState(false);
  const view = useTripAdvice(trip);

  function goHome() {
    setTrip(null);
  }

  if (trip === null) {
    return <HomeHero onSearch={setTrip} />;
  }

  const panel: PanelState =
    view.status === "ready" && view.result
      ? { status: "ready", result: view.result }
      : view.status === "error"
        ? { status: "error", message: view.message ?? "error" }
        : view.status === "loading"
          ? { status: "loading" }
          : { status: "idle" };

  const count = view.status === "ready" ? view.result!.cards.length : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 px-6 py-3">
        <SearchBar onSearch={setTrip} onHome={goHome} />
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
            <MapView origin={view.origin} destination={view.destination} stops={view.stops} />
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
