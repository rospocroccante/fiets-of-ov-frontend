import { useState } from "react";

export interface Trip {
  from: string;
  to: string;
}

export function SearchBar({ onSearch, onHome }: { onSearch: (trip: Trip) => void; onHome?: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function submit() {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t) return;
    onSearch({ from: f, to: t });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <button onClick={onHome} className="text-2xl font-bold text-brand">
        Fiets of OV
      </button>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center rounded-full border border-gray-200 bg-white shadow-sm">
          <input
            className="w-40 rounded-l-full px-5 py-3 text-sm outline-none"
            placeholder="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <span className="h-6 w-px bg-gray-200" />
          <input
            className="w-40 px-5 py-3 text-sm outline-none"
            placeholder="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <span className="h-6 w-px bg-gray-200" />
          <span className="px-5 py-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={submit}
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
