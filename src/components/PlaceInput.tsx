import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces } from "../api/client";
import type { Place } from "../api/types";

export interface HistoryEntry {
  label: string;
  // The backend query for this endpoint (free text or "lat,lon").
  query: string;
}

interface Props {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onSelect: (place: Place) => void;
  // Locally saved places: matches rank above remote suggestions, marked with a star.
  savedPlaces?: Place[];
  // Recently used endpoints, shown when the field is focused while (nearly) empty.
  history?: HistoryEntry[];
  onPickHistory?: (h: HistoryEntry) => void;
}

// Two entries are the same place when they share an id, or when the same name sits a
// stone's throw away. Names alone used to decide this, which quietly swallowed every
// remote homonym of a saved place - one saved "Albert Heijn" hid the twelve others in
// town. Coordinates alone are no better: a place saved from a map click never lands
// exactly on the remote result's node, so both have to agree.
const SAME_PLACE_M = 250;
const M_LAT = 110_574;

function samePlace(a: Place, b: Place): boolean {
  if (a.id === b.id) return true;
  if (a.name.toLowerCase() !== b.name.toLowerCase()) return false;
  const dy = (a.lat - b.lat) * M_LAT;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy) <= SAME_PLACE_M;
}

export function PlaceInput({
  value,
  placeholder,
  onChange,
  onSelect,
  savedPlaces,
  history,
  onPickHistory,
}: Props) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // Escape closes the dropdown without leaving the field; it stays closed until the
  // next keystroke or a fresh focus, or it would pop straight back up.
  const [dismissed, setDismissed] = useState(false);
  // Keyboard cursor into the open list; -1 means "nothing highlighted", so Enter falls
  // through to the form's own behaviour instead of picking an arbitrary first result.
  const [activeIndex, setActiveIndex] = useState(-1);
  const justSelected = useRef(false);
  // Suggestions may only open in response to typing in THIS input. A programmatic
  // value change (a suggested trip from the home, use-my-location) syncs the text
  // but must not pop the dropdown over the results.
  const typedHere = useRef(false);
  const [query, setQuery] = useState(value);
  const lastValue = useRef(value);
  // Read through a ref inside the debounced fetch: the list must not be an effect
  // dependency, or every parent render would restart the debounce.
  const savedPlacesRef = useRef(savedPlaces);
  savedPlacesRef.current = savedPlaces;
  const listId = useId();

  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    // A controlled parent echoes each keystroke straight back as `value`. That echo
    // (value already equal to what was typed) is not an external change: resetting
    // typedHere on it would close the dropdown on every keystroke.
    if (value === query) return;
    typedHere.current = false;
    setQuery(value);
  }, [value, query]);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2 || !typedHere.current) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    // Clearing the timer only cancels a request that has not left yet. One already in
    // flight has to be aborted as well, and its late answer ignored: otherwise a slow
    // response for "vond" lands after the one for "vondelpark" and puts the older list
    // back on screen, under the newer text.
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      let results: Place[];
      try {
        results = await searchPlaces(q, controller.signal);
      } catch {
        // A refused lookup (offline, geocoder down, or our own abort) must not surface
        // as an unhandled rejection. Only a genuine failure clears the list; an abort
        // means a newer query owns the dropdown now.
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
        return;
      }
      if (controller.signal.aborted) return;
      const needle = q.toLowerCase();
      const saved = (savedPlacesRef.current ?? []).filter((p) =>
        p.name.toLowerCase().includes(needle),
      );
      // Saved matches first, then remote results not already covered by them.
      const merged = [
        ...saved,
        ...results.filter((r) => !saved.some((s) => samePlace(s, r))),
      ];
      setSuggestions(merged);
      setActiveIndex(-1);
      setOpen(merged.length > 0);
    }, 150);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query]);

  function pick(place: Place) {
    justSelected.current = true;
    setQuery(place.name);
    onChange(place.name);
    onSelect(place);
    setOpen(false);
    setActiveIndex(-1);
    setSuggestions([]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    typedHere.current = true;
    setDismissed(false);
    setActiveIndex(-1);
    setQuery(text);
    onChange(text);
  }

  function pickHistory(h: HistoryEntry) {
    justSelected.current = true;
    setQuery(h.label);
    setActiveIndex(-1);
    onPickHistory?.(h);
  }

  // Maps-style recents: an (almost) empty focused field offers where you have been.
  const showHistory =
    focused &&
    !dismissed &&
    query.trim().length < 2 &&
    onPickHistory != null &&
    (history?.length ?? 0) > 0;
  const showSuggestions = open && !dismissed && suggestions.length > 0 && !showHistory;
  const listOpen = showHistory || showSuggestions;
  // One keyboard model for both dropdowns: whichever is on screen is the listbox the
  // input drives, so the arrow keys, Enter and aria-activedescendant need not care
  // which of the two it is.
  const items: Array<() => void> = showSuggestions
    ? suggestions.map((p) => () => pick(p))
    : showHistory
      ? (history ?? []).map((h) => () => pickHistory(h))
      : [];
  const optionId = (i: number) => `${listId}-option-${i}`;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (!listOpen) return;
      e.preventDefault();
      setDismissed(true);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      // preventDefault throughout: the arrows would otherwise jump the caret to the
      // ends of the text while the eye is on the list.
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < items.length) {
      e.preventDefault();
      items[activeIndex]();
    }
  }

  return (
    <div className="relative w-full">
      {/* WAI-ARIA combobox: without the role and the expanded/activedescendant pair a
          screen reader announces a plain text field and never mentions that a list of
          suggestions appeared underneath it. */}
      <input
        // The pointer:coarse bump to 16px is the iOS input-zoom fix: Safari zooms the
        // whole page on focus for anything under 16px, which on this layout throws the
        // floating search pill half off screen and leaves the user pinching back out.
        // The condition is the pointer, not a width breakpoint - an iPhone in landscape
        // is wider than `sm` and zooms just the same. min-h-[44px] makes the field a
        // finger-sized target in its own right.
        className="w-full min-h-[44px] bg-transparent px-2 py-2 text-sm outline-none [@media(pointer:coarse)]:text-base dark:text-night-text dark:placeholder:text-night-subtle"
        placeholder={placeholder}
        value={query}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 && listOpen ? optionId(activeIndex) : undefined}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
          setActiveIndex(-1);
        }}
      />
      {showHistory && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-white/10 dark:bg-night-raised"
        >
          {(history ?? []).map((h, i) => (
            <li
              key={`${h.label}-${h.query}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickHistory(h)}
              // py-3 rather than py-2: 20px of line plus 24px of padding is exactly the
              // 44px a fingertip needs, and a suggestion list is the one place on the
              // phone where mis-taps cost the user their typed query.
              className={`cursor-pointer px-4 py-3 text-sm hover:bg-brand-light dark:hover:bg-night-hover ${
                i === activeIndex ? "bg-brand-light dark:bg-night-hover" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className="material-symbols-rounded mr-1.5 align-[-3px] text-[15px] leading-none text-slate-400"
              >
                history
              </span>
              <span className="font-medium">{h.label}</span>
            </li>
          ))}
        </ul>
      )}
      {showSuggestions && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-white/10 dark:bg-night-raised"
        >
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              // py-3 rather than py-2: 20px of line plus 24px of padding is exactly the
              // 44px a fingertip needs, and a suggestion list is the one place on the
              // phone where mis-taps cost the user their typed query.
              className={`cursor-pointer px-4 py-3 text-sm hover:bg-brand-light dark:hover:bg-night-hover ${
                i === activeIndex ? "bg-brand-light dark:bg-night-hover" : ""
              }`}
            >
              {savedPlaces?.some((s) => s.id === p.id) && (
                <span
                  aria-hidden="true"
                  className="material-symbols-rounded mr-1 align-[-3px] text-[15px] leading-none text-amber-500"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  star
                </span>
              )}
              <span className="font-medium">{p.name}</span>
              {p.label !== p.name && (
                <span className="text-gray-500 dark:text-night-subtle">
                  {" — "}
                  {p.label.startsWith(p.name) ? p.label.slice(p.name.length).replace(/^,\s*/, "") : p.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
