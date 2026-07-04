import { useShortForecast } from "../hooks/useShortForecast";
import { weatherLook } from "../lib/weatherIcons";

function Glyph({ icon, className }: { icon: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-rounded leading-none ${className ?? ""}`}
      style={{ fontVariationSettings: "'FILL' 1" }}
    >
      {icon}
    </span>
  );
}

// Compact now-plus-next-hours weather readout for the results column: the advice
// banner says WHAT to do, this shows the sky it was decided on. Hidden entirely
// while loading or when the feed fails (the advice text still carries the answer).
export function WeatherStrip({ lat, lon }: { lat: number; lon: number }) {
  const { forecast } = useShortForecast(lat, lon);
  if (!forecast) return null;
  const now = weatherLook(forecast.current.code, forecast.current.isDay);
  return (
    <div className="mb-3 flex items-center gap-4 overflow-x-auto rounded-card border border-slate-100 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex shrink-0 items-center gap-2" title={now.label}>
        <Glyph icon={now.icon} className="text-[28px] text-brand" />
        <div>
          <p className="text-lg font-semibold leading-tight">{forecast.current.tempC}&deg;</p>
          <p className="text-[11px] leading-tight text-gray-500">{now.label}</p>
        </div>
      </div>
      <span className="h-8 w-px shrink-0 bg-slate-100" />
      <ol className="flex items-center gap-4">
        {forecast.hours.map((h) => {
          const look = weatherLook(h.code, true);
          return (
            <li key={h.time} className="flex shrink-0 flex-col items-center" title={look.label}>
              <span className="text-[10px] font-medium text-gray-400">{h.time}</span>
              <Glyph icon={look.icon} className="my-0.5 text-[20px] text-brand" />
              <span className="text-[11px] font-semibold text-gray-700">{h.tempC}&deg;</span>
              {h.precipProb >= 20 && (
                <span className="text-[10px] font-medium text-sky-600">{h.precipProb}%</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
