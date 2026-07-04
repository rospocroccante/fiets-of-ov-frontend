import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useTransform, useMotionValueEvent } from "framer-motion";
import { EndpointField } from "./components/EndpointField";
import type { HistoryEntry } from "./components/PlaceInput";
import { FilterBar } from "./components/FilterBar";
import type { KindFilter } from "./components/FilterBar";
import { HeaderMenu } from "./components/HeaderMenu";
import { HomeAurora } from "./components/HomeAurora";
import { HomeShortcuts } from "./components/HomeShortcuts";
import { PlaceInfoCard } from "./components/PlaceInfoCard";
import type { PlaceInfo } from "./components/PlaceInfoCard";
import { WeatherStrip } from "./components/WeatherStrip";
import { CARD_ACCENTS, PRIMARY_GRADIENT, TEXT_GRADIENT } from "./lib/gradients";
import { ResultsPanel, type PanelState } from "./components/ResultsPanel";
import { MapView } from "./components/MapView";
import type { WeatherLayersState } from "./components/RainRadar";
import { useMorphProgress } from "./hooks/useMorphProgress";
import { useRecentTrips } from "./hooks/useRecentTrips";
import type { RecentTrip } from "./hooks/useRecentTrips";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import type { SavedPlace } from "./hooks/useSavedPlaces";
import { useTripPlan } from "./hooks/useTripPlan";
import { isLive } from "./api/client";
import { reverseGeocode, reverseGeocodeDetail } from "./geocode";
import type { Mode, Place } from "./api/types";
import { coordQuery } from "./trip";
import type { Endpoint, Trip } from "./trip";

// Weather fallback when no trip origin is set yet: Amsterdam centre.
const AMS_CENTER = { lat: 52.3728, lon: 4.8936 };

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
  // Weather overlay state lives here (not in MapView) so its toggles can sit in the
  // filter bar alongside Filters, a sibling of the map.
  const [radar, setRadar] = useState(false);
  const [wLayers, setWLayers] = useState<WeatherLayersState>({ rain: true, wind: true });

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

  // Maps-style local memory: search history and saved places, plus the place-info
  // card opened from the map's "What's here?".
  const { trips: recentTrips, record: recordTrip, clear: clearRecents } = useRecentTrips();
  const { places: savedPlaces, isSaved, toggle: toggleSaved, clearAll: clearSaved } = useSavedPlaces();
  const [placeInfo, setPlaceInfo] = useState<PlaceInfo | null>(null);
  // Real filters: which option kinds show, and whether rainy options are hidden.
  const [kinds, setKinds] = useState<KindFilter>({ bike: true, transit: true, bike_and_ride: true });
  const [dryOnly, setDryOnly] = useState(false);

  // Every endpoint the user has planned with, newest first, for the focus dropdown
  // (an endpoint used as origin is a fine future destination and vice versa).
  const endpointHistory: HistoryEntry[] = useMemo(() => {
    const seen = new Set<string>();
    const out: HistoryEntry[] = [];
    for (const t of recentTrips) {
      for (const e of [
        { label: t.fromLabel, query: t.fromQuery },
        { label: t.toLabel, query: t.toQuery },
      ]) {
        if (seen.has(e.query)) continue;
        seen.add(e.query);
        out.push(e);
      }
    }
    return out.slice(0, 6);
  }, [recentTrips]);

  useEffect(() => {
    if (view.status === "ready" && origin && destination) {
      recordTrip({
        fromLabel: origin.label,
        fromQuery: origin.query,
        toLabel: destination.label,
        toQuery: destination.query,
      });
    }
  }, [view.status, origin, destination, recordTrip]);

  function goHome() {
    setFromText("");
    setToText("");
    setOrigin(null);
    setDestination(null);
    setSelectedMode(null);
    setArmed(null);
    setHideMap(false);
    setRadar(false);
    setPlaceInfo(null);
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
  // Reverse-geocode responses can arrive out of order (two quick pin drags/picks);
  // only the latest lookup per endpoint may write, or a slow older response would
  // revert the endpoint to the stale location.
  const geocodeSeq = useRef({ start: 0, end: 0 });
  async function setEndpointFromCoords(
    which: "start" | "end",
    c: { lat: number; lon: number }
  ) {
    const seq = ++geocodeSeq.current[which];
    const query = coordQuery(c.lat, c.lon);
    const label = await reverseGeocode(c.lat, c.lon);
    if (seq !== geocodeSeq.current[which]) return;
    if (which === "start") {
      setFromText(label);
      setOrigin({ label, query });
    } else {
      setToText(label);
      setDestination({ label, query });
    }
    setSelectedMode(null);
  }
  async function handlePick(c: { lat: number; lon: number }) {
    if (!armed) return;
    await setEndpointFromCoords(armed, c);
    setArmed(null);
  }
  function onMovePoint(which: "start" | "end", c: { lat: number; lon: number }) {
    void setEndpointFromCoords(which, c);
  }
  function onContextPick(which: "start" | "end", c: { lat: number; lon: number }) {
    setArmed(null);
    void setEndpointFromCoords(which, c);
  }

  // A saved chip means "directions to this place": set it as the destination, jump to
  // the map and open its card (star + from/to shortcuts).
  function pickSaved(p: SavedPlace) {
    setToText(p.name);
    setDestination({ label: p.name, query: coordQuery(p.lat, p.lon) });
    setSelectedMode(null);
    setPlaceInfo({ name: p.name, address: p.label !== p.name ? p.label : null, lat: p.lat, lon: p.lon });
    toMap();
  }

  function pickRecent(t: RecentTrip) {
    setFromText(t.fromLabel);
    setToText(t.toLabel);
    setOrigin({ label: t.fromLabel, query: t.fromQuery });
    setDestination({ label: t.toLabel, query: t.toQuery });
    setSelectedMode(null);
    toMap();
  }

  async function whatsHere(c: { lat: number; lon: number }) {
    const detail = await reverseGeocodeDetail(c.lat, c.lon);
    setPlaceInfo({ name: detail.name, address: detail.address, lat: c.lat, lon: c.lon });
  }

  // Directions from the place card: the name is already known, so write the endpoint
  // directly and invalidate any in-flight reverse-geocode for that slot.
  function infoDirections(which: "start" | "end") {
    if (!placeInfo) return;
    geocodeSeq.current[which]++;
    const ep = { label: placeInfo.name, query: coordQuery(placeInfo.lat, placeInfo.lon) };
    if (which === "start") {
      setFromText(placeInfo.name);
      setOrigin(ep);
    } else {
      setToText(placeInfo.name);
      setDestination(ep);
    }
    setSelectedMode(null);
    setPlaceInfo(null);
  }

  function pickHistoryFrom(h: HistoryEntry) {
    setFromText(h.label);
    setOrigin({ label: h.label, query: h.query });
    setSelectedMode(null);
  }
  function pickHistoryTo(h: HistoryEntry) {
    setToText(h.label);
    setDestination({ label: h.label, query: h.query });
    setSelectedMode(null);
  }

  function selectFrom(p: Place) {
    setFromText(p.name);
    setOrigin({ label: p.name, query: coordQuery(p.lat, p.lon) });
    setSelectedMode(null);
  }
  function selectTo(p: Place) {
    setToText(p.name);
    setDestination({ label: p.name, query: coordQuery(p.lat, p.lon) });
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
  // Apply the user's filters to the ranked options; the selection falls back to the
  // first visible option when the current pick is filtered away.
  const filteredView = useMemo(() => {
    if (!planView) return null;
    const options = planView.options.filter(
      (o) => kinds[o.mode] && (!dryOnly || o.rainMinutes === 0),
    );
    return { ...planView, options };
  }, [planView, kinds, dryOnly]);
  const visible = filteredView?.options ?? [];
  const effectiveMode: Mode =
    selectedMode && visible.some((o) => o.mode === selectedMode)
      ? selectedMode
      : visible.some((o) => o.mode === filteredView?.recommendation)
        ? (filteredView as NonNullable<typeof filteredView>).recommendation
        : (visible[0]?.mode ?? "bike");
  const selectedOption = visible.find((o) => o.mode === effectiveMode) ?? visible[0];
  const route = selectedOption?.itinerary ?? null;

  const panel: PanelState = filteredView
    ? { status: "ready", view: filteredView, selectedMode: effectiveMode, onSelect: setSelectedMode }
    : view.status === "error"
      ? { status: "error", message: view.message ?? "error" }
      : view.status === "loading"
        ? { status: "loading" }
        : { status: "idle" };

  const count = visible.length;

  // Morph transforms (progress 0 = home, 1 = map). jsdom has no layout, so these
  // only affect visuals at runtime; they are inert in unit tests. The search pill is a
  // single shared element that flies from a centered hero pill to the map's top bar.
  const homeOpacity = useTransform(progress, [0, 0.5], [1, 0]);
  const homeY = useTransform(progress, [0, 1], [0, -30]);
  const chromeOpacity = useTransform(progress, [0.5, 1], [0, 1]);
  const mapOpacity = useTransform(progress, [0.35, 1], [0, 1]);
  const searchY = useTransform(progress, [0, 1], [260, 14]);

  return (
    <div
      ref={containerRef}
      className={reduced ? "h-screen" : "h-[200vh]"}
      data-reduced={reduced ? "true" : "false"}
    >
      <div className="sticky top-0 h-screen overflow-hidden bg-gradient-to-b from-brand-light to-white">
        {/* Map stage (progress -> 1): fills the screen below the top bar. */}
        <motion.div
          className="absolute inset-0 z-0 flex flex-col bg-white pt-20"
          style={{ opacity: mapOpacity, pointerEvents: progressIs1 ? "auto" : "none" }}
        >
          <div className="px-6">
            <FilterBar
              count={count}
              hideMap={hideMap}
              onToggleMap={() => setHideMap((v) => !v)}
              armed={armed}
              onArm={armPick}
              radar={radar}
              wLayers={wLayers}
              onToggleRadar={() => setRadar((r) => !r)}
              onToggleLayer={(k) => setWLayers((s) => ({ ...s, [k]: !s[k] }))}
              kinds={kinds}
              onToggleKind={(m) => setKinds((s) => ({ ...s, [m]: !s[m] }))}
              dryOnly={dryOnly}
              onToggleDry={() => setDryOnly((v) => !v)}
            />
          </div>
          <main className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
            <section className={hideMap ? "w-full overflow-y-auto" : "w-1/2 overflow-y-auto"}>
              <WeatherStrip
                lat={view.origin?.lat ?? AMS_CENTER.lat}
                lon={view.origin?.lon ?? AMS_CENTER.lon}
              />
              <ResultsPanel state={panel} />
            </section>
            {!hideMap && (
              <section className="relative w-1/2">
                {armed && (
                  <div className="absolute left-3 top-3 z-[1000] rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow">
                    Click the map to set the {armed}
                  </div>
                )}
                <MapView
                  origin={view.origin}
                  destination={view.destination}
                  stops={view.stops}
                  route={route}
                  onPick={handlePick}
                  picking={armed !== null}
                  onMovePoint={onMovePoint}
                  onContextPick={onContextPick}
                  onWhatsHere={whatsHere}
                  onPoiPick={(p) =>
                    setPlaceInfo({ name: p.name, address: p.kindLabel, lat: p.lat, lon: p.lon })
                  }
                  interactive={progressIs1}
                  radar={radar}
                  wLayers={wLayers}
                />
                {placeInfo && (
                  <PlaceInfoCard
                    place={placeInfo}
                    saved={isSaved(placeInfo.lat, placeInfo.lon)}
                    onToggleSave={() =>
                      toggleSaved({
                        name: placeInfo.name,
                        label: placeInfo.address ?? placeInfo.name,
                        lat: placeInfo.lat,
                        lon: placeInfo.lon,
                      })
                    }
                    onDirections={infoDirections}
                    onClose={() => setPlaceInfo(null)}
                  />
                )}
              </section>
            )}
          </main>
        </motion.div>

        {/* Home stage (progress -> 0): headline + popular, with a gap for the floating pill. */}
        <motion.div
          className="absolute inset-0 z-10"
          style={{ opacity: homeOpacity, y: homeY, pointerEvents: progressIs1 ? "none" : "auto" }}
        >
          <HomeAurora />
          <section className="relative mx-auto max-w-4xl px-6 pt-20 text-center">
            <h1 className="text-5xl font-bold leading-tight text-gray-900">
              Bike or transit?
              <br />
              <span className={TEXT_GRADIENT}>Let the weather decide.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
              Plan any trip across Amsterdam and get a rain-aware answer in one tap.
            </p>
          </section>
          <section className="mx-auto mt-[7.5rem] w-full max-w-4xl px-6 text-left">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Popular trips</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {POPULAR.map((t, i) => {
                // Clean frosted card. Colour is confined to one small accent (the
                // origin dot and the connector line) so the grid stays calm and the
                // vivid background does the talking.
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <button
                    key={`${t.from}-${t.to}`}
                    onClick={() => pickPopular(t)}
                    aria-label={`${t.from} → ${t.to}`}
                    className="group flex flex-col gap-3 rounded-card border border-white/60 bg-white/70 p-5 text-left shadow-sm ring-1 ring-slate-900/5 backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-lg"
                  >
                    {/* Mini route: origin dot, connector, destination flag. */}
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                      <span
                        className="h-px flex-1"
                        style={{ backgroundImage: `linear-gradient(to right, ${accent}, transparent)` }}
                      />
                      <span
                        className="material-symbols-rounded text-[18px] leading-none text-slate-400"
                        aria-hidden="true"
                      >
                        sports_score
                      </span>
                    </span>
                    <div>
                      <p className="truncate text-[15px] font-semibold text-slate-900">{t.from}</p>
                      <p className="truncate text-sm text-slate-500">to {t.to}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          <HomeShortcuts
            saved={savedPlaces}
            recents={recentTrips}
            onPickSaved={pickSaved}
            onPickRecent={pickRecent}
            onClearRecents={clearRecents}
          />
        </motion.div>

        {/* Top bar chrome (progress -> 1): wordmark (Home) + Menu, behind the search pill. */}
        <motion.header
          className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-gray-100 bg-white/95 px-6"
          style={{ opacity: chromeOpacity, pointerEvents: progressIs1 ? "auto" : "none" }}
        >
          <button onClick={goHome} className="text-xl font-bold text-brand">
            Fiets of OV
          </button>
          <HeaderMenu onClearRecents={clearRecents} onClearSaved={clearSaved} />
        </motion.header>

        {/* Shared morphing search pill: usable in both stages, flies center -> top bar. */}
        <motion.div
          className="absolute inset-x-0 top-0 z-30 mx-auto flex w-full max-w-3xl items-center gap-2 rounded-full border border-gray-200 bg-white p-2 shadow-md"
          style={{ y: searchY }}
        >
          <div className="flex flex-1 items-center px-3">
            <EndpointField
              value={fromText}
              placeholder="From"
              onText={setFromText}
              onSelect={selectFrom}
              onLocate={locateFrom}
              savedPlaces={savedPlaces}
              history={endpointHistory}
              onPickHistory={pickHistoryFrom}
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
              savedPlaces={savedPlaces}
              history={endpointHistory}
              onPickHistory={pickHistoryTo}
            />
          </div>
          <span className="h-7 w-px bg-gray-200" />
          <span className="px-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={commitSearch}
            className={`rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110 ${PRIMARY_GRADIENT}`}
          >
            Search
          </button>
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
