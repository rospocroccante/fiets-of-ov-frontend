import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { Coords, Stop } from "../api/types";

const AMS: [number, number] = [52.3728, 4.8936];

function FitBounds({ origin, destination }: { origin: Coords | null; destination: Coords | null }) {
  const map = useMap();
  useEffect(() => {
    if (origin && destination) {
      const bounds: LatLngBoundsExpression = [
        [origin.lat, origin.lon],
        [destination.lat, destination.lon],
      ];
      map.fitBounds(bounds, { padding: [60, 60] });
    } else if (origin) {
      map.setView([origin.lat, origin.lon], 14);
    }
  }, [map, origin, destination]);
  return null;
}

function Pin({ at, label, color }: { at: Coords; label: string; color: string }) {
  return (
    <CircleMarker
      center={[at.lat, at.lon]}
      radius={12}
      pathOptions={{ color, fillColor: color, fillOpacity: 1 }}
    >
      <Tooltip permanent direction="center" className="!bg-transparent !border-0 !shadow-none">
        <span className="font-bold text-white">{label}</span>
      </Tooltip>
    </CircleMarker>
  );
}

export function MapView({
  origin,
  destination,
  stops,
}: {
  origin: Coords | null;
  destination: Coords | null;
  stops: Stop[];
}) {
  return (
    <MapContainer center={AMS} zoom={13} className="h-full w-full rounded-card" scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds origin={origin} destination={destination} />
      {origin && <Pin at={origin} label="A" color="#13386E" />}
      {destination && <Pin at={destination} label="B" color="#0B2147" />}
      {stops.map((s) => (
        <CircleMarker
          key={s.stop_id}
          center={[s.lat, s.lon]}
          radius={6}
          pathOptions={{ color: "#13386E", fillColor: "#ffffff", fillOpacity: 1 }}
        >
          <Popup>{s.name}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
