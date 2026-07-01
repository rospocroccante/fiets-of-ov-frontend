export type { Trip } from "../trip";

import { EndpointField } from "./EndpointField";
import type { Place } from "../api/types";
import type { Endpoint } from "../trip";

export function SearchBar({
  fromValue,
  toValue,
  onFromText,
  onToText,
  onFromSelect,
  onToSelect,
  onFromLocate,
  onToLocate,
  onSwap,
  onSubmit,
  onHome,
}: {
  fromValue: string;
  toValue: string;
  onFromText: (t: string) => void;
  onToText: (t: string) => void;
  onFromSelect: (p: Place) => void;
  onToSelect: (p: Place) => void;
  onFromLocate: (ep: Endpoint) => void;
  onToLocate: (ep: Endpoint) => void;
  onSwap: () => void;
  onSubmit: () => void;
  onHome?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button onClick={onHome} className="text-2xl font-bold text-brand">
        Fiets of OV
      </button>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center rounded-full border border-gray-200 bg-white shadow-sm">
          <EndpointField
            value={fromValue}
            placeholder="From"
            onText={onFromText}
            onSelect={onFromSelect}
            onLocate={onFromLocate}
            className="rounded-l-full px-3"
          />
          <button
            type="button"
            aria-label="Swap start and end"
            onClick={onSwap}
            className="flex-shrink-0 px-2 text-gray-400 hover:text-brand"
          >
            &#8646;
          </button>
          <EndpointField
            value={toValue}
            placeholder="To"
            onText={onToText}
            onSelect={onToSelect}
            onLocate={onToLocate}
            className="px-3"
          />
          <span className="h-6 w-px bg-gray-200" />
          <span className="px-5 py-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={onSubmit}
            className="m-1 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            &#9906;
          </button>
        </div>
      </div>

      <button className="rounded-full border border-gray-200 px-5 py-2 text-sm font-medium">
        Menu &#9776;
      </button>
    </div>
  );
}
