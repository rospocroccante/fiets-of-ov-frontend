import { PlaceInput } from "./PlaceInput";
import { UseMyLocationButton } from "./UseMyLocationButton";
import type { Place } from "../api/types";
import type { Endpoint } from "../trip";

interface Props {
  value: string;
  placeholder: string;
  onText: (text: string) => void;
  onSelect: (place: Place) => void;
  onLocate: (ep: Endpoint) => void;
  className?: string;
}

export function EndpointField({
  value,
  placeholder,
  onText,
  onSelect,
  onLocate,
  className,
}: Props): JSX.Element {
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <PlaceInput
        value={value}
        placeholder={placeholder}
        onChange={onText}
        onSelect={onSelect}
      />
      <UseMyLocationButton onLocated={onLocate} />
    </div>
  );
}
