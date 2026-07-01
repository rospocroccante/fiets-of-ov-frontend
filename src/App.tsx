import { useMemo, useState } from "react";
import { motion, useTransform, useMotionValueEvent } from "framer-motion";
import { EndpointField } from "./components/EndpointField";
import { FilterBar } from "./components/FilterBar";
import { ResultsPanel, type PanelState } from "./components/ResultsPanel";
import { MapView } from "./components/MapView";
import { MapPickToolbar } from "./components/MapPickToolbar";
import { useMorphProgress } from "./hooks/useMorphProgress";
import { useTripPlan } from "./hooks/useTripPlan";
import { isLive } from "./api/client";
import { reverseGeocode } from "./geocode";
import type { Mode, Place } from "./api/types";
import type { Endpoint, Trip } from "./trip";

type Armed = "start" | "end" | null;

interface PopularTrip {
  from: string;
  to: string;
}

const POPULAR: PopularTrip[] = [
  { from: "Amsterdam Centraal", to: "Vondelpark" },
  { from: "De Pijp", to: "Rijksmuseum" },
  { from: "Jordaan", to: "Amsterdamse Poort" },
  { from: "Amsterdam Zuid", to: "NDSM" },
];

export default function App() {
  const { progress, containerRef, toMap, toHome, reduced } = useMorphProgress();

  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const [hideMap, setHideMap] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);

  // progressIs1 gates map interactivity and pointer-events so mid-morph clicks
  // don't misfire. Tracked via a motion value event (no re-render on every frame).
  const [progressIs1, setProgressIs1] = useState(false);
  useMotionValueEvent(progress, "change", (v) => {
    setProgressIs1(v > 0.99);
  });

  const trip: Trip | null = useMemo(
    () => (origin && destination ? { from: origin.query, to: destination.query } : null),
    [origin, destination]
  );
  const view = useTripPlan(trip);

  function goHome() {
    setFromText("");
    setToText("");
    setOrigin(null);
    setDestination(null);
    setSelectedMode(null);
    setArmed(null);
    setHideMap(false);
    toHome();
  }
  function commitSearch() {
    const f = fromText.trim();
    const t = toText.trim();
    if (!f || !t) return;
    setOrigin({ label: f, query: f });
    setDestination({ label: t, query: t });
    setSelectedMode(null);
    toMap();
  }
  function pickPopular(t: PopularTrip) {
    setFromText(t.from);
    setToText(t.to);
    setOrigin({ label: t.from, query: t.from });
    setDestination({ label: t.to, query: t.to });
    setSelectedMode(null);
    setArmed(null);
    toMap();
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
  async function setEndpointFromCoords(
    which: "start" | "end",
    c: { lat: number; lon: number }
  ) {
    const query = `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`;
    const label = await reverseGeocode(c.lat, c.lon);
    if (which === "start") {
      setFromText(label);
      setOrigin({ label, query });
    } else {
      setToText(label);
      setDestination({ label, query });
    }
    setSelectedMode(null);
  }
  function onMovePoint(which: "start" | "end", c: { lat: number; lon: number }) {
    void setEndpointFromCoords(which, c);
  }
  function onContextPick(which: "start" | "end", c: { lat: number; lon: number }) {
    setArmed(null);
    void setEndpointFromCoords(which, c);
  }

  function selectFrom(p: Place) {
    const q = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
    setFromText(p.name);
    setOrigin({ label: p.name, query: q });
    setSelectedMode(null);
  }
  function selectTo(p: Place) {
    const q = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
    setToText(p.name);
    setDestination({ label: p.name, query: q });
    setSelectedMode(null);
  }
  function locateFrom(ep: Endpoint) {
    setFromText(ep.label);
    setOrigin(ep);
    setSelectedMode(null);
  }
  function locateTo(ep: Endpoint) {
    setToText(ep.label);
    setDestination(ep);
    setSelectedMode(null);
  }
  function swap() {
    setFromText(toText);
    setToText(fromText);
    setOrigin(destination);
    setDestination(origin);
    setSelectedMode(null);
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

  // Morph transforms (progress 0 = home, 1 = map). jsdom has no layout, so these
  // only affect visuals at runtime; they are inert in unit tests.
  const chromeOpacity = useTransform(progress, [0, 1], [0, 1]);
  const headlineOpacity = useTransform(progress, [0, 0.5], [1, 0]);
  const headlineY = useTransform(progress, [0, 1], [0, -40]);
  const popularOpacity = useTransform(progress, [0, 0.3], [1, 0]);
  const mapOpacity = useTransform(progress, [0.4, 1], [0, 1]);
  // Search container drifts from a centered pill toward the top bar as it morphs.
  const searchY = useTransform(progress, [0, 1], [0, -120]);
  const searchScale = useTransform(progress, [0, 1], [1, 0.85]);

  return (
    <div
      ref={containerRef}
      className={reduced ? "flex h-full flex-col" : "h-[200vh]"}
      data-reduced={reduced ? "true" : "false"}
    >
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden bg-gradient-to-b from-brand-light to-white">
        <motion.header
          className="flex items-center justify-between px-8 py-5"
          style={{ opacity: chromeOpacity }}
        >
          <button onClick={goHome} className="text-2xl font-bold text-brand">
            Fiets of OV
          </button>
          <nav className="flex items-center gap-3 text-sm">
            <button className="rounded-full border border-gray-200 px-5 py-2 font-medium">
              Menu &#9776;
            </button>
          </nav>
        </motion.header>

        <motion.section
          className="mx-auto max-w-4xl px-6 pt-8 text-center"
          style={{ opacity: headlineOpacity, y: headlineY }}
        >
          <h1 className="text-5xl font-bold leading-tight text-gray-900">
            Bike or transit?
            <br />
            Let the weather decide.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            Plan any trip across Amsterdam and get a rain-aware answer in one tap.
          </p>
        </motion.section>

        <motion.div
          className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-full border border-gray-200 bg-white p-2 shadow-md"
          style={{ y: searchY, scale: searchScale }}
        >
          <div className="flex flex-1 items-center px-3">
            <EndpointField
              value={fromText}
              placeholder="From"
              onText={setFromText}
              onSelect={selectFrom}
              onLocate={locateFrom}
            />
          </div>
          <button
            type="button"
            aria-label="Swap start and end"
            onClick={swap}
            className="flex-shrink-0 px-2 text-gray-400 hover:text-brand"
          >
            &#8646;
          </button>
          <div className="flex flex-1 items-center px-3">
            <EndpointField
              value={toText}
              placeholder="To"
              onText={setToText}
              onSelect={selectTo}
              onLocate={locateTo}
            />
          </div>
          <span className="h-7 w-px bg-gray-200" />
          <span className="px-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={commitSearch}
            className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
          >
            Search
          </button>
        </motion.div>

        <motion.section
          className="mx-auto mt-8 w-full max-w-4xl px-6 text-left"
          style={{ opacity: popularOpacity, pointerEvents: progressIs1 ? "none" : "auto" }}
        >
          <h2 className="mb-4 text-xl font-semibold">Popular trips</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR.map((t) => (
              <button
                key={`${t.from}-${t.to}`}
                onClick={() => pickPopular(t)}
                aria-label={`${t.from} → ${t.to}`}
                className="rounded-card border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="flex h-20 items-center justify-center rounded-card bg-brand-light text-sm font-semibold text-brand">
                  {t.from} {"→"} {t.to}
                </div>
                <p className="mt-3 text-sm font-medium text-gray-700">
                  {t.from} {"→"} {t.to}
                </p>
              </button>
            ))}
          </div>
        </motion.section>

        <motion.div
          className="absolute inset-0 flex flex-col bg-white pt-24"
          style={{ opacity: mapOpacity, pointerEvents: progressIs1 ? "auto" : "none" }}
        >
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
                  onMovePoint={onMovePoint}
                  onContextPick={onContextPick}
                  interactive={progressIs1}
                />
              </section>
            )}
          </main>
        </motion.div>
      </div>

      {!isLive() && (
        <div className="pointer-events-none fixed bottom-3 left-3 rounded-full bg-brand px-3 py-1 text-xs text-white">
          mock
        </div>
      )}
    </div>
  );
}
