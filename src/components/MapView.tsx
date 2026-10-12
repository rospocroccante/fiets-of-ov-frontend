import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
// Leaflet's stylesheet belongs to this module, not to the app entry: App code-splits
// MapView, and importing the CSS from main.tsx would keep shipping it (and the render-
// blocking <link> for it) to a home screen that never draws a map.
import "leaflet/dist/leaflet.css";
// Maki (CC0, mapbox/maki): the POI icon set drawn on a 15px grid for exactly
// this job — badges on a map. ?raw inlines each file as a string at build time,
// so only the ten icons below ship, not the whole set.
import alcoholShopSvg from "@mapbox/maki/icons/alcohol-shop.svg?raw";
import aquariumSvg from "@mapbox/maki/icons/aquarium.svg?raw";
import artGallerySvg from "@mapbox/maki/icons/art-gallery.svg?raw";
import attractionSvg from "@mapbox/maki/icons/attraction.svg?raw";
import bakerySvg from "@mapbox/maki/icons/bakery.svg?raw";
import bankSvg from "@mapbox/maki/icons/bank.svg?raw";
import barSvg from "@mapbox/maki/icons/bar.svg?raw";
import beerSvg from "@mapbox/maki/icons/beer.svg?raw";
import bicycleSvg from "@mapbox/maki/icons/bicycle.svg?raw";
import cafeSvg from "@mapbox/maki/icons/cafe.svg?raw";
import cinemaSvg from "@mapbox/maki/icons/cinema.svg?raw";
import clothingStoreSvg from "@mapbox/maki/icons/clothing-store.svg?raw";
import convenienceSvg from "@mapbox/maki/icons/convenience.svg?raw";
import fastFoodSvg from "@mapbox/maki/icons/fast-food.svg?raw";
import fitnessCentreSvg from "@mapbox/maki/icons/fitness-centre.svg?raw";
import gardenSvg from "@mapbox/maki/icons/garden.svg?raw";
import grocerySvg from "@mapbox/maki/icons/grocery.svg?raw";
import hairdresserSvg from "@mapbox/maki/icons/hairdresser.svg?raw";
import iceCreamSvg from "@mapbox/maki/icons/ice-cream.svg?raw";
import librarySvg from "@mapbox/maki/icons/library.svg?raw";
import lodgingSvg from "@mapbox/maki/icons/lodging.svg?raw";
import markerSvg from "@mapbox/maki/icons/marker.svg?raw";
import museumSvg from "@mapbox/maki/icons/museum.svg?raw";
import musicSvg from "@mapbox/maki/icons/music.svg?raw";
import parkSvg from "@mapbox/maki/icons/park.svg?raw";
import pharmacySvg from "@mapbox/maki/icons/pharmacy.svg?raw";
import placeOfWorshipSvg from "@mapbox/maki/icons/place-of-worship.svg?raw";
import playgroundSvg from "@mapbox/maki/icons/playground.svg?raw";
import restaurantSvg from "@mapbox/maki/icons/restaurant.svg?raw";
import shopSvg from "@mapbox/maki/icons/shop.svg?raw";
import stadiumSvg from "@mapbox/maki/icons/stadium.svg?raw";
import swimmingSvg from "@mapbox/maki/icons/swimming.svg?raw";
import theatreSvg from "@mapbox/maki/icons/theatre.svg?raw";
import viewpointSvg from "@mapbox/maki/icons/viewpoint.svg?raw";
import zooSvg from "@mapbox/maki/icons/zoo.svg?raw";
import type { Itinerary, PlanLeg, Stop } from "../api/types";
import { declutterPois, usePois, POI_MIN_ZOOM } from "../hooks/usePois";
import type { Poi, Viewport } from "../hooks/usePois";
import { useRainRadar } from "../hooks/useRainRadar";
import { useWindField } from "../hooks/useWindField";
import { useI18n } from "../lib/i18n";
import { modeColor } from "../lib/modeColors";
import { DURATION_MS, EASE_CSS, prefersReducedMotion } from "../lib/motion";
import { decodePolyline } from "../lib/polyline";
import { Basemap } from "./Basemap";
import { RadarOverlay, RadarReadout } from "./RainRadar";
import type { WeatherLayersState } from "./RainRadar";
import { RADAR_BUTTON_CLEAR } from "./RadarButton";
import { WindVelocityLayer } from "./WeatherLive";

type LatLon = { lat: number; lon: number };

const AMS: [number, number] = [52.3728, 4.8936];
// Position is Amsterdam-flag red (the "you start here" pin); transit stop dots stay
// canal navy; the finish flag is near-black so it reads as ink, not as a mode colour.
const POSITION = "#DA291C";
const STOP = "#0D4A73";
const FLAG = "#0B2147";

// A leg's drawable path: its real geometry when present, else a straight line endpoints.
// Ferries are always drawn dock-to-dock: OTP's shape follows the line's full stop
// pattern (F7 calls at Distelweg between Pontsteiger and NDSM), which on the map reads
// as a broken detour over the water rather than a crossing.
function legCoords(leg: PlanLeg): [number, number][] {
  if (leg.geometry && leg.mode !== "FERRY") return decodePolyline(leg.geometry);
  const pts: [number, number][] = [];
  if (leg.from.lat != null && leg.from.lon != null) pts.push([leg.from.lat, leg.from.lon]);
  if (leg.to.lat != null && leg.to.lon != null) pts.push([leg.to.lat, leg.to.lon]);
  return pts;
}

// Reports the visible bounds+zoom after every pan/zoom so the POI layer knows what
// to fetch. Inert on the test mock, whose map object has no getBounds.
function ViewportTracker({ onChange }: { onChange: (v: Viewport) => void }) {
  const map = useMap();
  const report = () => {
    const m = map as L.Map;
    if (typeof m.getBounds !== "function") return;
    const b = m.getBounds();
    onChange({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
      zoom: m.getZoom(),
    });
  };
  useMapEvents({ moveend: report, zoomend: report });
  useEffect(() => {
    report();
    // Initial snapshot only: afterwards the map events drive updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Single quotes are escaped too: the divIcon HTML below is assembled with double
// quotes today, but an OSM name like Jack's Bar would break out of any attribute a
// future edit puts it in.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const POI_COLOR: Record<Poi["kind"], string> = {
  food: "#ea580c",
  drink: "#7c3aed",
  culture: "#4f46e5",
  nature: "#16a34a",
  shop: "#db2777",
  other: "#d97706",
};

// Maki ships each icon with an XML prolog; innerHTML would parse "<?xml" as a
// bogus comment, so slice from the <svg> root before embedding.
const maki = (svg: string): string => svg.slice(svg.indexOf("<svg"));

const MAKI: Record<string, string> = {
  "alcohol-shop": maki(alcoholShopSvg),
  aquarium: maki(aquariumSvg),
  "art-gallery": maki(artGallerySvg),
  attraction: maki(attractionSvg),
  bakery: maki(bakerySvg),
  bank: maki(bankSvg),
  bar: maki(barSvg),
  beer: maki(beerSvg),
  bicycle: maki(bicycleSvg),
  cafe: maki(cafeSvg),
  cinema: maki(cinemaSvg),
  "clothing-store": maki(clothingStoreSvg),
  convenience: maki(convenienceSvg),
  "fast-food": maki(fastFoodSvg),
  "fitness-centre": maki(fitnessCentreSvg),
  garden: maki(gardenSvg),
  grocery: maki(grocerySvg),
  hairdresser: maki(hairdresserSvg),
  "ice-cream": maki(iceCreamSvg),
  library: maki(librarySvg),
  lodging: maki(lodgingSvg),
  marker: maki(markerSvg),
  museum: maki(museumSvg),
  music: maki(musicSvg),
  park: maki(parkSvg),
  pharmacy: maki(pharmacySvg),
  "place-of-worship": maki(placeOfWorshipSvg),
  playground: maki(playgroundSvg),
  restaurant: maki(restaurantSvg),
  shop: maki(shopSvg),
  stadium: maki(stadiumSvg),
  swimming: maki(swimmingSvg),
  theatre: maki(theatreSvg),
  viewpoint: maki(viewpointSvg),
  zoo: maki(zooSvg),
};

// The raw OSM tag picks the icon, because a cafe cup is not a cocktail glass
// even though both kinds are "drink". Values are Maki icon names — every one
// must have an entry in MAKI above, or the badge renders empty.
const POI_ICON_TAG: Record<string, string> = {
  // amenity
  restaurant: "restaurant",
  fast_food: "fast-food",
  food_court: "restaurant",
  ice_cream: "ice-cream",
  cafe: "cafe",
  bar: "bar",
  pub: "beer",
  biergarten: "beer",
  nightclub: "music",
  theatre: "theatre",
  cinema: "cinema",
  arts_centre: "art-gallery",
  library: "library",
  place_of_worship: "place-of-worship",
  pharmacy: "pharmacy",
  bank: "bank",
  // tourism
  museum: "museum",
  attraction: "attraction",
  gallery: "art-gallery",
  artwork: "art-gallery",
  viewpoint: "viewpoint",
  zoo: "zoo",
  aquarium: "aquarium",
  theme_park: "attraction",
  hotel: "lodging",
  hostel: "lodging",
  guest_house: "lodging",
  // leisure
  park: "park",
  garden: "garden",
  nature_reserve: "park",
  playground: "playground",
  dog_park: "park",
  fitness_centre: "fitness-centre",
  sports_centre: "fitness-centre",
  stadium: "stadium",
  swimming_pool: "swimming",
  // shop
  supermarket: "grocery",
  convenience: "convenience",
  bakery: "bakery",
  alcohol: "alcohol-shop",
  clothes: "clothing-store",
  hairdresser: "hairdresser",
  books: "library",
  bicycle: "bicycle",
};

// Per-kind fallback: POIs persisted before Poi carried the tag, and the long tail
// of OSM values with no dedicated glyph (the query now takes every named
// amenity/tourism/leisure/shop), must degrade to a sensible icon, never blank.
const POI_ICON_KIND: Record<Poi["kind"], string> = {
  food: "restaurant",
  drink: "cafe",
  culture: "museum",
  nature: "park",
  shop: "shop",
  other: "marker",
};

// Exported for tests along with poiMarkerHtml: the react-leaflet mock never
// renders real divIcons, so this pure string seam is the only place the badge
// markup can be asserted.
export function poiIconName(p: Pick<Poi, "kind" | "tag">): string {
  return (p.tag && POI_ICON_TAG[p.tag]) || POI_ICON_KIND[p.kind];
}

// The badge is aria-hidden: the icon is decoration next to the visible name,
// and unlike the old icon-font ligature an svg leaves nothing for find-in-page.
export function poiMarkerHtml(p: Poi): string {
  return (
    `<span class="poi-badge" aria-hidden="true" style="background:${POI_COLOR[p.kind]}">` +
    MAKI[poiIconName(p)] +
    `</span>` +
    `<span class="poi-name">${escapeHtml(p.name)}</span>`
  );
}

// Maps-style labelled POI badges. Names come from OSM, so they are escaped before
// being embedded in the divIcon HTML.
function PoiMarkers({ pois, onPick }: { pois: Poi[]; onPick?: (p: Poi) => void }) {
  return (
    <>
      {pois.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          title={p.name}
          icon={L.divIcon({
            className: "poi-marker",
            html: poiMarkerHtml(p),
            iconSize: [0, 0],
            // Centre of the 16px badge, so the badge — not the label text —
            // sits on the POI's true coordinate.
            iconAnchor: [8, 8],
          })}
          eventHandlers={{ click: () => onPick?.(p) }}
        />
      ))}
    </>
  );
}

// react-leaflet v4 freezes MapContainer options at creation, so a changing
// scrollWheelZoom prop is silently ignored; the handler must be driven imperatively.
// The morph mounts the map non-interactive and flips `interactive` on completion.
function MapInteraction({ interactive }: { interactive: boolean }) {
  const map = useMap();
  useEffect(() => {
    const wheel = (map as L.Map).scrollWheelZoom;
    if (!wheel || typeof wheel.enable !== "function") return;
    if (interactive) wheel.enable();
    else wheel.disable();
  }, [map, interactive]);
  return null;
}

// The map's default view: the whole route when there is one, the single endpoint when
// that is all there is. Two callers apply it, the automatic refit when a plan arrives
// and the reset button, and a view that differs between them would be a view the user
// cannot get back to, so both go through here.
//
// `empty` is where they part company. FitRoute runs on every plan change, so with
// nothing to show it has to leave the camera where the user put it. The button is a
// deliberate tap, and "nothing to show" is exactly when going back to the city is the
// answer being asked for.
//
// Every call is guarded because the react-leaflet mock the unit tests run against
// implements only part of L.Map.
// Recentring glides instead of teleporting: flyTo runs Leaflet's zoom-out/zoom-in
// arc, which keeps the user oriented when the jump is long (panned off to Germany,
// back to Amsterdam). Duration scales with how far the camera actually travels:
// a nudge within the city snaps back in ~0.3s, and anything beyond ~30km already
// earns the full one-second glide.
function flyOpts(map: L.Map, target: [number, number]) {
  let duration = 1;
  if (typeof map.getCenter === "function" && typeof map.distance === "function") {
    const meters = map.distance(map.getCenter(), target);
    duration = Math.min(1, Math.max(0.3, meters / 30_000));
  }
  return { duration };
}

function boundsCenter(coords: [number, number][]): [number, number] {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
}

//
// Under reduced motion the camera does not glide at all: it is put where it is going
// in one step. Asked at the moment of moving, so a change of the setting counts.
//
// `bottomInset` is the part of the map a results sheet covers on a phone, in px, and
// `topInset` the part the floating chrome covers at the top. The fit pads each edge by
// that much more, so the route lands in the part still on screen.
function applyDefaultView(
  map: L.Map,
  coords: [number, number][],
  fallback: LatLon | null,
  empty: "keep" | "city",
  bottomInset = 0,
  topInset = 0,
) {
  const instant = prefersReducedMotion();
  if (coords.length >= 2) {
    const padding = {
      paddingTopLeft: [50, 50 + topInset] as [number, number],
      paddingBottomRight: [50, 50 + bottomInset] as [number, number],
    };
    if (instant && typeof map.fitBounds === "function") {
      map.fitBounds(coords as LatLngBoundsExpression, { ...padding, animate: false });
    } else if (typeof map.flyToBounds === "function") {
      map.flyToBounds(coords as LatLngBoundsExpression, {
        ...padding,
        ...flyOpts(map, boundsCenter(coords)),
      });
    } else if (typeof map.fitBounds === "function") {
      map.fitBounds(coords as LatLngBoundsExpression, padding);
    }
    return;
  }
  const target: [number, number] | null = fallback
    ? [fallback.lat, fallback.lon]
    : empty === "city"
      ? AMS
      : null;
  if (!target) return;
  const zoom = fallback ? 14 : 13;
  if (instant && typeof map.setView === "function") map.setView(target, zoom, { animate: false });
  else if (typeof map.flyTo === "function") map.flyTo(target, zoom, flyOpts(map, target));
  else if (typeof map.setView === "function") map.setView(target, zoom);
}

function FitRoute({
  coords,
  fallback,
  active,
  bottomInset,
  topInset,
}: {
  coords: [number, number][];
  fallback: LatLon | null;
  active: boolean;
  bottomInset: number;
  topInset: number;
}) {
  const map = useMap();
  useEffect(() => {
    // Navigation owns the camera: a refit on every replan would snap it off the fix.
    if (!active) return;
    // The insets are dependencies so a sheet settling at a new height refits once.
    applyDefaultView(map, coords, fallback, "keep", bottomInset, topInset);
  }, [map, coords, fallback, active, bottomInset, topInset]);
  return null;
}

// Leaflet's + and - are built with the map, and react-leaflet freezes the option there.
// MapContainer still gets it, so a map built without them never shows them for a frame,
// and this adds or removes them on the map itself when the answer changes later.
// Re-added, Leaflet appends the control to its corner, under anything already there, so
// it is moved back to the head of the column.
function ZoomButtons({ show }: { show: boolean }) {
  const map = useMap() as L.Map;
  useEffect(() => {
    if (!show) {
      map.zoomControl?.remove();
      return;
    }
    if (!map.zoomControl) {
      if (typeof L.control?.zoom !== "function") return;
      map.zoomControl = L.control.zoom();
    }
    const box = map.zoomControl.getContainer();
    if (box?.parentNode) return;
    map.zoomControl.addTo(map);
    const added = map.zoomControl.getContainer();
    added?.parentNode?.insertBefore(added, added.parentNode.firstChild);
  }, [map, show]);
  return null;
}

// Keeps the camera on the live fix: one hard setView to street zoom on activation,
// then panTo per fix so the user's own zoom tweaks survive while riding. Both glide by
// default and jump under reduced motion.
function FollowCamera({ target, active }: { target: LatLon | null; active: boolean }) {
  const map = useMap();
  const started = useRef(false);
  const lat = target?.lat;
  const lon = target?.lon;
  useEffect(() => {
    if (!active || lat == null || lon == null) {
      started.current = false;
      return;
    }
    const move = prefersReducedMotion() ? { animate: false } : undefined;
    if (!started.current) {
      started.current = true;
      map.setView([lat, lon], 17, move);
      return;
    }
    // Guarded: the test mock's map may not implement panTo.
    if (typeof map.panTo === "function") map.panTo([lat, lon], move);
  }, [map, active, lat, lon]);
  return null;
}

// A new route arrives as if drawn with a pen: each solid line grows from its start to
// its end over `draw`. The dash pattern that does it is put on the SVG path Leaflet
// rendered and taken off again when the line is complete, so the line at rest is
// exactly the one Leaflet drew. pathLength="1" measures the dashes in fractions of the
// line rather than in pixels, which keeps the draw right when the camera's own glide
// changes the zoom (and so the path) halfway through. The gap is twice the line, so no
// second dash can start at its far end and put a round cap there.
//
// A line with a dash pattern of its own (a walk) cannot be drawn this way without
// losing that pattern, so it fades in over `base`; so does every line when the map
// renders to a canvas, where there is no path element to style. Returns the cleanup,
// which puts the line back at rest at once.
export function revealRouteLine(layer: L.Path): () => void {
  const el = layer.getElement();
  if (!(el instanceof SVGElement)) return fadeOnCanvas(layer);
  const draw = !layer.options.dashArray;
  const prop = draw ? "stroke-dashoffset" : "opacity";
  const ms = draw ? DURATION_MS.draw : DURATION_MS.base;
  if (draw) {
    el.setAttribute("pathLength", "1");
    el.style.setProperty("stroke-dasharray", "1 2");
  }
  el.style.setProperty(prop, draw ? "1" : "0");
  // Commit the hidden start before the transition goes on, or the browser has no
  // starting value to transition from and the line simply appears.
  el.getBoundingClientRect();
  el.style.setProperty("transition", `${prop} ${ms}ms ${EASE_CSS.enter}`);
  el.style.setProperty(prop, draw ? "0" : "1");
  const rest = () => {
    el.removeAttribute("pathLength");
    for (const p of ["stroke-dasharray", prop, "transition"]) el.style.removeProperty(p);
  };
  const timer = window.setTimeout(rest, ms);
  return () => {
    window.clearTimeout(timer);
    rest();
  };
}

// The canvas renderer paints every layer into one bitmap, so the fade goes through
// Leaflet's own style, one frame at a time.
function fadeOnCanvas(layer: L.Path): () => void {
  const opacity = layer.options.opacity ?? 1;
  const start = performance.now();
  let frame = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION_MS.base);
    layer.setStyle({ opacity: opacity * t });
    if (t < 1) frame = requestAnimationFrame(step);
  };
  step(start);
  return () => {
    cancelAnimationFrame(frame);
    layer.setStyle({ opacity });
  };
}

// One line of the route (a leg, or the casing under it) that draws itself in whenever
// `drawKey` changes. The key is the whole route's geometry, so a new trip or another
// option draws every line again, and a re-render or a reselection of the option on
// screen draws nothing. Reduced motion: no draw and no fade. The effect runs after
// react-leaflet's own, which have added the layer to the map by then, so the path
// element exists.
function RouteLine({
  positions,
  pathOptions,
  drawKey,
}: {
  positions: LatLngExpression[];
  pathOptions: L.PathOptions;
  drawKey: string;
}) {
  const ref = useRef<L.Polyline | null>(null);
  useEffect(() => {
    const layer = ref.current;
    if (!layer || prefersReducedMotion()) return;
    return revealRouteLine(layer);
  }, [drawKey]);
  return <Polyline ref={ref} positions={positions} pathOptions={pathOptions} />;
}

// Put a control in Leaflet's own corner when Leaflet built one, and leave it in the
// React tree when it did not. The second case is the unit suite: the react-leaflet mock
// renders a plain div, so there is no corner to portal into, and a control that only
// exists inside a real Leaflet map is a control those tests cannot click.
function renderIntoCorner(corner: HTMLElement | null, node: JSX.Element): JSX.Element {
  return corner ? createPortal(node, corner) : node;
}

// The bottom-right column on a map with floating chrome over its top. A full results
// sheet lifts the column by its own height, which would carry it up under the search
// pill; inside this box it is clipped at the chrome's edge instead, the way the column
// was clipped by the map pane's own top before the map ran under the chrome. The box
// takes no touches itself. With nothing over the top of the map there is no box at all.
function clipUnderChrome(topInset: number, node: JSX.Element): JSX.Element {
  if (topInset <= 0) return node;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: topInset }}>
      {node}
    </div>
  );
}

function toLatLon(ll: { lat: number; lng: number }): LatLon {
  return { lat: ll.lat, lon: ll.lng };
}

type MenuState = { lat: number; lon: number; x: number; y: number };

function MapEvents({
  onPick,
  onContextMenu,
}: {
  onPick?: (c: LatLon) => void;
  onContextMenu: (m: MenuState) => void;
}) {
  useMapEvents({
    click: (e) => {
      onPick?.({ lat: e.latlng.lat, lon: e.latlng.lng });
      onContextMenu({ lat: 0, lon: 0, x: -1, y: -1 });
    },
    contextmenu: (e) =>
      onContextMenu({
        lat: e.latlng.lat,
        lon: e.latlng.lng,
        x: e.containerPoint.x,
        y: e.containerPoint.y,
      }),
  });
  return null;
}

// A map marker rendered with a Google Material Symbol glyph. The anchor names the
// point of the glyph that must sit on the coordinate: "tip" for teardrop pins,
// "pole" for the checkered flag (its mast is at the glyph's bottom-left).
type PinAnchor = "tip" | "pole";

function pinIcon(icon: string, color: string, anchor: PinAnchor) {
  const size = 34;
  return L.divIcon({
    className: "fov-pin",
    html:
      `<span class="material-symbols-rounded" style="font-size:${size}px;line-height:1;` +
      `color:${color};font-variation-settings:'FILL' 1,'wght' 600;` +
      `filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">${icon}</span>`,
    iconSize: [size, size],
    iconAnchor: anchor === "tip" ? [size / 2, size] : [size * 0.22, size],
  });
}

function Pin({
  at,
  icon,
  color,
  which,
  anchor,
  onMovePoint,
}: {
  at: LatLon;
  icon: string;
  color: string;
  which: "start" | "end";
  anchor: PinAnchor;
  onMovePoint?: (which: "start" | "end", c: LatLon) => void;
}) {
  return (
    <Marker
      position={[at.lat, at.lon]}
      icon={pinIcon(icon, color, anchor)}
      title={which}
      draggable={!!onMovePoint}
      eventHandlers={{
        dragend: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) =>
          onMovePoint?.(which, toLatLon(e.target.getLatLng())),
      }}
    />
  );
}

export function MapView({
  origin,
  destination,
  stops,
  route,
  onPick,
  picking,
  onMovePoint,
  onContextPick,
  onWhatsHere,
  onPoiPick,
  interactive = true,
  radar = false,
  wLayers = { rain: true, wind: true },
  onLayerToggle,
  dark = false,
  liveFix = null,
  navigating = false,
  bottomInset = 0,
  topInset = 0,
  zoomControl = true,
  radarButton = false,
}: {
  origin: LatLon | null;
  destination: LatLon | null;
  stops: Stop[];
  route: Itinerary | null;
  onPick?: (c: LatLon) => void;
  picking?: boolean;
  onMovePoint?: (which: "start" | "end", c: LatLon) => void;
  onContextPick?: (which: "start" | "end", c: LatLon) => void;
  onWhatsHere?: (c: LatLon) => void;
  onPoiPick?: (p: Poi) => void;
  interactive?: boolean;
  // Mixed mode: live precipitation radar and wind particles layered between basemap
  // and route. State is owned by the app (the toggles live in the filter bar); the
  // map just renders what it is told. No cloud layer: satellite cloud fields resolve
  // ~1 km and only read well at country zoom, useless at the city zoom this map is at.
  radar?: boolean;
  wLayers?: WeatherLayersState;
  onLayerToggle?: (layer: keyof WeatherLayersState) => void;
  dark?: boolean;
  // Turn-by-turn state: the fix to draw as the live dot, and whether navigation owns
  // the camera (follow the fix, suppress route refits).
  liveFix?: { lat: number; lon: number; accuracy: number } | null;
  navigating?: boolean;
  // How much of the map's bottom edge a results sheet covers, in px (the phone's sheet
  // reports it when it settles). The route fit, the reset and the bottom controls keep
  // clear of it.
  bottomInset?: number;
  // How much of the map's top edge floating chrome covers, in px: on a portrait phone
  // the map runs to the top of the screen under the back button, the search pill and
  // the filter chips. The route fit pads by it, and everything this component pins to
  // the top (Leaflet's corners, the radar readout) moves down by it.
  topInset?: number;
  // Leaflet's + and - buttons. Off on a portrait phone, which zooms by pinch; the reset
  // then leaves the zoom column for the bottom-right one.
  zoomControl?: boolean;
  // A phone's radar button (RadarButton, which App floats over this map) holds the
  // top-right corner, 12px under topInset: the readout starts under it instead.
  radarButton?: boolean;
}) {
  const { t } = useI18n();
  const legs = route?.legs ?? [];
  // Decoding happens once per leg per route, not once per leg per render: the two
  // Polyline passes below (casing + coloured line) each need the same path, and during
  // navigation this component re-renders about once a second. A fresh array per render
  // would also re-fire FitRoute's fitBounds (snapping the viewport back mid-pan), so
  // both this and allCoords are tied to route identity.
  const legPaths = useMemo(() => (route?.legs ?? []).map(legCoords), [route]);
  const allCoords = useMemo(() => legPaths.flat(), [legPaths]);
  // The drawn geometry as one value, for RouteLine: it changes when the line on the map
  // would, and not when only the route object does.
  const drawKey = useMemo(() => JSON.stringify(legPaths), [legPaths]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Weather layers pause entirely while the map is not interactive (scrolled back to
  // the home view, mid-morph): the map stays mounted at opacity 0 there, and the
  // particle rAF loop plus the radar frame interval would otherwise burn CPU unseen.
  const showWeather = radar && interactive;
  const rain = useRainRadar(showWeather && wLayers.rain);
  const wind = useWindField(showWeather && wLayers.wind);
  // Maps-style POI labels: fetched for the visible area once the user is zoomed in
  // enough for names to be useful (the hook gates on POI_MIN_ZOOM).
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const { pois, error: poisError, partial: poisPartial } = usePois(interactive ? viewport : null);
  // Zoom-dependent label thinning: the raw fetch can drop 60 names in one dense
  // corner; only the ones that keep their distance get drawn.
  const visiblePois = useMemo(
    () => declutterPois(pois, viewport?.zoom ?? 0),
    [pois, viewport],
  );
  const mapRef = useRef<L.Map | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Clamped position of the context menu, once it can be measured.
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  // Leaflet's own top-left corner, the box holding the + and - buttons. The reset
  // control is rendered into it rather than positioned beside it, so it stacks under
  // the zoom bar on Leaflet's terms: the corner is a column, and the margins and the
  // spacing between the two come from Leaflet's stylesheet instead of from a number
  // written here that a change to either control would quietly break.
  //
  // It is not there in the unit suite, where the react-leaflet mock renders a plain div
  // and Leaflet never runs. The button falls back to the map wrapper in that case, so
  // those tests keep exercising it.
  const [zoomCorner, setZoomCorner] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setZoomCorner(
      zoomControl ? (wrapRef.current?.querySelector<HTMLElement>(".leaflet-top.leaflet-left") ?? null) : null,
    );
  }, [interactive, zoomControl]);

  // The corner sits inside the map container, so a click on the button reaches the map
  // underneath it: it would drop a pin with a pick armed, and a double click would zoom.
  // Leaflet's own controls call this on themselves for the same reason.
  const resetRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = resetRef.current;
    if (!el || typeof L.DomEvent?.disableClickPropagation !== "function") return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, [zoomCorner]);

  const resetView = () => {
    const m = mapRef.current;
    if (m) applyDefaultView(m, allCoords, origin ?? destination, "city", bottomInset, topInset);
  };

  const handleMenu = (m: MenuState) => {
    if (m.x < 0) setMenu(null);
    else setMenu(m);
  };

  // A right-click near the pane's right or bottom edge would hang the menu outside the
  // map (clipped, or off-screen entirely on a phone): measure it and pull it back in.
  // Layout effect, so the correction lands before paint instead of as a visible jump.
  useLayoutEffect(() => {
    setMenuPos(null);
    if (!menu) return;
    const box = wrapRef.current?.getBoundingClientRect();
    const el = menuRef.current?.getBoundingClientRect();
    // No layout to work with (jsdom, or a pane not measured yet): keep the raw point.
    if (!box?.width || !el?.width) return;
    const pad = 8;
    setMenuPos({
      left: Math.max(pad, Math.min(menu.x, box.width - el.width - pad)),
      top: Math.max(pad, Math.min(menu.y, box.height - el.height - pad)),
    });
  }, [menu]);

  // Escape dismisses the menu: the other way out is clicking the map, which also drops
  // a pin when a pick is armed.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    // The picking cursor lives on the wrapper (see .map-picking in index.css):
    // MapContainer's className is frozen at mount, so it cannot carry a toggling class.
    // It is also the positioning context for every absolute chip below, and the box the
    // context menu is clamped against.
    // --fov-map-top is how topInset reaches Leaflet's own corners, which Leaflet builds
    // and React never renders: index.css moves .leaflet-top down by it.
    <div
      ref={wrapRef}
      className={`relative h-full w-full ${picking ? "map-picking" : ""}`}
      style={topInset > 0 ? ({ "--fov-map-top": `${topInset}px` } as React.CSSProperties) : undefined}
    >
      <MapContainer
        ref={mapRef}
        center={AMS}
        zoom={13}
        zoomControl={zoomControl}
        // Leaflet takes its zoom ceiling from the tile layers on the map, and the basemap
        // is no longer one: a GL layer is an L.Layer, not a grid, so getMaxZoom() answers
        // Infinity and the + button never stops. 19 is where the vector tiles stop adding
        // detail (the OpenMapTiles source is z14, overzoomed above that) and the ceiling
        // the raster fallback serves.
        maxZoom={19}
        className="h-full w-full rounded-card"
        scrollWheelZoom={interactive}
        // No tile or data credit is drawn on or beside the map. The sources are named
        // in the About panel in the header menu (aboutText) and in the privacy notice.
        attributionControl={false}
      >
        <MapInteraction interactive={interactive} />
        <ZoomButtons show={zoomControl} />
        <ViewportTracker onChange={setViewport} />
        {/* OpenFreeMap vector tiles: bright by day, the dark style at night. The layer
            is MapLibre GL inside this Leaflet map, so both themes are real styles and
            neither is a filter over the other (components/Basemap). */}
        <Basemap dark={dark} />
        {showWeather && wLayers.rain && <RadarOverlay frames={rain.frames} />}
        {showWeather && wLayers.wind && <WindVelocityLayer data={wind.data} />}
        <MapEvents onPick={onPick} onContextMenu={handleMenu} />
        <FitRoute
          coords={allCoords}
          fallback={origin ?? destination}
          active={!navigating}
          bottomInset={bottomInset}
          topInset={topInset}
        />
        <FollowCamera target={liveFix} active={navigating} />

      {/* White casing under the route for contrast on the light basemap. */}
      {legs.map((_leg, i) => {
        const coords = legPaths[i];
        if (coords.length < 2) return null;
        return (
          <RouteLine
            key={`case-${i}`}
            drawKey={drawKey}
            positions={coords as LatLngExpression[]}
            pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round" }}
          />
        );
      })}

      {/* The route itself: solid lines throughout, one colour per transport mode
          (see lib/modeColors, shared with the step-by-step chips). */}
      {legs.map((leg, i) => {
        const coords = legPaths[i];
        if (coords.length < 2) return null;
        return (
          <RouteLine
            key={`leg-${i}`}
            drawKey={drawKey}
            positions={coords as LatLngExpression[]}
            pathOptions={{
              color: modeColor(leg.mode),
              weight: leg.mode === "WALK" ? 4 : 5,
              lineCap: "round",
            }}
          />
        );
      })}

      {/* Start is the position pin, arrival is the checkered finish flag. */}
      {origin && (
        <Pin
          at={origin}
          icon="location_on"
          color={POSITION}
          which="start"
          anchor="tip"
          onMovePoint={onMovePoint}
        />
      )}
      {destination && (
        <Pin
          at={destination}
          icon="sports_score"
          color={FLAG}
          which="end"
          anchor="pole"
          onMovePoint={onMovePoint}
        />
      )}

      {stops.map((s) => (
        <CircleMarker
          key={s.stop_id}
          center={[s.lat, s.lon]}
          radius={4}
          pathOptions={{ color: STOP, weight: 1, fillColor: "#ffffff", fillOpacity: 1 }}
        >
          <Popup>{s.name}</Popup>
        </CircleMarker>
      ))}

      {viewport != null && viewport.zoom >= POI_MIN_ZOOM && (
        <PoiMarkers pois={visiblePois} onPick={onPoiPick} />
      )}

      {/* Live position: GPS-accuracy halo under a Google-blue dot; rendered last so
          it draws above the route and stop markers. */}
      {liveFix && (
        <>
          <Circle
            center={[liveFix.lat, liveFix.lon]}
            radius={liveFix.accuracy}
            pathOptions={{
              color: "#1A73E8",
              opacity: 0.25,
              fillColor: "#1A73E8",
              fillOpacity: 0.1,
              weight: 1,
            }}
          />
          <CircleMarker
            center={[liveFix.lat, liveFix.lon]}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#1A73E8", fillOpacity: 1 }}
          />
        </>
      )}
      </MapContainer>
      {/* One column for the two chips in the bottom-right corner. They used to be two
          siblings both pinned to bottom-3 right-3, which was fine only because nobody
          had hit the state where both are true: a dead Overpass at city zoom drew the
          error chip straight on top of the zoom-in chip. Stacked, each takes its own
          line. Lifted by the inset, so a results sheet does not cover them. */}
      {interactive &&
        clipUnderChrome(
          topInset,
          <div
            className={`absolute right-3 z-[1000] flex flex-col items-end gap-2 ${topInset > 0 ? "pointer-events-auto" : ""}`.trim()}
            style={{ bottom: 12 + bottomInset }}
          >
            {/* A dead POI feed must say so, or an Overpass outage reads as "no places". The
                amber variant is the half-dead case: part of the view loaded, so the labels
                on screen are real but incomplete, worth a softer warning than
                "unavailable". */}
            {(poisError || poisPartial) && (
              <span
                className={`rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow dark:bg-night-surface/90 ${
                  poisError ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {poisError ? t("placesUnavailable") : t("placesPartial")}
              </span>
            )}
            {/* Discoverability: the POI layer only exists at street zoom — say so, and let
                the chip do the zooming (guarded: the test mock's map has no setZoom). */}
            {viewport != null && viewport.zoom < POI_MIN_ZOOM && (
              <button
                type="button"
                onClick={() => {
                  const m = mapRef.current;
                  if (m && typeof m.setZoom === "function") m.setZoom(POI_MIN_ZOOM);
                }}
                // px-3, not wider: the chip is already ~200px across on a phone and it sits
                // on top of the map pane, so every extra pixel is one more place where a
                // pan gesture starts on a button instead of on the map.
                className="inline-flex min-h-[44px] items-center rounded-full bg-white/90 px-3 text-xs font-medium text-slate-600 shadow transition hover:bg-white dark:bg-night-surface/90 dark:text-night-text dark:hover:bg-night-hover"
              >
                {t("zoomInForPlaces")}
              </button>
            )}
            {/* Without the zoom column the way back to the trip joins this one, at its
                foot, as a round floating button like the rest of the map's chrome on a
                portrait phone. */}
            {!zoomControl && (
              <button
                type="button"
                data-fov="map-reset-view"
                aria-label={t("resetView")}
                title={t("resetView")}
                onClick={resetView}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-transparent bg-white text-slate-800 shadow-md transition hover:bg-slate-50 dark:border-night-rim/30 dark:bg-night-raised dark:text-night-text dark:hover:bg-night-hover"
              >
                <span aria-hidden="true" className="material-symbols-rounded text-[22px] leading-none">
                  near_me
                </span>
              </button>
            )}
          </div>,
        )}
      {/* Panning and zooming a map is easy to do and hard to undo: once the route is off
          screen there is no gesture that brings it back, only a hunt. This is the way
          back, and it is the same view the app picked when the plan arrived. It belongs
          under the + and the -, where it is a third button in the same column rather
          than a stray control in another corner. */}
      {interactive &&
        zoomControl &&
        renderIntoCorner(
          zoomCorner,
          // leaflet-bar leaflet-control, the same pair Leaflet's zoom control carries.
          // leaflet-control is what makes this a control rather than a box drawn over
          // one: the corner has pointer-events none, and the class turns them back on,
          // supplies the corner's margins and puts the button next in the column.
          // leaflet-bar is the border, the radius and the shadow, so this reads as a
          // third button of the control above it instead of something bolted under it,
          // and the two line up because they are the same box rather than because a
          // number here says so. A round pill sat 2px left of the + and the -, which is
          // Leaflet's 2px bar border, and there is no good number to write for that.
          <div
            className={zoomCorner ? "leaflet-bar leaflet-control" : "absolute left-3 z-[1000]"}
            style={zoomCorner ? undefined : { bottom: 12 + bottomInset }}
          >
            <button
              ref={resetRef}
              type="button"
              data-fov="map-reset-view"
              aria-label={t("resetView")}
              title={t("resetView")}
              onClick={resetView}
              // The colours are the ones index.css already gives .leaflet-bar a, written
              // out because those rules select the <a> Leaflet builds and this is a real
              // button. h-11/w-11 is the 44px that same file sets for touch devices.
              className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-white text-slate-800 transition hover:bg-slate-100 dark:bg-night-raised dark:text-night-text dark:hover:bg-night-hover"
            >
              {/* near_me, not zoom_out_map: the four outward arrows read as "make the map
                  bigger", which is a different button. This is the shape Google Maps uses
                  for the same job, so it arrives already learnt. */}
              <span aria-hidden="true" className="material-symbols-rounded text-[22px] leading-none">
                near_me
              </span>
            </button>
          </div>,
        )}
      {showWeather && (
        <RadarReadout
          offset={topInset + (radarButton ? RADAR_BUTTON_CLEAR : 0)}
          layers={wLayers}
          onLayerToggle={onLayerToggle}
          rainError={wLayers.rain && rain.error}
          windError={wLayers.wind && wind.error}
        />
      )}

      {menu && (
        <div
          ref={menuRef}
          className="absolute z-[1000] overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg dark:border-night-rim/20 dark:bg-night-raised"
          style={{ left: menuPos?.left ?? menu.x, top: menuPos?.top ?? menu.y }}
        >
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center px-4 text-left hover:bg-slate-100 dark:hover:bg-night-hover"
            onClick={() => {
              onContextPick?.("start", { lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            {t("directionsFromHere")}
          </button>
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center px-4 text-left hover:bg-slate-100 dark:hover:bg-night-hover"
            onClick={() => {
              onContextPick?.("end", { lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            {t("directionsToHere")}
          </button>
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center border-t border-slate-100 px-4 text-left hover:bg-slate-100 dark:border-night-rim/20 dark:hover:bg-night-hover"
            onClick={() => {
              onWhatsHere?.({ lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            {t("whatsHere")}
          </button>
        </div>
      )}
    </div>
  );
}
