import type { RecentTrip } from "../hooks/useRecentTrips";
import type { SavedPlace } from "../hooks/useSavedPlaces";
import { useI18n } from "../lib/i18n";
import type { Translator } from "../lib/i18n";

function timeAgo(at: number, now: number, t: Translator): string {
  const min = Math.max(1, Math.round((now - at) / 60000));
  if (min < 60) return t("minutesAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("hoursAgo", { n: h });
  return t("daysAgo", { n: Math.round(h / 24) });
}

// Maps-style shortcuts on the home: saved places as chips, recent searches as rows.
// Renders nothing until the user has history, so a first visit stays pristine.
export function HomeShortcuts({
  saved,
  recents,
  onPickSaved,
  onPickRecent,
  onClearRecents,
  now = Date.now(),
}: {
  saved: SavedPlace[];
  recents: RecentTrip[];
  onPickSaved: (p: SavedPlace) => void;
  onPickRecent: (t: RecentTrip) => void;
  onClearRecents: () => void;
  now?: number;
}) {
  const { t } = useI18n();
  if (saved.length === 0 && recents.length === 0) return null;
  return (
    <section className="mx-auto mt-8 w-full max-w-4xl px-6 text-left">
      {saved.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {saved.slice(0, 6).map((p) => (
            <button
              key={p.id}
              onClick={() => onPickSaved(p)}
              title={t("directionsToX", { x: p.name })}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white/90 hover:shadow dark:border-white/10 dark:bg-white/10 dark:text-night-text dark:hover:bg-white/15"
            >
              <span
                aria-hidden="true"
                className="material-symbols-rounded text-[16px] leading-none text-amber-500"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {recents.length > 0 && (
        <div className="rounded-card border border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10">
          <div className="flex items-center justify-between px-4 pt-2.5">
            {/* slate-500, not 400: 400 measured 2.56:1 on this frosted card, under
                the 4.5:1 the 11px meta text needs; the dark side takes the night
                ramp's own tertiary step instead of bleeding through. */}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-night-subtle">
              {t("recent")}
            </span>
            <button
              onClick={onClearRecents}
              className="-mr-2 inline-flex min-h-[44px] items-center px-2 text-[11px] font-medium text-slate-500 transition hover:text-slate-700 dark:text-night-subtle dark:hover:text-night-text"
            >
              {t("clear")}
            </button>
          </div>
          <ul>
            {recents.slice(0, 3).map((trip) => (
              <li key={`${trip.fromQuery}-${trip.toQuery}`}>
                <button
                  onClick={() => onPickRecent(trip)}
                  className="flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left transition hover:bg-white/80 dark:hover:bg-white/10"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-rounded text-[18px] leading-none text-slate-400"
                  >
                    history
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-night-text">
                    {trip.fromLabel} <span className="text-slate-400">{"→"}</span> {trip.toLabel}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500 dark:text-night-subtle">{timeAgo(trip.at, now, t)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
