import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { Itinerary, PlanLeg, Stop } from "../api/types";
import { usePois, POI_MIN_ZOOM } from "../hooks/usePois";
import type { Poi, Viewport } from "../hooks/usePois";
import { useRainRadar } from "../hooks/useRainRadar";
import { useWindField } from "../hooks/useWindField";
import { modeColor } from "../lib/modeColors";
import { decodePolyline } from "../lib/polyline";
import { RadarOverlay, RadarReadout } from "./RainRadar";
import type { WeatherLayersState } from "./RainRadar";
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const POI_COLOR: Record<Poi["kind"], string> = {
  food: "#ea580c",
  drink: "#7c3aed",
  culture: "#4f46e5",
  other: "#d97706",
};

// Maps-style labelled POI dots. Names come from OSM, so they are escaped before
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
            html:
              `<span class="poi-dot" style="background:${POI_COLOR[p.kind]}"></span>` +
              `<span class="poi-name">${escapeHtml(p.name)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [4, 4],
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

function FitRoute({
  coords,
  fallback,
  active,
}: {
  coords: [number, number][];
  fallback: LatLon | null;
  active: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    // Navigation owns the camera: a refit on every replan would snap it off the fix.
    if (!active) return;
    if (coords.length >= 2) {
      map.fitBounds(coords as LatLngBoundsExpression, { padding: [50, 50] });
    } else if (fallback) {
      map.setView([fallback.lat, fallback.lon], 14);
    }
  }, [map, coords, fallback, active]);
  return null;
}

// Keeps the camera on the live fix: one hard setView to street zoom on activation,
// then panTo per fix so the user's own zoom tweaks survive while riding.
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
    if (!started.current) {
      started.current = true;
      map.setView([lat, lon], 17);
      return;
    }
    // Guarded: the test mock's map may not implement panTo.
    if (typeof map.panTo === "function") map.panTo([lat, lon]);
  }, [map, active, lat, lon]);
  return null;
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
}) {
  const legs = route?.legs ?? [];
  // Fresh array per render would re-fire FitRoute's fitBounds on every render (snapping
  // the viewport back mid-pan); tie it to route identity instead.
  const allCoords = useMemo(() => (route?.legs ?? []).flatMap(legCoords), [route]);
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
  const { pois, error: poisError } = usePois(interactive ? viewport : null);
  const mapRef = useRef<L.Map | null>(null);

  const handleMenu = (m: MenuState) => {
    if (m.x < 0) setMenu(null);
    else setMenu(m);
  };

  return (
    // The picking cursor lives on the wrapper (see .map-picking in index.css):
    // MapContainer's className is frozen at mount, so it cannot carry a toggling class.
    <div className={`relative h-full w-full ${picking ? "map-picking" : ""}`}>
      <MapContainer
        ref={mapRef}
        center={AMS}
        zoom={13}
        className="h-full w-full rounded-card"
        scrollWheelZoom={interactive}
        attributionControl={false}
      >
        <MapInteraction interactive={interactive} />
        <ViewportTracker onChange={setViewport} />
        {/* CARTO voyager by day, dark matter for the dark theme. */}
        <TileLayer
          url={`https://{s}.basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "voyager"}/{z}/{x}/{y}{r}.png`}
        />
        {showWeather && wLayers.rain && <RadarOverlay frames={rain.frames} />}
        {showWeather && wLayers.wind && <WindVelocityLayer data={wind.data} />}
        <MapEvents onPick={onPick} onContextMenu={handleMenu} />
        <FitRoute coords={allCoords} fallback={origin ?? destination} active={!navigating} />
        <FollowCamera target={liveFix} active={navigating} />

      {/* White casing under the route for contrast on the light basemap. */}
      {legs.map((leg, i) => {
        const coords = legCoords(leg);
        if (coords.length < 2) return null;
        return (
          <Polyline
            key={`case-${i}`}
            positions={coords as LatLngExpression[]}
            pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round" }}
          />
        );
      })}

      {/* The route itself: solid lines throughout, one colour per transport mode
          (see lib/modeColors, shared with the step-by-step chips). */}
      {legs.map((leg, i) => {
        const coords = legCoords(leg);
        if (coords.length < 2) return null;
        return (
          <Polyline
            key={`leg-${i}`}
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
        <PoiMarkers pois={pois} onPick={onPoiPick} />
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
      {/* Discoverability: the POI layer only exists at street zoom — say so, and let
          the chip do the zooming (guarded: the test mock's map has no setZoom). */}
      {interactive && viewport != null && viewport.zoom < POI_MIN_ZOOM && (
        <button
          type="button"
          onClick={() => {
            const m = mapRef.current;
            if (m && typeof m.setZoom === "function") m.setZoom(POI_MIN_ZOOM);
          }}
          className="absolute bottom-3 right-3 z-[1000] rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow transition hover:bg-white dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Zoom in to see bars and places
        </button>
      )}
      {/* A dead POI feed must say so, or an Overpass outage reads as "no places". */}
      {interactive && poisError && (
        <span className="absolute bottom-3 right-3 z-[1000] rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-red-600 shadow dark:bg-slate-800/90">
          Places unavailable right now
        </span>
      )}
      {showWeather && (
        <RadarReadout
          layers={wLayers}
          onLayerToggle={onLayerToggle}
          rainError={wLayers.rain && rain.error}
          windError={wLayers.wind && wind.error}
        />
      )}

      {menu && (
        <div
          className="absolute z-[1000] overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg dark:border-white/10 dark:bg-[#2A2F34]"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            className="block w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={() => {
              onContextPick?.("start", { lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            Directions from here
          </button>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={() => {
              onContextPick?.("end", { lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            Directions to here
          </button>
          <button
            type="button"
            className="block w-full border-t border-slate-100 px-4 py-2 text-left hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/10"
            onClick={() => {
              onWhatsHere?.({ lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            What&apos;s here?
          </button>
        </div>
      )}
    </div>
  );
}
