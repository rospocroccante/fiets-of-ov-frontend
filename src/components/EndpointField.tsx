import { PlaceInput } from "./PlaceInput";
import type { HistoryEntry } from "./PlaceInput";
import { UseMyLocationButton } from "./UseMyLocationButton";
import type { Place } from "../api/types";
import type { Endpoint } from "../trip";

interface Props {
  value: string;
  placeholder: string;
  onText: (text: string) => void;
  onSelect: (place: Place) => void;
  onLocate: (ep: Endpoint) => void;
  // Ties a locate's completion back to its start so the owner can drop a result the
  // user has typed over in the meantime; see UseMyLocationButton.
  beginLocate?: () => (ep: Endpoint) => void;
  savedPlaces?: Place[];
  history?: HistoryEntry[];
  onPickHistory?: (h: HistoryEntry) => void;
  className?: string;
  // Emptying the field in one tap. Only drawn when there is something to clear, and
  // only where it is asked for: the phone search screen has the room, the desktop
  // pill does not. Passing this without `clearLabel` gives the button no name.
  onClear?: () => void;
  clearLabel?: string;
  // Forwarded to PlaceInput; see the props there.
  listAnchor?: "field" | "container";
  inputClassName?: string;
  // Whether the locate button shares the field's row. The desktop pill keeps it there;
  // the phone screen moves it out from under the text entirely (see below).
  showLocate?: boolean;
  // Where the clear button goes. Inline (the default) it is a sibling of the input and
  // takes 44px off the text. Over the field it sits on the input's own right padding,
  // so the text has the whole row and nothing is written underneath the button.
  clearInField?: boolean;
}

export function EndpointField({
  value,
  placeholder,
  onText,
  onSelect,
  onLocate,
  beginLocate,
  savedPlaces,
  history,
  onPickHistory,
  className,
  onClear,
  clearLabel,
  listAnchor,
  inputClassName,
  showLocate = true,
  clearInField = false,
}: Props): JSX.Element {
  const showClear = onClear != null && value !== "";
  // The overlay is a negative margin, not `position: absolute`. Absolute positioning
  // would need a positioned ancestor here, and this component is deliberately not one:
  // `listAnchor="container"` exists so the suggestion list resolves against the card
  // that holds both fields rather than against one field. A -44px margin puts the
  // button back over the input's last 44px, which the input's own padding has already
  // reserved, and the flex row still sums to exactly the width it was given.
  const clearOverlaid = clearInField && showClear;
  const inputClasses = [inputClassName, clearOverlaid ? "pr-11" : null].filter(Boolean).join(" ");

  return (
    <div className={["flex items-center", clearInField ? null : "gap-1", className].filter(Boolean).join(" ")}>
      <PlaceInput
        value={value}
        placeholder={placeholder}
        // The visible hint doubles as the accessible name. Same words on purpose:
        // WCAG's label-in-name rule wants what a speech user says ("From") to be what
        // the field is called, and there is no other visible text to borrow.
        ariaLabel={placeholder}
        onChange={onText}
        onSelect={onSelect}
        savedPlaces={savedPlaces}
        history={history}
        onPickHistory={onPickHistory}
        listAnchor={listAnchor}
        inputClassName={inputClasses || undefined}
      />
      {showClear && (
        <button
          type="button"
          aria-label={clearLabel}
          // mousedown, not click, is what blurs the input — and a blur closes the
          // suggestion list and hands focus to the page. Swallowing it keeps the
          // caret (and the keyboard, on a phone) where it was.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
          className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-night-subtle dark:hover:bg-night-hover dark:hover:text-night-text${
            clearOverlaid ? " -ml-11" : ""
          }`}
        >
          <span aria-hidden="true" className="material-symbols-rounded text-[18px] leading-none">
            close
          </span>
        </button>
      )}
      {showLocate && <UseMyLocationButton onLocated={onLocate} beginLocate={beginLocate} />}
    </div>
  );
}
