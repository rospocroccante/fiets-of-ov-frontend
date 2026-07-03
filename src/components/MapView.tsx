import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { Itinerary, PlanLeg, Stop } from "../api/types";
import { useRainRadar } from "../hooks/useRainRadar";
import { useWindField } from "../hooks/useWindField";
import { decodePolyline } from "../lib/polyline";
import { RadarControl, RadarOverlay } from "./RainRadar";
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

function MapClicker({ onPick }: { onPick: (c: LatLon) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

function Pin({ at, label, color }: { at: LatLon; label: string; color: string }) {
  return (
    <CircleMarker
      center={[at.lat, at.lon]}
      radius={11}
      pathOptions={{ color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 1 }}
    >
      <Tooltip permanent direction="center" className="!m-0 !border-0 !bg-transparent !p-0 !shadow-none">
        <span className="text-xs font-bold text-white">{label}</span>
      </Tooltip>
    </CircleMarker>
  );
}

export function MapView({
  origin,
  destination,
  stops,
  route,
  onPick,
  picking,
}: {
  origin: LatLon | null;
  destination: LatLon | null;
  stops: Stop[];
  route: Itinerary | null;
  onPick?: (c: LatLon) => void;
  picking?: boolean;
}) {
  const legs = route?.legs ?? [];
  const allCoords = legs.flatMap(legCoords);
  // Mixed mode: live precipitation radar and wind particles layered between
  // basemap and route. No cloud layer: satellite cloud fields resolve ~1 km and
  // only read well at country zoom, useless at the city zoom this map lives at.
  const [radar, setRadar] = useState(false);
  const [wLayers, setWLayers] = useState<WeatherLayersState>({
    rain: true,
    wind: true,
  });
  const [radarFrameTime, setRadarFrameTime] = useState<number | null>(null);
  const radarFrames = useRainRadar(radar && wLayers.rain);
  const windField = useWindField(radar && wLayers.wind);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={AMS}
        zoom={13}
        className={`h-full w-full rounded-card ${picking ? "cursor-crosshair" : ""}`}
        scrollWheelZoom
      >
      <TileLayer
        attribution="&copy; OpenStreetMap, &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {radar && wLayers.rain && (
        <RadarOverlay frames={radarFrames} onFrameChange={setRadarFrameTime} />
      )}
      {radar && wLayers.wind && <WindVelocityLayer data={windField} />}
      {onPick && <MapClicker onPick={onPick} />}
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

      {origin && <Pin at={origin} label="A" color={BRAND} />}
      {destination && <Pin at={destination} label="B" color="#0B2147" />}

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
      <RadarControl
        active={radar}
        frameTime={radarFrameTime}
        layers={wLayers}
        onToggle={() => setRadar((r) => !r)}
        onLayerToggle={(k) => setWLayers((s) => ({ ...s, [k]: !s[k] }))}
      />
    </div>
  );
}
