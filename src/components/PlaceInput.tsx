import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  // The combobox's accessible name. A placeholder is not one: it is a hint, screen
  // readers are not obliged to announce it, and it disappears the moment there is a
  // value. The field has no visible label to point at (the search pill is a single
  // row of two fields and a button), so the name is carried here.
  ariaLabel?: string;
  onChange: (text: string) => void;
  onSelect: (place: Place) => void;
  // Locally saved places: matches rank above remote suggestions, marked with a star.
  savedPlaces?: Place[];
  // Recently used endpoints, shown when the field is focused while (nearly) empty.
  history?: HistoryEntry[];
  onPickHistory?: (h: HistoryEntry) => void;
  // Where the dropdown hangs from. "field" (the default) makes this component its own
  // positioning context, so the list is exactly as wide as the input — right on a
  // desktop pill where the input is the whole control. "container" drops the
  // positioning context so the list resolves against the nearest positioned ancestor
  // instead: the phone search screen hangs both lists off the whole two-field card, so
  // a suggestion gets the full width of the screen rather than the width of one field
  // minus its buttons. At 390px that is 352px instead of 63px, which is the difference
  // between one readable line and seven wrapped ones.
  listAnchor?: "field" | "container";
  // Extra classes for the input itself (the phone screen types larger than the pill).
  inputClassName?: string;
}

// Two entries are the same place when they share an id, or when the same name sits a
// stone's throw away. Names alone used to decide this, which quietly swallowed every
// remote homonym of a saved place - one saved "Albert Heijn" hid the twelve others in
// town. Coordinates alone are no better: a place saved from a map click never lands
// exactly on the remote result's node, so both have to agree.
const SAME_PLACE_M = 250;
const M_LAT = 110_574;

// Breathing room under a list that ends at the bottom of the screen, and the least
// height one is allowed to have when the field it belongs to is near that bottom.
const LIST_BOTTOM_GAP = 12;
const LIST_MIN_HEIGHT = 160;

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
  ariaLabel,
  onChange,
  onSelect,
  savedPlaces,
  history,
  onPickHistory,
  listAnchor = "field",
  inputClassName,
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

  // How much room there is between the top of the list and the bottom of the screen.
  // Only the container anchor (the phone sheet) uses it; see listClass below for why.
  //
  // visualViewport, not innerHeight: on iOS the on-screen keyboard does not change
  // innerHeight, so a list sized against it would run a keyboard's worth of rows under
  // the keyboard — exactly the rows a user is reaching for while typing.
  const listRef = useRef<HTMLUListElement>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | undefined>(undefined);
  // Layout effect, not a plain one: measured after paint, a long list would show at its
  // full height for a frame and then snap to the room it has.
  useLayoutEffect(() => {
    if (listAnchor !== "container" || !listOpen) return;
    const measure = () => {
      const el = listRef.current;
      if (!el) return;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const room = viewport - el.getBoundingClientRect().top - LIST_BOTTOM_GAP;
      // A floor, so a field pushed near the bottom of a short landscape screen still
      // offers a usable list rather than a sliver.
      setListMaxHeight(Math.max(LIST_MIN_HEIGHT, Math.round(room)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    // Two events that move the list without resizing anything. The sheet arrives with a
    // 14px rise (.fov-sheet in index.css), and a list opened during it — which is every
    // list, since the recents appear the moment the field takes focus — would otherwise
    // keep the height it had 14px lower for as long as it stayed open. Scrolling the
    // form under it is the same problem, slower.
    window.addEventListener("animationend", measure, true);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("animationend", measure, true);
      window.removeEventListener("scroll", measure, true);
    };
  }, [listAnchor, listOpen]);
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

  // One list class for both dropdowns. left/right/top-full resolve against whatever
  // the anchor left as the positioning context (this component, or its container).
  //
  // The 18rem cap belongs to the desktop pill, where the list hangs into the page over
  // the content below it and must not swallow the screen. On the phone the list is the
  // screen: the sheet is a full-viewport surface with nothing underneath to protect, and
  // the cap stopped the list at y=452 of 844 with 390px of white below it — a suggestion
  // list that scrolls internally while half the screen sits empty. There the height is
  // measured instead (listMaxHeight below), so the list ends where the sheet does.
  const listClass = `absolute left-0 right-0 top-full z-20 mt-1 overflow-auto rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-white/10 dark:bg-night-raised${
    listAnchor === "container" ? "" : " max-h-72"
  }`;
  const listStyle = listAnchor === "container" ? { maxHeight: listMaxHeight } : undefined;

  return (
    <div className={listAnchor === "container" ? "w-full" : "relative w-full"}>
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
        className={`w-full min-h-[44px] bg-transparent px-2 py-2 text-sm outline-none [@media(pointer:coarse)]:text-base dark:text-night-text dark:placeholder:text-night-subtle${
          inputClassName ? ` ${inputClassName}` : ""
        }`}
        placeholder={placeholder}
        aria-label={ariaLabel}
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
          ref={listRef}
          id={listId}
          role="listbox"
          className={listClass}
          style={listStyle}
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
          ref={listRef}
          id={listId}
          role="listbox"
          className={listClass}
          style={listStyle}
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
