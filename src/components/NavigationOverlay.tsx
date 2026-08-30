import { useI18n } from "../lib/i18n";
import type { NavManeuver } from "../lib/routeProgress";

// Maneuver banner shown over the map while navigating: next-turn glyph + distance,
// street line, exit button, and a slim remaining-distance/ETA sub-row.

// OTP relative directions plus the synthetic BOARD/ALIGHT/ARRIVE from routeProgress;
// anything unmapped reads as "keep going" rather than crashing the banner.
const GLYPH: Record<string, string> = {
  LEFT: "turn_left",
  HARD_LEFT: "turn_left",
  RIGHT: "turn_right",
  HARD_RIGHT: "turn_right",
  SLIGHTLY_LEFT: "turn_slight_left",
  SLIGHTLY_RIGHT: "turn_slight_right",
  UTURN_LEFT: "u_turn_left",
  UTURN_RIGHT: "u_turn_right",
  CIRCLE_CLOCKWISE: "roundabout_right",
  CIRCLE_COUNTERCLOCKWISE: "roundabout_left",
  CONTINUE: "straight",
  BOARD: "tram",
  ALIGHT: "tram",
  ARRIVE: "sports_score",
};

// GPS noise makes meter-exact distances jitter: round to 10 m below 1 km, one
// decimal km above.
function formatM(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function NavigationOverlay({
  next,
  toNext,
  remaining,
  etaMinutes,
  onExit,
}: {
  next: NavManeuver | null;
  toNext: number; // meters to the next maneuver
  remaining: number; // meters to the destination
  etaMinutes: number;
  onExit: () => void;
}) {
  const { t } = useI18n();
  // next === null only past the final ARRIVE maneuver: the trip is done.
  const arrived = next === null;
  const glyph = arrived ? "sports_score" : (GLYPH[next.direction] ?? "straight");
  return (
    <div className="absolute left-3 right-3 top-3 z-[1000] rounded-card border border-slate-100 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-night-raised/95">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="material-symbols-rounded shrink-0 text-[36px] leading-none text-brand dark:text-night-accent"
        >
          {glyph}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-tight text-slate-900 dark:text-night-text">
            {arrived ? t("youHaveArrived") : formatM(toNext)}
          </p>
          {!arrived && next.street && (
            <p className="truncate text-sm text-slate-500 dark:text-night-subtle">{next.street}</p>
          )}
        </div>
        <button
          type="button"
          aria-label={t("exitNavigation")}
          onClick={onExit}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-night-hover"
        >
          <span aria-hidden="true" className="material-symbols-rounded text-[20px] leading-none">
            close
          </span>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-white/10 dark:text-night-subtle">
        <span>{formatM(remaining)}</span>
        <span aria-hidden="true">·</span>
        <span>~{etaMinutes} min</span>
      </div>
    </div>
  );
}
