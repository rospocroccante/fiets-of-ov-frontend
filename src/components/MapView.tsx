import { useEffect, useMemo, useState } from "react";
import {
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
import { useRainRadar } from "../hooks/useRainRadar";
import { useWindField } from "../hooks/useWindField";
import { modeColor } from "../lib/modeColors";
import { decodePolyline } from "../lib/polyline";
import { RadarOverlay, RadarReadout } from "./RainRadar";
import type { WeatherLayersState } from "./RainRadar";
import { WindVelocityLayer } from "./WeatherLive";

type LatLon = { lat: number; lon: number };

const AMS: [number, number] = [52.3728, 4.8936];
const BRAND = "#13386E";
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

function FitRoute({ coords, fallback }: { coords: [number, number][]; fallback: LatLon | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length >= 2) {
      map.fitBounds(coords as LatLngBoundsExpression, { padding: [50, 50] });
    } else if (fallback) {
      map.setView([fallback.lat, fallback.lon], 14);
    }
  }, [map, coords, fallback]);
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
  interactive = true,
  radar = false,
  wLayers = { rain: true, wind: true },
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
  interactive?: boolean;
  // Mixed mode: live precipitation radar and wind particles layered between basemap
  // and route. State is owned by the app (the toggles live in the filter bar); the
  // map just renders what it is told. No cloud layer: satellite cloud fields resolve
  // ~1 km and only read well at country zoom, useless at the city zoom this map is at.
  radar?: boolean;
  wLayers?: WeatherLayersState;
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

  const handleMenu = (m: MenuState) => {
    if (m.x < 0) setMenu(null);
    else setMenu(m);
  };

  return (
    // The picking cursor lives on the wrapper (see .map-picking in index.css):
    // MapContainer's className is frozen at mount, so it cannot carry a toggling class.
    <div className={`relative h-full w-full ${picking ? "map-picking" : ""}`}>
      <MapContainer
        center={AMS}
        zoom={13}
        className="h-full w-full rounded-card"
        scrollWheelZoom={interactive}
        attributionControl={false}
      >
        <MapInteraction interactive={interactive} />
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        {showWeather && wLayers.rain && <RadarOverlay frames={rain.frames} />}
        {showWeather && wLayers.wind && <WindVelocityLayer data={wind.data} />}
        <MapEvents onPick={onPick} onContextMenu={handleMenu} />
        <FitRoute coords={allCoords} fallback={origin ?? destination} />

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
          color={BRAND}
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
          pathOptions={{ color: BRAND, weight: 1, fillColor: "#ffffff", fillOpacity: 1 }}
        >
          <Popup>{s.name}</Popup>
        </CircleMarker>
      ))}
      </MapContainer>
      {showWeather && (
        <RadarReadout
          showRain={wLayers.rain}
          rainError={wLayers.rain && rain.error}
          windError={wLayers.wind && wind.error}
        />
      )}

      {menu && (
        <div
          className="absolute z-[1000] overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            className="block w-full px-4 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              onContextPick?.("start", { lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            Directions from here
          </button>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              onContextPick?.("end", { lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            Directions to here
          </button>
          <button
            type="button"
            className="block w-full border-t border-slate-100 px-4 py-2 text-left hover:bg-slate-100"
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
