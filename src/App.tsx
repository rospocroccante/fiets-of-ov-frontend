import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useTransform, useMotionValueEvent } from "framer-motion";
import { EndpointField } from "./components/EndpointField";
import { MobileSearchSheet, SearchEntryButton } from "./components/MobileSearch";
import type { HistoryEntry } from "./components/PlaceInput";
import { FilterBar } from "./components/FilterBar";
import type { KindFilter } from "./components/FilterBar";
import { HeaderMenu } from "./components/HeaderMenu";
import { HomeAurora } from "./components/HomeAurora";
import { HomeShortcuts } from "./components/HomeShortcuts";
import { AdviceAttribution } from "./components/Attribution";
import { PrivacyNotice } from "./components/PrivacyNotice";
import { NavigationOverlay } from "./components/NavigationOverlay";
import { PlaceInfoCard } from "./components/PlaceInfoCard";
import type { PlaceInfo } from "./components/PlaceInfoCard";
import { WeatherStrip } from "./components/WeatherStrip";
import { CARD_ACCENTS, PRIMARY_GRADIENT, TEXT_GRADIENT } from "./lib/gradients";
import { ResultsPanel, type PanelState } from "./components/ResultsPanel";
import { LazyMapView as MapView, isMapLoaded, preloadMap } from "./components/lazyMap";
import type { WeatherLayersState } from "./components/RainRadar";
import { useLiveLocation } from "./hooks/useLiveLocation";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { prefetchAmsterdamPois } from "./hooks/usePois";
import { useMorphProgress } from "./hooks/useMorphProgress";
import { useRecentTrips } from "./hooks/useRecentTrips";
import type { RecentTrip } from "./hooks/useRecentTrips";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import type { SavedPlace } from "./hooks/useSavedPlaces";
import { useTheme } from "./hooks/useTheme";
import { useTripPlan } from "./hooks/useTripPlan";
import { useWakeLock } from "./hooks/useWakeLock";
import { translate, useI18n } from "./lib/i18n";
import { buildNavRoute, progressAlong } from "./lib/routeProgress";
import { isLive } from "./api/client";
import { reverseGeocode, reverseGeocodeDetail } from "./geocode";
import type { Mode, Place } from "./api/types";
import { coordQuery } from "./trip";
import type { Endpoint, Trip } from "./trip";

// Weather fallback when no trip origin is set yet: Amsterdam centre.
const AMS_CENTER = { lat: 52.3728, lon: 4.8936 };

// The first sign that the user is heading for the map. Every one of these precedes the
// morph by hundreds of milliseconds, which is the window the map chunk needs to arrive
// in so that its Suspense fallback never reaches the screen.
const WARM_EVENTS = ["scroll", "pointerdown", "touchstart", "wheel", "keydown"] as const;

// Both morph stages are mounted at once and only ever differ in opacity, so the one that
// is not on screen still answers to Tab and still reads out to a screen reader. `inert`
// is the one attribute that removes a subtree from both at the same time.
// React 18 has no typed `inert` prop (React 19 added it) but forwards unknown *string*
// attributes verbatim, and inert="" is what the HTML spec asks for; see
// src/types/react-inert.d.ts for the type side.
function inertUnless(active: boolean): { inert?: "" } {
  return active ? {} : { inert: "" };
}

// The map pane before (or without) the map: leaflet's own default container grey in
// light mode, the app's card surface in dark. Same box as MapContainer's className.
function MapPlaceholder() {
  return <div aria-hidden="true" className="h-full w-full rounded-card bg-[#ddd] dark:bg-night-surface" />;
}

type Armed = "start" | "end" | null;

interface PopularTrip {
  from: string;
  to: string;
}

// Where the home stage finishes fading. homeOpacity below is interpolated to 0 over
// exactly this range, and the pointer-events/inert gate uses the same number so the
// two can never disagree again.
const HOME_FADED_AT = 0.5;

// Phone geometry, in one place. The floating pill is not part of the home's flow (it
// belongs to the morph, not to either stage), so the home has to leave it a hole: the
// hero ends, HOME_PILL_GAP of air, the pill, HOME_PILL_CLEAR of air, and only then the
// region the user scrolls. Both halves are measured rather than guessed — the hero is
// two lines of headline in English and can be three in Dutch, and the pill's height is
// whatever its content makes it.
const HOME_PILL_GAP = 20;
const HOME_PILL_CLEAR = 16;
// The pill's resting offset on anything wider: unchanged, and unmeasured.
const DESKTOP_PILL_TOP = 260;

// Height of an element, live. Used for the two boxes the phone home has to fit around
// each other. Returns 0 where there is no layout (jsdom) or while disabled, and the
// callers fall back to the desktop constants in that case.
function useLiveHeight(ref: React.RefObject<HTMLElement>, enabled: boolean): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      setHeight(0);
      return;
    }
    const read = () => setHeight(el.offsetHeight);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return height;
}

const POPULAR: PopularTrip[] = [
  { from: "Amsterdam Centraal", to: "Vondelpark" },
  { from: "De Pijp", to: "Rijksmuseum" },
  { from: "Jordaan", to: "Amsterdamse Poort" },
  { from: "Amsterdam Zuid", to: "NDSM" },
];


export default function App() {
  const { progress, containerRef, toMap, toHome, reduced } = useMorphProgress();
  const { dark, toggle: toggleTheme } = useTheme();
  const { lang, t, toggle: toggleLang } = useI18n();

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
  // Turn-by-turn mode: drives the live-location watch, the wake lock, the maneuver
  // overlay and the follow camera. The whole nav chain derives from this one flag.
  const [navigating, setNavigating] = useState(false);
  // The privacy notice opens over whichever stage is on screen, so it is state here
  // rather than inside the header menu (which only exists on the map stage).
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // progressIs1 gates map interactivity and pointer-events so mid-morph clicks
  // don't misfire. Tracked via a motion value event (no re-render on every frame).
  const [progressIs1, setProgressIs1] = useState(false);
  // …and homeLive is the same gate for the other stage. It has to be a *separate*
  // threshold: the home fades out over the first half of the morph (homeOpacity hits 0
  // at progress 0.5) but used to keep pointer-events and stay out of `inert` until
  // progress reached 1. In between, the home was invisible and still took taps — a
  // real touch at the middle of the screen at 0.6 hit a popular-trip button nobody
  // could see and planned that trip. Invisible now means untouchable, at the same
  // number the fade uses.
  const [homeLive, setHomeLive] = useState(true);
  // Whether the map subtree may render at all. It starts false so a visitor who never
  // leaves the home never downloads leaflet; the morph moving off zero is the last
  // possible moment to turn it on, and by then WARM_EVENTS has normally had the chunk
  // in flight for a while. isMapLoaded() covers the case where the chunk is already
  // there (tests preload it), so those renders skip the placeholder entirely.
  const [mapWanted, setMapWanted] = useState(isMapLoaded);
  useMotionValueEvent(progress, "change", (v) => {
    setProgressIs1(v > 0.99);
    setHomeLive(v < HOME_FADED_AT);
    if (v > 0) setMapWanted(true);
  });

  // One counter for "the user just asked for this trip". Endpoint edits already change
  // the plan's identity through from/to, but re-submitting an unchanged route does not:
  // this nonce is what makes that second Search fetch fresh departures.
  const [submitSeq, setSubmitSeq] = useState(0);
  const submitted = () => setSubmitSeq((n) => n + 1);

  const trip: Trip | null = useMemo(
    () =>
      origin && destination
        ? { from: origin.query, to: destination.query, submit: submitSeq }
        : null,
    [origin, destination, submitSeq]
  );
  const view = useTripPlan(trip);

  // Warm the POI layer once the initial render has settled: one bulk fetch covers
  // central Amsterdam and persists per cell, so places appear instantly everywhere.
  useEffect(() => {
    if (!isLive()) return;
    const id = window.setTimeout(() => void prefetchAmsterdamPois(), 2500);
    return () => window.clearTimeout(id);
  }, []);

  // Fetch the map chunk on the first sign of intent (see WARM_EVENTS) and let it render
  // from then on. One shot: the dynamic import caches its own module, so once it has run
  // the listeners have nothing left to do.
  useEffect(() => {
    if (mapWanted) return;
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      void preloadMap();
      setMapWanted(true);
      for (const ev of WARM_EVENTS) window.removeEventListener(ev, warm);
    };
    for (const ev of WARM_EVENTS) window.addEventListener(ev, warm, { passive: true });
    return () => {
      for (const ev of WARM_EVENTS) window.removeEventListener(ev, warm);
    };
  }, [mapWanted]);

  // Maps-style local memory: search history and saved places, plus the place-info
  // card opened from the map's "What's here?".
  const { trips: recentTrips, record: recordTrip, clear: clearRecents } = useRecentTrips();
  const { places: savedPlaces, isSaved, toggle: toggleSaved, clearAll: clearSaved } = useSavedPlaces();
  const [placeInfo, setPlaceInfo] = useState<PlaceInfo | null>(null);
  // Real filters: which option kinds show (one chip per kind in the filter bar).
  const [kinds, setKinds] = useState<KindFilter>({ bike: true, transit: true, bike_and_ride: true });

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
    // Off-route replans rewrite the origin to "Current location"; recording those
    // would pollute the history, so recents only record outside navigation.
    if (navigating) return;
    if (view.status === "ready" && origin && destination) {
      recordTrip({
        fromLabel: origin.label,
        fromQuery: origin.query,
        toLabel: destination.label,
        toQuery: destination.query,
      });
    }
  }, [view.status, origin, destination, recordTrip, navigating]);

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
    setNavigating(false);
    setSearchOpen(false);
    toHome();
  }
  function commitSearch() {
    const f = fromText.trim();
    const to = toText.trim();
    if (!f || !to) return;
    // Keep the endpoint's coordinates when the visible text is still that endpoint's
    // label (map picks, history entries, "Current location" after a nav replan):
    // rebuilding from raw text would send labels the geocoder cannot resolve.
    setOrigin(origin && origin.label === f ? origin : { label: f, query: f });
    setDestination(destination && destination.label === to ? destination : { label: to, query: to });
    setSelectedMode(null);
    submitted();
    // Searching from the phone sheet cannot start the morph here. toMap() is a *smooth*
    // scroll, and the sheet's scroll-restore — the cleanup of the effect that locks the
    // body, which fires as it unmounts — is an instant window.scrollTo(0, y) with the
    // offset the sheet was opened at. The instant one lands second and cancels the
    // smooth one: the plan ran, three options rendered, and the app sat on the home
    // stage indefinitely. So the sheet closes first and the morph waits for it to be
    // gone; the effect below is what runs after that. Every other caller (the desktop
    // pill, the popular trips, a saved place) has no sheet mounted and goes straight.
    if (searchOpen) {
      mapAfterSheet.current = true;
      setSearchOpen(false);
    } else {
      toMap();
    }
  }
  function pickPopular(t: PopularTrip) {
    setFromText(t.from);
    setToText(t.to);
    setOrigin({ label: t.from, query: t.from });
    setDestination({ label: t.to, query: t.to });
    setSelectedMode(null);
    setArmed(null);
    submitted();
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
    submitted();
    toMap();
  }

  function pickRecent(t: RecentTrip) {
    setFromText(t.fromLabel);
    setToText(t.toLabel);
    setOrigin({ label: t.fromLabel, query: t.fromQuery });
    setDestination({ label: t.toLabel, query: t.toQuery });
    setSelectedMode(null);
    submitted();
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
    const options = planView.options.filter((o) => kinds[o.mode]);
    return { ...planView, options };
  }, [planView, kinds]);
  const visible = filteredView?.options ?? [];
  const effectiveMode: Mode =
    selectedMode && visible.some((o) => o.mode === selectedMode)
      ? selectedMode
      : visible.some((o) => o.mode === filteredView?.recommendation)
        ? (filteredView as NonNullable<typeof filteredView>).recommendation
        : (visible[0]?.mode ?? "bike");
  const selectedOption = visible.find((o) => o.mode === effectiveMode) ?? visible[0];
  const route = selectedOption?.itinerary ?? null;

  // Navigation chain: route -> nav plan -> live (or simulated) fix -> progress.
  // Everything derives from `navigating`, so Start/Exit builds or drops it whole,
  // and a replan (new route identity) rebuilds it without leaving nav mode.
  const navRoute = useMemo(
    () => (navigating && route ? buildNavRoute(route, lang) : null),
    [navigating, route, lang]
  );
  // Mock mode has no GPS: replay the route itself instead of watching the device.
  const simulation = useMemo(
    () => (!isLive() && navRoute ? { points: navRoute.points } : undefined),
    [navRoute]
  );
  const { fix } = useLiveLocation(navigating, simulation);
  // navProgress, not progress: that name is taken by the home<->map morph value.
  const navProgress = useMemo(
    () => (navRoute && fix ? progressAlong(navRoute, fix.lat, fix.lon) : null),
    [navRoute, fix]
  );
  useWakeLock(navigating);
  // Proportional ETA: the remaining share of the route times the itinerary's minutes.
  const etaMinutes =
    navRoute && navProgress
      ? Math.max(1, Math.round((navProgress.remaining / navRoute.total) * (route?.minutes ?? 0)))
      : 0;

  // Off-route replan: 40 m of drift for 3 consecutive fixes means a genuinely missed
  // turn, not GPS noise; the 20 s floor keeps a slow rejoin from thrashing the
  // planner. Replanning swaps the origin for the live position and stays in nav mode.
  const offRouteFixes = useRef(0);
  const lastReplanAt = useRef(0);
  useEffect(() => {
    if (!navigating || !navProgress || !fix) {
      offRouteFixes.current = 0;
      return;
    }
    // A fix kilometres away is not a missed turn: it is a desktop wifi position or a
    // GPS glitch, and replanning from there tears the route away (often to "no route
    // found" outside the graph). Those fixes get the far-from-route hint instead.
    const off = navProgress.offRouteM;
    offRouteFixes.current = off > 40 && off <= 2000 ? offRouteFixes.current + 1 : 0;
    if (offRouteFixes.current < 3 || Date.now() - lastReplanAt.current < 20_000) return;
    offRouteFixes.current = 0;
    lastReplanAt.current = Date.now();
    // Bump the sequence so an in-flight reverse-geocode for the start slot cannot
    // overwrite the live-position origin (same rule as pin drags).
    geocodeSeq.current.start++;
    const here = translate(lang, "currentLocation");
    setFromText(here);
    setOrigin({ label: here, query: coordQuery(fix.lat, fix.lon) });
  }, [navigating, navProgress, fix, lang]);
  const farFromRoute = navigating && navProgress != null && navProgress.offRouteM > 2000;

  // A replan that fails (position outside the routing graph) must not leave a dead
  // nav session running: drop back to the plain error card.
  useEffect(() => {
    if (navigating && view.status === "error") setNavigating(false);
  }, [navigating, view.status]);

  const panel: PanelState = filteredView
    ? { status: "ready", view: filteredView, selectedMode: effectiveMode, onSelect: setSelectedMode }
    : view.status === "error"
      ? { status: "error", message: view.message ?? "error" }
      : view.status === "loading"
        ? { status: "loading" }
        : { status: "idle" };

  const count = visible.length;

  // What the polite live region says. Empty while idle/loading so the region only ever
  // speaks on an outcome; the strings are translated like everything else.
  const liveStatus =
    filteredView != null
      ? t("planReadyAnnounce", { n: count })
      : view.status === "error"
        ? t("planErrorAnnounce")
        : "";

  // Morph transforms (progress 0 = home, 1 = map). jsdom has no layout, so these
  // only affect visuals at runtime; they are inert in unit tests. The search pill is a
  // single shared element that flies from a centered hero pill to the map's top bar.
  const homeOpacity = useTransform(progress, [0, HOME_FADED_AT], [1, 0]);
  const homeY = useTransform(progress, [0, 1], [0, -30]);
  const chromeOpacity = useTransform(progress, [HOME_FADED_AT, 1], [0, 1]);
  const mapOpacity = useTransform(progress, [0.35, 1], [0, 1]);
  // Wide screens: 9px lands the ~62px pill vertically centred in the 80px (h-20)
  // header, between the wordmark and the menu. Below lg there is no room for all
  // three on one line, so the header shrinks to h-14 (56px) and the pill flies to
  // its own row tight underneath (y=60) instead of covering the wordmark. The map
  // stage's top padding follows the same breakpoint (pt-[8.25rem] vs lg:pt-24).
  const wideChrome = useMediaQuery("(min-width: 1024px)", true);
  // A phone on its side: 390px of height, of which the header, the resting search pill
  // and the filter bar took 194 before the results column got a pixel — 49.7% of the
  // screen. The three boxes above the content are sized for a portrait phone and there
  // is no reason they should be here, so on a short viewport the header comes down to a
  // 48px bar (the back control is still 44px inside it), the pill loses a padding step,
  // and the stage's headroom follows both down. Not on a wide short window: there the
  // pill flies into the top bar instead of resting under it, and shrinking that bar
  // would leave it hanging out of the bottom.
  const shortChrome = useMediaQuery("(max-height: 500px)") && !wideChrome;
  // The phone layout. Two conditions, because width alone described the wrong set of
  // devices: a phone turned on its side is 844px wide and fell through to the desktop
  // pill, which put a floating search field over a home that scrolls underneath it —
  // at 844x390 a touch at the centre of a popular-trip card landed in the From input.
  // The second clause is that phone: short and touched, whatever its width. It cannot
  // catch a laptop, which is `pointer: fine` however short the window gets, and it does
  // not touch the 640-1024px desktop band at all. jsdom's matchMedia answers false to
  // both, which keeps every existing test — and the desktop layout it describes — on
  // the unchanged path.
  const isPhone = useMediaQuery("(max-width: 639.98px), (max-height: 500px) and (pointer: coarse)");
  // A phone on its side, and only that: `shortChrome` alone also describes a laptop
  // window dragged short, where the pill still holds two inputs, a swap and a Search
  // button and could not share a 56px bar with the wordmark and the menu.
  //
  // On this one layout the pill flies *into* the header instead of resting under it.
  // The arithmetic left no other option: two thirds of a 390px screen is 260px, which
  // leaves 130px for everything above it, and a 48px header with a 54px pill on its own
  // row underneath already spends 106 before the filter bar's 44px targets get a pixel.
  // The phone pill carries one control (SearchEntryButton), so at 844 wide it fits in
  // the 567px of bar between the wordmark and the menu with room either side — which is
  // exactly the arrangement the app already uses from `lg` up.
  const landscapePhone = isPhone && shortChrome;
  const heroRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const heroHeight = useLiveHeight(heroRef, isPhone);
  const pillHeight = useLiveHeight(pillRef, isPhone);
  // On a phone the pill rests just under the hero instead of at a fixed 260px. At 260
  // it covered the last line of the subtitle on every portrait phone (23px of a 24px
  // line), and a tap aimed at the end of that sentence landed in the To field.
  const pillTop = isPhone && heroHeight > 0 ? heroHeight + HOME_PILL_GAP : DESKTOP_PILL_TOP;
  // Every number here is an offset inside the pill's own containing block, whose top is
  // env(safe-area-inset-top) — so 60 means "60px below the notch", not 60px below the
  // physical edge, and the header (3.5rem + the same inset) is cleared on any phone.
  // 3 centres the 50px landscape pill in its 56px header.
  const searchY = useTransform(
    progress,
    [0, 1],
    [pillTop, wideChrome ? 9 : landscapePhone ? 3 : shortChrome ? 52 : 60],
  );
  // The hole the home's scroller leaves for the pill.
  const pillSlot =
    pillHeight > 0 ? HOME_PILL_GAP + pillHeight + HOME_PILL_CLEAR : HOME_PILL_GAP + 58 + HOME_PILL_CLEAR;

  // The phone search screen, and the control that opened it: focus has to go back
  // there when the screen closes, or a keyboard user is dropped at the top of the page.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusField, setSearchFocusField] = useState<"from" | "to">("from");
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchWasOpen = useRef(false);
  // Set by commitSearch when the search came from the sheet: the morph it asked for is
  // owed once the sheet has unmounted. React runs an unmounting component's effect
  // cleanups before it runs anyone's effects for that same commit, so by the time this
  // fires the sheet's scroll-restore has already happened and the smooth scroll below
  // is the last word on where the page goes.
  const mapAfterSheet = useRef(false);
  useEffect(() => {
    if (searchWasOpen.current && !searchOpen) {
      searchTriggerRef.current?.focus();
      if (mapAfterSheet.current) {
        mapAfterSheet.current = false;
        toMap();
      }
    }
    searchWasOpen.current = searchOpen;
  }, [searchOpen, toMap]);
  // While the phone search screen is up it is the only thing on the page. It says so
  // (aria-modal), and this is what makes that true: both morph stages and the chrome
  // between them go inert and hidden, so Tab cannot walk behind the sheet, a screen
  // reader cannot read the map out from under it, and a stray touch cannot reach the
  // home. The scroll lock that goes with it lives in MobileSearchSheet.
  const searchBlocking = isPhone && searchOpen;
  const behindSheet = searchBlocking ? { "aria-hidden": true as const } : {};
  function openSearch() {
    // The keyboard opens on the field that still needs something. With a whole trip
    // already entered the reason to come back is nearly always a new destination.
    setSearchFocusField(fromText.trim() ? "to" : "from");
    setSearchOpen(true);
  }

  return (
    <div
      ref={containerRef}
      className={reduced ? "relative h-dvh" : "relative h-[200dvh]"}
      data-reduced={reduced ? "true" : "false"}
    >
      {/* Skip link. Tab order starts with the header wordmark and menu and then the
          search pill's two fields, swap and Search button, so without this a keyboard
          user pays six stops before reaching the advice. The target follows the morph:
          only one of the two stages is ever the live main landmark, and pointing at
          the inert one would land focus somewhere nobody can see. `fixed`, not
          `absolute`: the container is two viewports tall and the map stage rests at
          the bottom of it. */}
      <a
        href={progressIs1 ? "#fov-map-main" : "#fov-home-main"}
        className="sr-only focus:not-sr-only focus:fixed focus:left-[calc(0.75rem+env(safe-area-inset-left))] focus:top-[calc(0.75rem+env(safe-area-inset-top))] focus:z-[3000] focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-full focus:bg-white focus:px-4 focus:text-sm focus:font-semibold focus:text-brand focus:shadow-lg dark:focus:bg-night-raised dark:focus:text-emerald-300"
      >
        {t("skipToContent")}
      </a>
      {/* Scroll snap sentinels: resting mid-morph leaves a half-faded, half-dead UI, so
          proximity snap (see index.css) resolves the scroll to whichever stage is closer. */}
      {!reduced && (
        <>
          <div aria-hidden="true" className="absolute top-0 h-px w-px snap-start" />
          <div aria-hidden="true" className="absolute top-[100dvh] h-px w-px snap-start" />
        </>
      )}
      {/* dvh, not vh, throughout the morph geometry. On a phone 100vh is the *large*
          viewport (URL bar collapsed) while useMorphProgress divides by the current
          window.innerHeight: with the bar on screen the two disagree, the stage is
          taller than what you can see (its bottom rows unreachable, because the scroll
          that would reveal them is spent on the morph instead) and progress reaches 1
          before the second sentinel. dvh keeps sentinel, stage and divisor identical. */}
      <div className="sticky top-0 h-dvh overflow-hidden bg-white dark:bg-night-bg">
        {/* Map stage (progress -> 1): fills the screen below the top bar. Inert until
            the morph completes: it is fully rendered from the first paint, so without
            this a screen reader on the home reads out the whole map/results UI, and Tab
            walks into controls nobody can see. */}
        {/* The top padding clears the header and the search pill resting under it. On a
            landscape phone that headroom was 52.8% of a 390px-tall screen before the
            results column got any of it, then 49.7%, then 43.6% — still nowhere near
            leaving the map and the advice two thirds of the screen. With the pill inside
            the header on that layout there is nothing under the bar to clear any more,
            so the headroom is the 56px bar plus 8px of air, and the whole stack above
            the content comes to 120px of 390 (30.8%). Every other tier is unchanged. */}
        <motion.div
          data-fov="map-stage"
          className={`absolute inset-0 z-0 flex flex-col bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] dark:bg-night-bg ${
            landscapePhone
              ? "pt-[calc(4rem+env(safe-area-inset-top))]"
              : "pt-[calc(8.25rem+env(safe-area-inset-top))] [@media(max-height:500px)]:pt-[calc(6rem+env(safe-area-inset-top))] lg:pt-[calc(6rem+env(safe-area-inset-top))]"
          }`}
          style={{ opacity: mapOpacity, pointerEvents: progressIs1 && !searchBlocking ? "auto" : "none" }}
          {...inertUnless(progressIs1 && !searchBlocking)}
          {...behindSheet}
        >
          <div className="px-4 md:px-6">
            <FilterBar
              count={count}
              hideMap={hideMap}
              onToggleMap={() => setHideMap((v) => !v)}
              armed={armed}
              onArm={armPick}
              radar={radar}
              onToggleRadar={() => setRadar((r) => !r)}
              kinds={kinds}
              onToggleKind={(m) => setKinds((s) => ({ ...s, [m]: !s[m] }))}
              phone={isPhone}
              compact={landscapePhone}
            />
          </div>
          {/* Below md the two panes stack, map first (Maps-style: map on top, results
              scrolling under it); from md up they sit side by side, results left. */}
          {/* tabIndex -1 so the skip link can put focus here; without it the browser
              scrolls to the anchor but focus stays where it was and the next Tab
              starts again from the top. */}
          <main
            id="fov-map-main"
            tabIndex={-1}
            className={`flex min-h-0 flex-1 flex-col gap-3 px-4 focus:outline-none md:flex-row md:gap-4 md:px-6 ${
              // 24px of floor is a portrait margin. On a phone turned sideways it is the
              // last 16px between the advice and two thirds of the screen.
              landscapePhone
                ? "pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
                : "pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            }`}
          >
            <section
              data-fov="results-column"
              className={`order-2 min-h-0 flex-1 overflow-y-auto md:order-1 md:flex-none ${
                hideMap ? "md:w-full" : "md:w-1/2"
              }`}
            >
              {/* On a phone turned sideways the column is ~262px tall and this strip's
                  55px is the difference between one readable option row and two. The
                  forecast still reaches the rider there — in the banner under the list,
                  with the Open-Meteo credit beside it. Everywhere else the strip leads
                  the column as before. */}
              {!landscapePhone && (
                <WeatherStrip
                  lat={view.origin?.lat ?? AMS_CENTER.lat}
                  lon={view.origin?.lon ?? AMS_CENTER.lon}
                  compact={isPhone}
                />
              )}
              <ResultsPanel
                state={panel}
                onStartNav={route ? () => setNavigating(true) : undefined}
                narrow={isPhone}
              />
              {/* Weather and OpenStreetMap credit for the advice itself, which stays on
                  screen whether or not the map is showing. Open-Meteo's CC BY 4.0 terms
                  ask for a link next to where its data is shown, and the forecast strip
                  is at the top of this column. */}
              <AdviceAttribution />
            </section>
            {/* The phone split. 40dvh of map left the results column 246px on a 360x800
                phone, which is not enough for the option rows to arrive on screen
                whatever is above them: the map took 40% of the window, the chrome above
                it 29%, and the product got the 31% left over. 32dvh puts the column at
                310px against 256px of map — the larger half now belongs to the advice,
                and the map is still bigger than the whole column used to be. From `md`
                up the two panes are side by side and this height does not apply at all.
                "Hide map" in the filter bar remains the way to give the column the
                whole screen. */}
            {!hideMap && (
              <section className="relative order-1 h-[32dvh] shrink-0 md:order-2 md:h-auto md:w-1/2">
                {armed && (
                  <div className="absolute left-3 top-3 z-[1000] rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow dark:bg-emerald-600">
                    {armed === "start" ? t("clickMapSetStart") : t("clickMapSetEnd")}
                  </div>
                )}
                {/* Both branches render the identical box in the map container's own
                    resting colour, so whether the chunk is here yet or not the stage has
                    the same shape and the same fill: no layout shift, no flash of a hole
                    mid-morph. With the warm-up above, the placeholder is normally gone
                    before the stage is visible at all. */}
                {!mapWanted ? (
                  <MapPlaceholder />
                ) : (
                <Suspense fallback={<MapPlaceholder />}>
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
                    onLayerToggle={(k) => setWLayers((s) => ({ ...s, [k]: !s[k] }))}
                    dark={dark}
                    liveFix={fix}
                    navigating={navigating}
                  />
                </Suspense>
                )}
                {navigating && navProgress && (
                  <NavigationOverlay
                    next={navProgress.next}
                    toNext={navProgress.toNext}
                    remaining={navProgress.remaining}
                    etaMinutes={etaMinutes}
                    onExit={() => setNavigating(false)}
                  />
                )}
                {farFromRoute && (
                  <div className="absolute left-3 top-24 z-[1000] rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow dark:bg-night-surface/95 dark:text-amber-300">
                    {t("farFromRoute")}
                  </div>
                )}
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

        {/* The home's background, in a layer of its own between the map stage (z-0) and
            the home (z-10). It fades on exactly the same curve as the home and never
            moves: the home lifts 30px through the morph and clips whatever it holds, so
            an aurora inside it was cut off at the foot of the screen for as long as the
            fade lasted. Decorative, aria-hidden and untouchable, so it needs nothing
            else from either stage. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{ opacity: homeOpacity }}
        >
          <HomeAurora dark={dark} />
        </motion.div>

        {/* Home stage (progress -> 0): headline + popular, with a gap for the floating pill.
            overflow-y-auto is the phone fix: the stage is `absolute inset-0` inside an
            `overflow-hidden` sticky box and the page scroll is spent on the morph, so
            anything past one viewport used to be unreachable for good — at 390x844 the
            fourth popular trip started 5px below the fold and the whole HomeShortcuts
            block (saved places, recents) lived past it. Content that fits still produces
            no scroller at all, so nothing changes on a laptop. */}
        <motion.div
          // The map stage owns the document's only <main> element; while the home is the
          // stage on screen that one is inert, so the landmark moves here instead of
          // leaving the visible screen without one. Never both.
          role={homeLive ? "main" : undefined}
          id="fov-home-main"
          data-fov="home-stage"
          tabIndex={-1}
          // pt as well as the other three: the hero's own headline used to start 48px
          // down, which is under the status bar on a notched phone now that the page
          // paints there. The pill's containing block starts at the same inset, so
          // pillTop (measured from the hero's height) still lands it under the hero.
          className={`absolute inset-0 z-10 overflow-x-hidden pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] focus:outline-none ${
            // On a phone the stage is a column: a hero that does not move, a hole for
            // the floating pill, and a scroller below it. It used to be one scroller
            // with the pill hanging over its middle, which meant the content passed
            // *under* the pill as you scrolled — at the bottom of the home the first
            // popular trip sat behind it and the tap that looked like it opened that
            // trip focused the To field instead. Nothing scrolls under the pill now.
            isPhone ? "flex flex-col overflow-y-hidden" : "overflow-y-auto"
          }`}
          style={{ opacity: homeOpacity, y: homeY, pointerEvents: homeLive && !searchBlocking ? "auto" : "none" }}
          {...inertUnless(homeLive && !searchBlocking)}
          {...behindSheet}
        >
          {/* Theme and language switches reachable from the home too (the header only
              exists on the map stage). z-10 is load-bearing: the headline <section>
              below is `relative` and comes later in the DOM, so at z-index auto it
              painted over this corner and swallowed both clicks on every window too
              narrow for max-w-4xl to clear the buttons (under ~1050px) — the home had
              no working language switch at all there. The inset offsets keep the pair
              clear of a notch/status bar now that the page paints under it. */}
          <div className="absolute right-[calc(1rem+env(safe-area-inset-right))] top-[calc(1rem+env(safe-area-inset-top))] z-10 flex items-center gap-2">
            <button
              type="button"
              aria-label={t("switchLanguage")}
              onClick={toggleLang}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/60 bg-white/70 px-3 text-xs font-semibold leading-[20px] text-slate-500 shadow-sm backdrop-blur-md transition hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-emerald-300 dark:hover:bg-white/20"
            >
              {lang === "en" ? "NL" : "EN"}
            </button>
            <button
              type="button"
              aria-label={dark ? t("switchToLight") : t("switchToDark")}
              aria-pressed={dark}
              onClick={toggleTheme}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/60 bg-white/70 text-slate-500 shadow-sm backdrop-blur-md transition hover:bg-white/90 dark:border-white/10 dark:bg-white/10 dark:text-emerald-300 dark:hover:bg-white/20"
            >
              <span aria-hidden="true" className="material-symbols-rounded block text-[20px] leading-none">
                {dark ? "light_mode" : "dark_mode"}
              </span>
            </button>
          </div>
          {/* The measured hero. Its height is what tells the pill where to rest on a
              phone, so the wrapper is the thing observed, not the section inside it. */}
          <div ref={heroRef} data-fov="home-hero" className={isPhone ? "shrink-0" : undefined}>
            {/* Less headroom on a phone: every pixel above the hero is a pixel the
                popular trips below the pill do not get. Unchanged from `sm` up. */}
            <section className="relative mx-auto max-w-4xl px-6 pt-12 text-center sm:pt-20">
              <h1 className="text-4xl font-bold leading-tight text-gray-900 dark:text-night-text sm:text-5xl">
                {t("headlineTop")}
                <br />
                <span className={TEXT_GRADIENT}>{t("headlineBottom")}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base text-gray-600 dark:text-night-muted sm:text-lg">
                {t("subtitle")}
              </p>
            </section>
          </div>
          {/* The hole the pill floats in. Only on a phone: above `sm` the pill rests at
              a fixed 260px and the popular section's own top margin already clears it. */}
          {isPhone && (
            <div aria-hidden="true" className="shrink-0" style={{ height: pillSlot }} />
          )}
          {/* Everything the user scrolls. `contents` above `sm` so the desktop home is
              byte-for-byte the single flow it has always been. */}
          <div className={isPhone ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden" : "contents"}>
          <section className="mx-auto mt-6 w-full max-w-4xl px-6 text-left sm:mt-[7.5rem]">
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-night-text">{t("popularTrips")}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {POPULAR.map((trip, i) => {
                // Clean frosted card. Colour is confined to one small accent (the
                // origin dot and the connector line) so the grid stays calm and the
                // vivid background does the talking.
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <button
                    key={`${trip.from}-${trip.to}`}
                    data-fov="popular-trip"
                    onClick={() => pickPopular(trip)}
                    aria-label={`${trip.from} → ${trip.to}`}
                    className="group flex flex-col gap-3 rounded-card border border-white/60 bg-white/70 p-5 text-left shadow-sm ring-1 ring-slate-900/5 backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-lg dark:border-white/10 dark:bg-white/10 dark:ring-white/5 dark:hover:bg-white/15"
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
                      <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-night-text">{trip.from}</p>
                      <p className="truncate text-sm text-slate-500 dark:text-night-subtle">{t("toX", { x: trip.to })}</p>
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
          {/* The home has no header, so the notice needs its own way in here. It is the
              last thing on the page, where a footer link belongs. */}
          <div className="mx-auto mt-8 flex w-full max-w-4xl justify-center px-6 pb-6">
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm text-slate-500 underline underline-offset-4 transition hover:text-slate-800 dark:text-night-subtle dark:hover:text-night-text"
            >
              {t("privacy")}
            </button>
          </div>
          </div>
        </motion.div>

        {/* Top bar chrome (progress -> 1): wordmark (Home) + Menu, behind the search pill.
            Deliberately WITHOUT a z-index: a positioned z-20 header is a stacking context,
            which trapped the menu dropdown's z-50 inside the z-20 layer and let the z-30
            search pill paint over it (below lg the pill's own buttons sat on top of the
            menu's first row and ate its clicks). At z-index auto the header still paints
            above the z-0 map stage by tree order, the pill still flies over the bar, and
            the dropdown's z-50 finally outranks it. The home stage (z-10) now paints over
            the header, which is inert: the two never share a visible moment (homeOpacity
            hits 0 at progress 0.5, chromeOpacity only leaves 0 from there on). */}
        <motion.header
          className={`absolute inset-x-0 top-0 flex items-center justify-between border-b border-gray-100 bg-white/95 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] dark:border-white/10 dark:bg-night-bg/95 sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))] ${
            // Decided in JS rather than by a media variant: the short tier has to beat
            // `lg` on a wide short window, and which of two arbitrary variants wins is
            // a question about the generated stylesheet's order, not about the design.
            // A phone on its side gets 8px more than the plain short tier because the
            // pill lives inside this bar there rather than under it.
            landscapePhone
              ? "h-[calc(3.5rem+env(safe-area-inset-top))]"
              : shortChrome
                ? "h-[calc(3rem+env(safe-area-inset-top))]"
                : "h-[calc(3.5rem+env(safe-area-inset-top))] lg:h-[calc(5rem+env(safe-area-inset-top))]"
          }`}
          style={{ opacity: chromeOpacity, pointerEvents: progressIs1 && !searchBlocking ? "auto" : "none" }}
          {...inertUnless(progressIs1 && !searchBlocking)}
          {...behindSheet}
        >
          <div className="flex min-w-0 items-center gap-1">
            {/* Getting off the map. On a phone the only way back used to be the wordmark,
                which is a 5px-tall word in the corner reading as branding rather than as
                a control, and nothing else on the stage said the home was still there.
                This is the arrow every map app puts in that corner. It walks back to the
                stage the user came from and leaves the trip alone; the wordmark next to
                it still means "home, and start again".
                The arrow is inline SVG, not the icon font: that subset is frozen and a
                glyph missing from it paints as the word "ARROW_BACK" across the bar. */}
            {isPhone && (
              <button
                type="button"
                data-fov="map-back"
                aria-label={t("backToHome")}
                onClick={toHome}
                className="-ml-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-night-muted dark:hover:bg-night-hover"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <button
              onClick={goHome}
              className="flex min-h-[44px] items-center truncate text-xl font-bold text-brand dark:text-emerald-300"
            >
              Fiets of OV
            </button>
          </div>
          <HeaderMenu
            onClearRecents={clearRecents}
            onClearSaved={clearSaved}
            onOpenPrivacy={() => setPrivacyOpen(true)}
            dark={dark}
            onToggleTheme={toggleTheme}
          />
        </motion.header>

        {/* Shared morphing search pill: usable in both stages, flies center -> top bar.
            On phones it keeps a side margin and drops the decorative bits ("Now", the
            divider) so the two fields and the button always fit. */}
        {/* The pill's box, spelled out rather than assembled from conflicting utilities:
            which of two same-specificity Tailwind classes wins is a question about the
            generated stylesheet's order, and left/right/width is not a question to leave
            to that.

            Portrait and desktop: 12px in from each edge plus whatever the device's own
            left/right inset is, centred, capped at max-w-2xl — identical geometry to the
            `w-[calc(100%-1.5rem)]` it replaces whenever the insets are 0.

            Landscape phone: the pill is in the header row, so it stops short of the
            wordmark on its left (which ends at 166px) and the menu on its right (which
            starts at 733px), with ~9px of air either side. */}
        <motion.div
          ref={pillRef}
          role="search"
          data-fov="search-pill"
          data-rest-y={pillTop}
          className={`absolute top-[env(safe-area-inset-top)] z-30 mx-auto flex w-auto items-center gap-0.5 rounded-full border border-gray-200 bg-white shadow-md dark:border-night-border dark:bg-night-surface sm:gap-2 ${
            landscapePhone
              ? "left-[calc(11rem+env(safe-area-inset-left))] right-[calc(7.5rem+env(safe-area-inset-right))] max-w-none p-0.5"
              : `left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))] max-w-2xl xl:max-w-3xl ${
                  shortChrome ? "p-1" : "p-1.5 sm:p-2"
                }`
          }`}
          style={{ y: searchY, pointerEvents: searchBlocking ? "none" : "auto" }}
          // The pill opened the sheet, so it is behind it now — including for the focus
          // ring, which is why inert leaves before the close handler puts focus back on
          // the trigger (React commits the DOM, then runs the effect).
          {...inertUnless(!searchBlocking)}
          {...behindSheet}
        >
          {isPhone ? (
            // One target, full width, unmistakable. The form it stands for lives in
            // MobileSearchSheet, which owns the whole screen.
            <SearchEntryButton
              ref={searchTriggerRef}
              fromText={fromText}
              toText={toText}
              onOpen={openSearch}
            />
          ) : (
          <>
          <div className="flex min-w-0 flex-1 items-center sm:px-3">
            <EndpointField
              value={fromText}
              placeholder={t("from")}
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
            aria-label={t("swapStartEnd")}
            onClick={swap}
            className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center text-gray-400 hover:text-brand dark:hover:text-emerald-300"
          >
            &#8646;
          </button>
          <div className="flex min-w-0 flex-1 items-center sm:px-3">
            <EndpointField
              value={toText}
              placeholder={t("to")}
              onText={setToText}
              onSelect={selectTo}
              onLocate={locateTo}
              savedPlaces={savedPlaces}
              history={endpointHistory}
              onPickHistory={pickHistoryTo}
            />
          </div>
          <span className="hidden h-7 w-px bg-gray-200 dark:bg-night-border sm:block" />
          <span className="hidden px-3 text-sm text-gray-500 dark:text-night-subtle sm:inline">{t("now")}</span>
          <button
            aria-label={t("search")}
            onClick={commitSearch}
            className={`flex min-h-[44px] flex-shrink-0 items-center rounded-full px-4 text-sm font-semibold text-white shadow-md transition hover:brightness-110 sm:px-6 ${PRIMARY_GRADIENT}`}
          >
            {t("search")}
          </button>
          </>
          )}
        </motion.div>
      </div>

      {/* Plan results are painted into a pane the user may not be looking at (on a phone
          the map takes the top half and the panel scrolls under it), and a failed plan
          replaces them silently. One polite region says which of the two happened. */}
      <p aria-live="polite" className="sr-only">
        {liveStatus}
      </p>

      {/* Outside both morph stages: one of the two is always inert, and a dialog
          opened from the inert one would be unreachable. The phone search screen is
          here for the same reason — it opens from the pill, which belongs to neither. */}
      {isPhone && searchOpen && (
        <MobileSearchSheet
          fromText={fromText}
          toText={toText}
          onFromText={setFromText}
          onToText={setToText}
          onSelectFrom={selectFrom}
          onSelectTo={selectTo}
          onLocateFrom={locateFrom}
          onLocateTo={locateTo}
          savedPlaces={savedPlaces}
          history={endpointHistory}
          onPickHistoryFrom={pickHistoryFrom}
          onPickHistoryTo={pickHistoryTo}
          onSwap={swap}
          onSubmit={commitSearch}
          onClose={() => setSearchOpen(false)}
          focusField={searchFocusField}
        />
      )}
      {privacyOpen && <PrivacyNotice onClose={() => setPrivacyOpen(false)} />}

      {!isLive() && (
        <div className="pointer-events-none fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-[calc(0.75rem+env(safe-area-inset-left))] rounded-full bg-brand px-3 py-1 text-xs text-white">
          mock
        </div>
      )}
    </div>
  );
}
