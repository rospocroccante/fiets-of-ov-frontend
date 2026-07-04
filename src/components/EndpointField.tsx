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
  savedPlaces?: Place[];
  history?: HistoryEntry[];
  onPickHistory?: (h: HistoryEntry) => void;
  className?: string;
}

export function EndpointField({
  value,
  placeholder,
  onText,
  onSelect,
  onLocate,
  savedPlaces,
  history,
  onPickHistory,
  className,
}: Props): JSX.Element {
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <PlaceInput
        value={value}
        placeholder={placeholder}
        onChange={onText}
        onSelect={onSelect}
        savedPlaces={savedPlaces}
        history={history}
        onPickHistory={onPickHistory}
      />
      <UseMyLocationButton onLocated={onLocate} />
    </div>
  );
}
