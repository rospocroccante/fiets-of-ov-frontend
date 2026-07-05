import { useEffect, useState } from "react";
import { TileLayer } from "react-leaflet";
import { RADAR_TILE_OPTIONS } from "../hooks/useRainRadar";
import type { RadarFrame } from "../hooks/useRainRadar";
import { publishRadarFrame, useRadarFrame } from "../lib/radarFrame";

// Animated precipitation overlay: all frames stay mounted (tiles cache, no flicker),
// only the active one is visible; the loop pauses 3 beats on the newest frame so the
// eye can settle on "now" before the history replays. The active frame's time is
// published to an external store so the on-map clock can show it without this 700ms
// tick re-rendering the map.
export function RadarOverlay({ frames }: { frames: RadarFrame[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (frames.length < 2) return;
    let i = 0;
    let hold = 0;
    const id = setInterval(() => {
      if (i === frames.length - 1 && hold < 3) {
        hold += 1;
        return;
      }
      hold = 0;
      i = (i + 1) % frames.length;
      setIndex(i);
    }, 700);
    return () => clearInterval(id);
  }, [frames]);

  const active = Math.min(index, Math.max(frames.length - 1, 0));
  useEffect(() => {
    if (frames[active]) publishRadarFrame(frames[active].time);
  }, [frames, active]);

  return (
    <>
      {frames.map((f, i) => (
        <TileLayer
          key={f.time}
          url={f.url}
          className="rain-radar-tiles"
          opacity={i === active ? 0.65 : 0}
          zIndex={5}
          {...RADAR_TILE_OPTIONS}
        />
      ))}
    </>
  );
}

export interface WeatherLayersState {
  rain: boolean;
  wind: boolean;
}

const LAYER_LABEL: Record<keyof WeatherLayersState, string> = {
  rain: "Rain",
  wind: "Wind",
};

// On-map readout and controls for the weather layers: the Rain/Wind layer picker
// (on the map, like Maps' layers control, so toggling never reflows the filter bar),
// the rain frame clock (so the user knows whether they are looking at the past sweep
// or the nowcast), the intensity legend, and explicit unavailability chips. The rain
// layer only paints where precipitation is, so on a dry day the map stays clean — the
// legend is the cue that the radar is live; and a failed feed must say so, or an
// outage reads as "dry". Subscribes to the frame store so the 700ms clock update is
// isolated to this chip.
export function RadarReadout({
  layers,
  onLayerToggle,
  rainError,
  windError,
}: {
  layers: WeatherLayersState;
  onLayerToggle?: (layer: keyof WeatherLayersState) => void;
  rainError: boolean;
  windError: boolean;
}) {
  const frameTime = useRadarFrame();
  const rainLive = layers.rain && !rainError;
  const label =
    rainLive && frameTime != null
      ? new Date(frameTime * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;
  return (
    <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-1.5">
      {onLayerToggle && (
        <div className="flex items-center gap-1 rounded-full bg-white/90 p-1 shadow dark:bg-slate-800/90">
          {(Object.keys(LAYER_LABEL) as (keyof WeatherLayersState)[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={layers[k]}
              onClick={() => onLayerToggle(k)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                layers[k]
                  ? "bg-brand text-white dark:bg-emerald-600"
                  : "text-gray-500 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              {LAYER_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {label && (
        <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-brand shadow dark:bg-slate-800/90 dark:text-emerald-300">
          {label}
        </span>
      )}
      {rainError && (
        <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-red-600 shadow dark:bg-slate-800/90 dark:text-red-400">
          Rain radar unavailable
        </span>
      )}
      {windError && (
        <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-red-600 shadow dark:bg-slate-800/90 dark:text-red-400">
          Wind data unavailable
        </span>
      )}
      {rainLive && (
        <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-gray-600 shadow dark:bg-slate-800/90 dark:text-slate-300">
          <span>light</span>
          <span
            className="h-1.5 w-16 rounded-full"
            style={{
              background: "linear-gradient(90deg, #9be1ff, #2f80ed, #7b2ff7, #e63946)",
            }}
          />
          <span>heavy</span>
        </span>
      )}
    </div>
  );
}
