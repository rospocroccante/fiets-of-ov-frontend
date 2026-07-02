import L from "leaflet";
import { Marker } from "react-leaflet";
import type { WeatherPoint } from "../hooks/useWeatherGrid";

// Cyclist-calibrated wind severity: a tailwind you barely notice, a headwind you
// curse, a gust that pushes you off the fietspad.
export function windColor(kmh: number): string {
  if (kmh < 15) return "#64748b";
  if (kmh < 30) return "#d97706";
  return "#dc2626";
}

// Meteorological direction is where the wind comes FROM; the arrow points where it
// blows TO. The "navigation" glyph points north (0 deg) by default.
export function windRotation(windDeg: number): number {
  return (windDeg + 180) % 360;
}

function windIcon(p: WeatherPoint): L.DivIcon {
  return L.divIcon({
    className: "fov-wind",
    html:
      `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">` +
      `<span class="material-symbols-rounded" style="font-size:22px;line-height:1;` +
      `color:${windColor(p.windKmh)};transform:rotate(${windRotation(p.windDeg)}deg);` +
      `font-variation-settings:'FILL' 1;text-shadow:0 0 3px #fff;">navigation</span>` +
      `<span style="font-size:9px;font-weight:700;color:#334155;text-shadow:0 0 2px #fff;">` +
      `${Math.round(p.windKmh)}</span></div>`,
    iconSize: [24, 32],
    iconAnchor: [12, 16],
  });
}

function cloudIcon(p: WeatherPoint): L.DivIcon {
  return L.divIcon({
    className: "fov-cloud",
    html:
      `<span class="material-symbols-rounded" style="font-size:20px;line-height:1;` +
      `color:#64748b;opacity:${(0.25 + 0.75 * (p.cloudPct / 100)).toFixed(2)};` +
      `font-variation-settings:'FILL' 1;text-shadow:0 0 3px #fff;pointer-events:none;">` +
      `cloud</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export function WindArrows({ points }: { points: WeatherPoint[] }) {
  return (
    <>
      {points.map((p) => (
        <Marker
          key={`w-${p.lat}-${p.lon}`}
          position={[p.lat, p.lon]}
          icon={windIcon(p)}
          interactive={false}
        />
      ))}
    </>
  );
}

// Cloud glyphs sit just above their grid point so they read together with the wind
// arrow at the same location instead of on top of it. Nearly clear skies draw nothing.
export function CloudCover({ points }: { points: WeatherPoint[] }) {
  return (
    <>
      {points
        .filter((p) => p.cloudPct >= 20)
        .map((p) => (
          <Marker
            key={`c-${p.lat}-${p.lon}`}
            position={[p.lat + 0.012, p.lon]}
            icon={cloudIcon(p)}
            interactive={false}
          />
        ))}
    </>
  );
}
