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

// One recent trip as a short grey metro line (see the comment in HomeShortcuts). Shared
// with the Saved tab, so a recent trip looks the same wherever it is listed.
export function RecentTripRow({ trip, now, onPick }: { trip: RecentTrip; now: number; onPick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onPick}
      className="flex min-h-[44px] w-full flex-col justify-center rounded-card px-1 py-2 text-left transition-colors hover:bg-slate-900/5 dark:hover:bg-night-hover/60"
    >
      {/* The line: a 2px track between two 10px stations, all in the
          tertiary grey, the track a step fainter than its stations.
          Centred stations hang 5px past each end of the track, which is
          why it is inset by that much. */}
      <span aria-hidden="true" className="relative mx-[5px] block h-2.5">
        <span className="absolute inset-x-0 top-1 h-0.5 rounded-full bg-slate-500/60 dark:bg-night-subtle/60" />
        <span className="absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full border-2 border-slate-500 bg-white dark:border-night-subtle dark:bg-night-bg" />
        <span className="absolute -right-[5px] top-0 h-2.5 w-2.5 rounded-full border-2 border-slate-500 bg-white dark:border-night-subtle dark:bg-night-bg" />
      </span>
      <span className="mt-1 grid w-full grid-cols-2 gap-3 text-[13px] font-medium text-slate-800 dark:text-night-muted">
        <span className="truncate">{trip.fromLabel}</span>
        <span className="flex min-w-0 items-baseline justify-end gap-1.5">
          <span className="truncate">{trip.toLabel}</span>
          <span className="shrink-0 text-xs font-normal text-slate-800 dark:text-night-subtle">
            {timeAgo(trip.at, now, t)}
          </span>
        </span>
      </span>
    </button>
  );
}

// Maps-style shortcuts on the home: saved places as chips, recent searches as rows.
// Renders nothing until the user has history, so a first visit stays pristine.
//
// Drawn in the popular trips' own language, one size down. A recent trip is a short
// grey line between two stations with its two ends named under it: the same metro map,
// greyed like a line already travelled. No panel round it: the frosted card with an
// uppercase "RECENT" label held one row most of the time and was a box drawn for the
// sake of a box.
export function HomeShortcuts({
  saved,
  recents,
  onPickSaved,
  onPickRecent,
  onClearRecents,
  onSeeAll,
  now = Date.now(),
}: {
  saved: SavedPlace[];
  recents: RecentTrip[];
  onPickSaved: (p: SavedPlace) => void;
  onPickRecent: (t: RecentTrip) => void;
  onClearRecents: () => void;
  onSeeAll?: () => void;
  now?: number;
}) {
  const { t } = useI18n();
  if (saved.length === 0 && recents.length === 0) return null;
  return (
    <section className="mx-auto mt-6 w-full max-w-4xl px-6 text-left">
      {saved.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {saved.slice(0, 6).map((p) => (
            // Chips are controls, so they keep the pill, with a solid fill: a white
            // chip with a hairline by day and the night's own surface step after dark,
            // answering a pointer with one flat step of tint and nothing else.
            <button
              key={p.id}
              onClick={() => onPickSaved(p)}
              title={t("directionsToX", { x: p.name })}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-night-rim/20 dark:bg-night-surface dark:text-night-text dark:hover:bg-night-raised"
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
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-slate-900 dark:text-night-text">{t("recent")}</span>
            {/* A text button, with the 44px target it always had. */}
            <button
              onClick={onClearRecents}
              className="-mr-2 inline-flex min-h-[44px] items-center px-2 text-[13px] font-medium text-slate-700 transition-colors hover:text-slate-900 dark:text-night-subtle dark:hover:text-night-text"
            >
              {t("clear")}
            </button>
          </div>
          {/* The popular trips' grid, so a recent line is as long as a popular one.

              The text sits straight on the aurora now, with no frosted panel to lift
              it, and by day the aurora is darker than it looks: sampled with the
              foreground hidden over a full drift cycle, it reaches luminance 0.40
              under these rows on a phone. Against that slate-500 measured 2.0:1,
              slate-600 3.2:1 and slate-700 4.4:1, so the names and the time-ago take
              slate-800 (6.2:1) and Clear, which sits over a lighter band, slate-700
              (5.4:1). Size and weight keep them a step below the popular trips. At
              night the ramp's muted and subtle steps clear 5.1:1 or better on the
              brightest lamp glow, so the night side keeps them. */}
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {recents.slice(0, 3).map((trip) => (
              <li key={`${trip.fromQuery}-${trip.toQuery}`}>
                <RecentTripRow trip={trip} now={now} onPick={() => onPickRecent(trip)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {onSeeAll && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSeeAll}
            className="-mr-2 inline-flex min-h-[44px] items-center px-2 text-[13px] font-semibold text-brand transition-colors hover:text-brand-dark dark:text-night-accent dark:hover:text-night-accent-soft"
          >
            {t("seeAll")}
          </button>
        </div>
      )}
    </section>
  );
}
