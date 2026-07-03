import { useEffect, useState } from "react";
import { TileLayer } from "react-leaflet";
import { RADAR_TILE_OPTIONS } from "../hooks/useRainRadar";
import type { RadarFrame } from "../hooks/useRainRadar";

// Animated precipitation overlay: all frames stay mounted (tiles cache, no flicker),
// only the active one is visible; the loop pauses 3 beats on the newest frame so the
// eye can settle on "now" before the history replays.
export function RadarOverlay({
  frames,
  onFrameChange,
}: {
  frames: RadarFrame[];
  onFrameChange?: (time: number) => void;
}) {
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
    if (frames[active]) onFrameChange?.(frames[active].time);
  }, [frames, active, onFrameChange]);

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

// Map-corner control: a master Radar toggle plus, when active, one chip per weather
// layer and the radar frame clock so the user knows whether they are looking at the
// past sweep or the nowcast.
export function RadarControl({
  active,
  frameTime,
  layers,
  onToggle,
  onLayerToggle,
}: {
  active: boolean;
  frameTime: number | null;
  layers: WeatherLayersState;
  onToggle: () => void;
  onLayerToggle: (layer: keyof WeatherLayersState) => void;
}) {
  const label =
    active && layers.rain && frameTime != null
      ? new Date(frameTime * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;
  return (
    <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {label && (
          <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-brand shadow">
            {label}
          </span>
        )}
        <button
          type="button"
          aria-pressed={active}
          onClick={onToggle}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow transition ${
            active ? "bg-brand text-white" : "bg-white/90 text-brand hover:bg-white"
          }`}
        >
          Radar
        </button>
      </div>
      {active && (
        <div className="flex items-center gap-1">
          {(Object.keys(LAYER_LABEL) as (keyof WeatherLayersState)[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={layers[k]}
              onClick={() => onLayerToggle(k)}
              className={`rounded-full px-2 py-1 text-[10px] font-semibold shadow transition ${
                layers[k] ? "bg-brand/90 text-white" : "bg-white/90 text-gray-500 hover:bg-white"
              }`}
            >
              {LAYER_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {/* Legend: the rain layer only paints where precipitation is, so on a dry day the
          map stays clean — this row is the cue that the radar is live anyway. */}
      {active && layers.rain && (
        <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-gray-600 shadow">
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
