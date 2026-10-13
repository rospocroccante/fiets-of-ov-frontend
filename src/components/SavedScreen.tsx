import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RecentTrip } from "../hooks/useRecentTrips";
import type { SavedPlace } from "../hooks/useSavedPlaces";
import { useConfirmTap } from "../hooks/useConfirmTap";
import { useI18n } from "../lib/i18n";
import { RecentTripRow, ROW_DIVIDER, ROW_GLYPH_CIRCLE, TripList } from "./HomeShortcuts";
import { Snackbar } from "./Snackbar";

// Swiping a row left this far reveals its Delete button.
const SWIPE_OPEN = -88;

export interface SavedScreenProps {
  places: SavedPlace[];
  recents: RecentTrip[];
  onPickPlace: (p: SavedPlace) => void;
  onPickRecent: (t: RecentTrip) => void;
  onDeletePlace: (p: SavedPlace) => void;
  onRestorePlace: (p: SavedPlace) => void;
  onClearRecents: () => void;
  onSearch: () => void;
  now?: number;
}

// The Saved tab: every saved place and every recent trip, where the home only has room
// for six chips and three rows. A place row swipes left to reveal Delete; Edit shows a
// delete button on every row for anyone not using gestures. A delete is undoable for
// five seconds.
export function SavedScreen({
  places,
  recents,
  onPickPlace,
  onPickRecent,
  onDeletePlace,
  onRestorePlace,
  onClearRecents,
  onSearch,
  now = Date.now(),
}: SavedScreenProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState<SavedPlace | null>(null);
  const clear = useConfirmTap(onClearRecents);
  const remove = (p: SavedPlace) => {
    onDeletePlace(p);
    setRemoved(p);
  };
  const empty = places.length === 0 && recents.length === 0;
  const textButton =
    "-mr-2 inline-flex min-h-[44px] items-center px-2 text-[15px] font-semibold text-brand transition-colors hover:text-brand-dark dark:text-night-accent dark:hover:text-night-accent-soft";

  return (
    <div className="px-5 pb-6 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex min-h-[44px] items-center justify-between">
        <h1 className="text-[28px] font-bold leading-tight text-slate-900 dark:text-night-text">{t("tabSaved")}</h1>
        {places.length > 0 && (
          <button type="button" aria-pressed={editing} onClick={() => setEditing((e) => !e)} className={textButton}>
            {editing ? t("done") : t("edit")}
          </button>
        )}
      </div>

      {empty && (
        <div className="mt-10 text-center">
          <p className="text-[15px] text-slate-600 dark:text-night-muted">{t("savedEmpty")}</p>
          <button
            type="button"
            onClick={onSearch}
            className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-brand px-5 text-sm font-semibold text-white dark:bg-night-accent dark:text-night-bg"
          >
            {t("searchForPlace")}
          </button>
        </div>
      )}

      {places.length > 0 && (
        <section aria-labelledby="saved-places-heading" className="mt-4">
          <h2 id="saved-places-heading" className="mb-1 text-[17px] font-semibold text-slate-900 dark:text-night-text">
            {t("savedPlacesHeading")}
          </h2>
          <ul>
            {places.map((p) => (
              <PlaceRow key={p.id} place={p} editing={editing} onPick={() => onPickPlace(p)} onDelete={() => remove(p)} />
            ))}
          </ul>
        </section>
      )}

      {recents.length > 0 && (
        <section aria-labelledby="saved-recent-heading" className="mt-6">
          <div className="flex items-center justify-between">
            <h2 id="saved-recent-heading" className="text-[17px] font-semibold text-slate-900 dark:text-night-text">
              {t("recent")}
            </h2>
            <button type="button" onClick={clear.tap} className={textButton}>
              {clear.armed ? t("tapAgainToClear") : t("clearAll")}
            </button>
          </div>
          <TripList>
            {recents.map((trip) => (
              <RecentTripRow
                key={`${trip.fromQuery}-${trip.toQuery}`}
                trip={trip}
                now={now}
                onPick={() => onPickRecent(trip)}
              />
            ))}
          </TripList>
        </section>
      )}

      <AnimatePresence>
        {removed && (
          <Snackbar
            key={removed.id}
            message={t("deletedX", { x: removed.name })}
            actionLabel={t("undo")}
            onAction={() => {
              onRestorePlace(removed);
              setRemoved(null);
            }}
            onDone={() => setRemoved(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PlaceRow({
  place,
  editing,
  onPick,
  onDelete,
}: {
  place: SavedPlace;
  editing: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // A swipe that ends over the row must not also count as a tap on it.
  const dragged = useRef(false);
  return (
    // The recent rows' hairline and geometry, so the two sections' text starts on one
    // line (TripRow in HomeShortcuts).
    <li className={`${ROW_DIVIDER} overflow-hidden`}>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-red-600 text-sm font-semibold text-white"
      >
        {t("deleteLabel")}
      </button>
      <motion.div
        drag={editing ? false : "x"}
        dragConstraints={{ left: SWIPE_OPEN, right: 0 }}
        dragElastic={0.1}
        dragMomentum={false}
        animate={{ x: open && !editing ? SWIPE_OPEN : 0 }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => setOpen((open ? SWIPE_OPEN : 0) + info.offset.x < SWIPE_OPEN / 2)}
        className="relative flex items-center bg-white dark:bg-night-bg"
      >
        <button
          type="button"
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            if (open) setOpen(false);
            else onPick();
          }}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-4 py-3 text-left"
        >
          <span aria-hidden="true" data-fov="row-glyph" className={ROW_GLYPH_CIRCLE}>
            <span
              className="material-symbols-rounded text-[20px] leading-none text-amber-500"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-5 text-slate-900 dark:text-night-text">{place.name}</span>
            {place.label && place.label !== place.name && (
              <span className="block truncate text-[13px] leading-[18px] text-slate-800 dark:text-night-muted">{place.label}</span>
            )}
          </span>
        </button>
        {editing && (
          <button
            type="button"
            aria-label={t("deleteX", { x: place.name })}
            onClick={onDelete}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-red-600 dark:text-red-400"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12h8" />
            </svg>
          </button>
        )}
      </motion.div>
    </li>
  );
}
