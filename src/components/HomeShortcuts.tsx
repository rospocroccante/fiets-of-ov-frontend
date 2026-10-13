import { Children } from "react";
import type { ReactNode } from "react";
import type { RecentTrip } from "../hooks/useRecentTrips";
import type { SavedPlace } from "../hooks/useSavedPlaces";
import { useI18n } from "../lib/i18n";
import type { Translator } from "../lib/i18n";
import { ChevronRight, RowGlyph } from "./icons/RowIcons";

function timeAgo(at: number, now: number, t: Translator): string {
  const min = Math.max(1, Math.round((now - at) / 60000));
  if (min < 60) return t("minutesAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("hoursAgo", { n: h });
  return t("daysAgo", { n: Math.round(h / 24) });
}

// A row's hairline, drawn by its list item: 1px, from the text's left edge (56px, past
// the circle and its gap) to the right end, and none under the last item. TripList puts
// it on every row; the Saved tab's place rows, which are rows of their own, use it too.
export const ROW_DIVIDER =
  "relative after:pointer-events-none after:absolute after:bottom-0 after:left-14 after:right-0 after:h-px after:bg-slate-200 dark:after:bg-night-border last:after:hidden";

// The neutral circle a row leads with: 40px, slate-100 by day and night.raised at night.
export const ROW_GLYPH_CIRCLE =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-night-raised";

// One trip as a suggestion row, the way a maps app lists suggestions: a neutral glyph in
// a neutral 40px circle, the destination over "from {origin}", an optional time-ago and
// a chevron. The popular trips (App) and the recent ones (here and on the Saved tab) are
// all this row, in one colour. No card and no shadow; TripList draws the hairlines.
//
// The text sits straight on the aurora, and by day the aurora is darker than it looks.
// Sampled at 390x844 with the foreground hidden, every 0.5s over 64s of drift, the
// darkest pixel under the rows' text column anywhere in the home's scroller is luminance
// 0.382. Against that slate-600 measures 3.12:1 and slate-700 4.26:1, so the origin and
// the time-ago take slate-800 (6.02:1); size and weight keep them a step below the
// destination (slate-900, 7.35:1). The chevron is not text but should still be seen: in
// slate-400 it fell to 1.06:1, slate-600 holds 3.57:1 under its column. At night the
// brightest pixel under the text is luminance 0.055, where night.muted measures 6.12:1,
// and under the chevron 0.040, where night.faint measures 3.49:1.
//
// The accessible name is the trip, "{from} → {to}", as it was before the rows were
// redrawn. A recent trip adds its time-ago, as its name always had: the same trip can be
// both popular and recent, and the two buttons should not answer to one name.
export function TripRow({
  to,
  from,
  glyph,
  label,
  meta,
  fov,
  onClick,
}: {
  to: string;
  from: string;
  glyph: "place" | "recent";
  label: string;
  meta?: string;
  fov?: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-fov={fov}
      onClick={onClick}
      aria-label={label}
      className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center gap-4 rounded-card px-2 py-3 text-left transition-colors hover:bg-slate-900/5 dark:hover:bg-night-hover/60"
    >
      <span
        aria-hidden="true"
        data-fov="row-glyph"
        className={`${ROW_GLYPH_CIRCLE} text-slate-600 dark:text-night-muted`}
      >
        <RowGlyph kind={glyph} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-5 text-slate-900 dark:text-night-text">{to}</span>
        <span className="block truncate text-[13px] leading-[18px] text-slate-800 dark:text-night-muted">
          {t("fromX", { x: from })}
        </span>
      </span>
      {meta && (
        <span className="shrink-0 text-[13px] text-slate-800 dark:text-night-muted">
          {meta}
        </span>
      )}
      <ChevronRight fov="row-chevron" className="-ml-1 h-5 w-5 shrink-0 text-slate-600 dark:text-night-faint" />
    </button>
  );
}

// The rows' list. A hairline under each row, inset to the text, and none under the last
// row of a column. Two columns fill row by row, so each column ends on one of the last
// two items whatever their number: with an odd number the first column ends on the last
// item and the second on the one before it, which is a row higher.
export function TripList({ columns = false, children }: { columns?: boolean; children: ReactNode }) {
  return (
    <ul className={`grid grid-cols-1 ${columns ? "gap-x-8 sm:grid-cols-2" : ""}`}>
      {Children.map(children, (row) => (
        <li className={columns ? `${ROW_DIVIDER} sm:[&:nth-last-child(2)]:after:hidden` : ROW_DIVIDER}>{row}</li>
      ))}
    </ul>
  );
}

// One recent trip. Shared with the Saved tab, so a recent trip looks the same wherever
// it is listed.
export function RecentTripRow({ trip, now, onPick }: { trip: RecentTrip; now: number; onPick: () => void }) {
  const { t } = useI18n();
  const ago = timeAgo(trip.at, now, t);
  return (
    <TripRow
      glyph="recent"
      to={trip.toLabel}
      from={trip.fromLabel}
      label={`${trip.fromLabel} → ${trip.toLabel}, ${ago}`}
      meta={ago}
      onClick={onPick}
    />
  );
}

// Maps-style shortcuts on the home: saved places as chips, recent searches as rows.
// Renders nothing until the user has history, so a first visit stays pristine.
//
// A recent trip is the popular trips' row with a clock in its circle. No panel round
// the list: the frosted card with an uppercase "RECENT" label held one row most of the
// time and was a box drawn for the sake of a box.
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
          {/* The popular trips' list, so a recent row lines up with a popular one. */}
          <TripList columns>
            {recents.slice(0, 3).map((trip) => (
              <RecentTripRow
                key={`${trip.fromQuery}-${trip.toQuery}`}
                trip={trip}
                now={now}
                onPick={() => onPickRecent(trip)}
              />
            ))}
          </TripList>
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
