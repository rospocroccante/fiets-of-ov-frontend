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
import { decodePolyline } from "../lib/polyline";
import { RadarOverlay, RadarReadout } from "./RainRadar";
import type { WeatherLayersState } from "./RainRadar";
import { WindVelocityLayer } from "./WeatherLive";

type LatLon = { lat: number; lon: number };

const AMS: [number, number] = [52.3728, 4.8936];
const BRAND = "#13386E";
const BIKE = "#16a34a";
const WALK = "#94a3b8";

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

// A map marker rendered with a Google Material Symbol glyph. `anchorBottom` puts the
// anchor at the glyph's tip (teardrop pins); otherwise it is centered (ring markers).
function pinIcon(icon: string, color: string, anchorBottom: boolean) {
  const size = 34;
  return L.divIcon({
    className: "fov-pin",
    html:
      `<span class="material-symbols-rounded" style="font-size:${size}px;line-height:1;` +
      `color:${color};font-variation-settings:'FILL' 1,'wght' 600;` +
      `filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">${icon}</span>`,
    iconSize: [size, size],
    iconAnchor: anchorBottom ? [size / 2, size] : [size / 2, size / 2],
  });
}

function Pin({
  at,
  icon,
  color,
  which,
  anchorBottom,
  onMovePoint,
}: {
  at: LatLon;
  icon: string;
  color: string;
  which: "start" | "end";
  anchorBottom: boolean;
  onMovePoint?: (which: "start" | "end", c: LatLon) => void;
}) {
  return (
    <Marker
      position={[at.lat, at.lon]}
      icon={pinIcon(icon, color, anchorBottom)}
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
  const radarFrames = useRainRadar(radar && wLayers.rain);
  const windField = useWindField(radar && wLayers.wind);

  const handleMenu = (m: MenuState) => {
    if (m.x < 0) setMenu(null);
    else setMenu(m);
  };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={AMS}
        zoom={13}
        className={`h-full w-full rounded-card ${picking ? "cursor-crosshair" : ""}`}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap, &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {radar && wLayers.rain && <RadarOverlay frames={radarFrames} />}
        {radar && wLayers.wind && <WindVelocityLayer data={windField} />}
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

      {/* The route itself: transit solid brand, bike green dashed, walking grey dotted,
          ferry brand dotted (a crossing over water, not a street being ridden). */}
      {legs.map((leg, i) => {
        const coords = legCoords(leg);
        if (coords.length < 2) return null;
        const walk = leg.mode === "WALK";
        const bike = leg.mode === "BICYCLE";
        const ferry = leg.mode === "FERRY";
        return (
          <Polyline
            key={`leg-${i}`}
            positions={coords as LatLngExpression[]}
            pathOptions={{
              color: walk ? WALK : bike ? BIKE : BRAND,
              weight: walk ? 4 : 5,
              dashArray: walk ? "1 9" : bike ? "8 6" : ferry ? "1 12" : undefined,
              lineCap: "round",
            }}
          />
        );
      })}

      {origin && (
        <Pin
          at={origin}
          icon="trip_origin"
          color={BRAND}
          which="start"
          anchorBottom={false}
          onMovePoint={onMovePoint}
        />
      )}
      {destination && (
        <Pin
          at={destination}
          icon="location_on"
          color="#0B2147"
          which="end"
          anchorBottom
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
      {radar && wLayers.rain && <RadarReadout />}

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
        </div>
      )}
    </div>
  );
}
