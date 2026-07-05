import { modeColor } from "../lib/modeColors";
import type { OptionView } from "../lib/planView";

// The advice option maps to a transport mode for its accent dot.
const OPTION_MODE: Record<OptionView["mode"], string> = {
  bike: "BICYCLE",
  transit: "SUBWAY",
  bike_and_ride: "FERRY",
};

// Compact mode toggle: the itinerary below is the star of the results panel, these
// only switch which one it shows. One line of identity (dot + name), one line of
// the number that matters (minutes), and a small Best tag on the recommendation.
export function AdviceCard({
  option,
  selected,
  onSelect,
}: {
  option: OptionView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-w-[7.5rem] flex-1 basis-0 rounded-card border p-3 text-left transition ${
        selected
          ? "border-brand bg-brand text-white shadow-md"
          : "border-gray-200 bg-white text-slate-600 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: modeColor(OPTION_MODE[option.mode]) }}
        />
        <h3 className="truncate text-[13px] font-semibold">{option.title}</h3>
      </span>
      <span className="mt-1 flex items-baseline justify-between gap-2">
        <span className={`text-lg font-bold ${selected ? "text-white" : "text-slate-900"}`}>
          {option.minutes} min
        </span>
        {option.recommended && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              selected ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            Best
          </span>
        )}
      </span>
    </button>
  );
}
