import { useEffect, useRef, useState } from "react";
import { searchPlaces } from "../api/client";
import type { Place } from "../api/types";

interface Props {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onSelect: (place: Place) => void;
}

export function PlaceInput({ value, placeholder, onChange, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const justSelected = useRef(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await searchPlaces(q);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  function pick(place: Place) {
    justSelected.current = true;
    setQuery(place.name);
    onChange(place.name);
    onSelect(place);
    setOpen(false);
    setSuggestions([]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setQuery(text);
    onChange(text);
  }

  return (
    <div className="relative w-full">
      <input
        className="w-full bg-transparent px-2 py-2 text-sm outline-none"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl border border-gray-100 bg-white shadow-lg"
        >
          {suggestions.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className="cursor-pointer px-4 py-2 text-sm hover:bg-brand-light"
            >
              <span className="font-medium">{p.name}</span>
              {p.label !== p.name && (
                <span className="text-gray-500">
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
