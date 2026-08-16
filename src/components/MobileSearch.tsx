import { forwardRef, useEffect, useRef, useState } from "react";
import { EndpointField } from "./EndpointField";
import { UseMyLocationButton } from "./UseMyLocationButton";
import type { HistoryEntry } from "./PlaceInput";
import { CARD_ACCENTS, PRIMARY_GRADIENT } from "../lib/gradients";
import { useI18n } from "../lib/i18n";
import type { Place } from "../api/types";
import type { Endpoint } from "../trip";

// The phone search path.
//
// Below `sm` the morphing pill has about 354px of content to divide between two text
// fields, two locate buttons, a swap and a Search button. What that leaves each field
// is 63px at 390 wide and 48px at 360 — narrower than the word "Amsterdam", so a typed
// query is clipped to its tail and every suggestion wraps over six or seven lines
// inside a 63px listbox. The primary input path of the app did not work on a phone.
//
// So on a phone the pill stops being a form and becomes a target: one full-width
// button that says where you are going, and opens a screen that owns the display. The
// desktop pill is untouched — App decides which of the two the pill renders, on a
// max-width query, and nothing here is mounted above `sm`.

// Nothing in the frozen icon-font subset is a magnifier (see the icon_names list in
// index.css), and a hand-drawn one is two paths. Inlined for the same reason MapView
// inlines its Maki glyphs: no font round trip, no ligature name painted if it is late.
function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-brand dark:text-emerald-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

interface EntryProps {
  fromText: string;
  toText: string;
  onOpen: () => void;
}

// What the pill holds on a phone. The label is the trip, not a prompt, once there is
// one to show: on the map stage this button is also how the trip gets edited, and a
// bar that reads "Amsterdam Centraal → Vondelpark" says what is planned as well as
// what tapping it will do.
export const SearchEntryButton = forwardRef<HTMLButtonElement, EntryProps>(function SearchEntryButton(
  { fromText, toText, onOpen },
  ref,
) {
  const { t } = useI18n();
  const from = fromText.trim();
  const to = toText.trim();
  const label = from || to ? `${from || t("from")} → ${to || t("to")}` : t("whereTo");

  return (
    <button
      ref={ref}
      type="button"
      data-fov="search-entry"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="flex min-h-[44px] w-full items-center gap-2 rounded-full px-3 text-left"
    >
      <SearchGlyph />
      {/* The accessible name is "Plan your trip: <label>" — it still contains the
          visible words, which is what WCAG's label-in-name rule asks for, and it tells
          a screen-reader user what the bar is before reading out a place name. */}
      <span className="sr-only">{t("planTrip")}: </span>
      <span
        className={`min-w-0 flex-1 truncate text-[15px] ${
          from || to
            ? "font-medium text-slate-900 dark:text-night-text"
            : "text-slate-500 dark:text-night-subtle"
        }`}
      >
        {label}
      </span>
    </button>
  );
});

interface SheetProps {
  fromText: string;
  toText: string;
  onFromText: (text: string) => void;
  onToText: (text: string) => void;
  onSelectFrom: (place: Place) => void;
  onSelectTo: (place: Place) => void;
  onLocateFrom: (ep: Endpoint) => void;
  onLocateTo: (ep: Endpoint) => void;
  savedPlaces?: Place[];
  history?: HistoryEntry[];
  onPickHistoryFrom: (h: HistoryEntry) => void;
  onPickHistoryTo: (h: HistoryEntry) => void;
  onSwap: () => void;
  onSubmit: () => void;
  onClose: () => void;
  // Which field the keyboard opens on. App points it at the empty one.
  focusField: "from" | "to";
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileSearchSheet({
  fromText,
  toText,
  onFromText,
  onToText,
  onSelectFrom,
  onSelectTo,
  onLocateFrom,
  onLocateTo,
  savedPlaces,
  history,
  onPickHistoryFrom,
  onPickHistoryTo,
  onSwap,
  onSubmit,
  onClose,
  focusField,
}: SheetProps): JSX.Element {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const ready = fromText.trim() !== "" && toText.trim() !== "";
  // Which endpoint "use my location" fills. That button used to be per field, inside the
  // field's own row, which is most of why a field was 228px of a 390px screen. One
  // button below the card does the same job for whichever field the caret is in.
  const [activeField, setActiveField] = useState<"from" | "to">(focusField);

  // A full-screen search view is a mode change, so it obeys the same contract as the
  // privacy dialog: focus moves in on open, Escape and the close button leave, and Tab
  // is wrapped at both ends because aria-modal promises the page behind is not there.
  // Focus goes back to the button that opened this — App owns that half, since this
  // component is unmounted by the time the focus has to land.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fields = root.querySelectorAll<HTMLInputElement>('input[role="combobox"]');
    const field = focusField === "to" ? fields[1] : fields[0];
    field?.focus();
    // Selected, not appended to: the common reason to come back here with both fields
    // filled is to replace one of them.
    field?.select?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The document behind this screen must not move while it is open.
  //
  // Without this the page kept its scroll: a real upward drag anywhere on the sheet took
  // the document from 0 to 485, which is most of the way through the home->map morph,
  // and closing the screen dropped the user on the map instead of on the home they left.
  // The scroll offset is recorded and put back on the way out, because making the
  // viewport unscrollable is itself allowed to clamp it.
  useEffect(() => {
    const y = window.scrollY;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
      window.scrollTo(0, y);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // One Escape, one thing closed. A suggestion list open over the fields calls
        // preventDefault on its way past (PlaceInput), and React's handlers run before
        // this one does, so that press belongs to the list and this press closes the
        // screen. Without the check both would go at once and the user would lose the
        // screen when they only meant to dismiss the list.
        if (e.defaultPrevented) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const heading = "fov-mobile-search-title";
  const hint = "fov-mobile-search-hint";
  // Every field is 16px or more (the iOS zoom floor) and every control clears 44px.
  const field = "min-w-0";

  return (
    <div
      ref={rootRef}
      data-fov="search-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={heading}
      className="fov-sheet fixed inset-0 z-[2000] flex flex-col bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] dark:bg-night-bg"
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          aria-label={t("closeSearch")}
          onClick={onClose}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-night-muted dark:hover:bg-night-hover"
        >
          <span aria-hidden="true" className="material-symbols-rounded text-[22px] leading-none">
            close
          </span>
        </button>
        <h2
          id={heading}
          className="truncate text-base font-semibold text-slate-900 dark:text-night-text"
        >
          {t("planTrip")}
        </h2>
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-6"
      >
        {/* The trip as a vertical route: origin dot, a connector that fades from the
            position red to the transit blue, chequered flag at the end. Same three
            marks the popular-trip cards use on the home, turned on their side — this
            screen is the same journey, drawn large. */}
        <div className="relative flex items-stretch gap-1.5 rounded-card border border-gray-200 bg-white p-1.5 shadow-sm dark:border-night-border dark:bg-night-surface">
          {/* The two marks sit on the centre line of their own field: a 44px row puts
              that at 22px, so the dot (10px) starts at 17 and the flag (18px) ends 13
              from the bottom. justify-between then hands the rest to the connector,
              which is what makes it a line between two points rather than a stub. */}
          <div
            aria-hidden="true"
            className="flex w-5 shrink-0 flex-col items-center justify-between pb-[13px] pt-[17px]"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CARD_ACCENTS[0] }}
            />
            <span
              className="w-0.5 flex-1 rounded-full"
              style={{
                backgroundImage: `linear-gradient(to bottom, ${CARD_ACCENTS[0]}, ${CARD_ACCENTS[1]})`,
              }}
            />
            <span className="material-symbols-rounded shrink-0 text-[18px] leading-none text-slate-400 dark:text-night-subtle">
              sports_score
            </span>
          </div>

          {/* Nothing shares a row with the text any more. A clear button, a locate
              button and a swap used to, which left the input 228px of a 390px screen
              and clipped "Amsterdam Sloterdijk" at 360. The locate and the swap are in
              the row below the card now, and the clear sits on the input's own right
              padding rather than beside it. onFocusCapture rather than a prop on the
              field: it is one line and it cannot fall out of step with which input the
              caret is actually in. */}
          <div className="min-w-0 flex-1">
            <div onFocusCapture={() => setActiveField("from")}>
              <EndpointField
                className={field}
                value={fromText}
                placeholder={t("from")}
                onText={onFromText}
                onSelect={onSelectFrom}
                onLocate={onLocateFrom}
                savedPlaces={savedPlaces}
                history={history}
                onPickHistory={onPickHistoryFrom}
                onClear={() => onFromText("")}
                clearLabel={t("clearX", { x: t("from") })}
                listAnchor="container"
                inputClassName="rounded-xl text-base"
                showLocate={false}
                clearInField
              />
            </div>
            <span className="block h-px bg-gray-200 dark:bg-night-border" />
            <div onFocusCapture={() => setActiveField("to")}>
              <EndpointField
                className={field}
                value={toText}
                placeholder={t("to")}
                onText={onToText}
                onSelect={onSelectTo}
                onLocate={onLocateTo}
                savedPlaces={savedPlaces}
                history={history}
                onPickHistory={onPickHistoryTo}
                onClear={() => onToText("")}
                clearLabel={t("clearX", { x: t("to") })}
                listAnchor="container"
                inputClassName="rounded-xl text-base"
                showLocate={false}
                clearInField
              />
            </div>
          </div>
        </div>

        {/* The two controls that used to sit in the fields. Below the card they are
            named rather than guessed at, and the suggestion list (which hangs off the
            card) covers this row while it is open, so it costs the list nothing. */}
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            aria-label={t("swapStartEnd")}
            onClick={onSwap}
            className="flex min-h-[44px] min-w-[44px] select-none items-center gap-1.5 rounded-full px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand dark:text-night-muted dark:hover:bg-night-hover dark:hover:text-emerald-300"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              &#8645;
            </span>
            <span aria-hidden="true">{t("swap")}</span>
          </button>
          <UseMyLocationButton
            withLabel
            onLocated={activeField === "to" ? onLocateTo : onLocateFrom}
          />
        </div>

        <button
          type="submit"
          disabled={!ready}
          aria-describedby={ready ? undefined : hint}
          className={`mt-4 flex min-h-[48px] w-full items-center justify-center rounded-full px-6 text-base font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100 ${PRIMARY_GRADIENT}`}
        >
          {t("search")}
        </button>
        {!ready && (
          <p id={hint} className="mt-2 text-center text-sm text-slate-500 dark:text-night-subtle">
            {t("needBothEndpoints")}
          </p>
        )}
      </form>
    </div>
  );
}
