import { useState } from "react";
import { PlaceInput } from "./PlaceInput";
import type { Trip } from "./SearchBar";

const POPULAR: Trip[] = [
  { from: "Amsterdam Centraal", to: "Vondelpark" },
  { from: "De Pijp", to: "Rijksmuseum" },
  { from: "Jordaan", to: "Amsterdamse Poort" },
  { from: "Amsterdam Zuid", to: "NDSM" },
];

export function HomeHero({ onSearch }: { onSearch: (trip: Trip) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function submit() {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t) return;
    onSearch({ from: f, to: t });
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-brand-light to-white">
      <header className="flex items-center justify-between px-8 py-5">
        <span className="text-2xl font-bold text-brand">Fiets of OV</span>
        <nav className="flex items-center gap-3 text-sm">
          <button className="font-medium">Sign in</button>
          <button className="rounded-full border border-gray-300 px-5 py-2 font-medium">
            Menu
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 pt-16 text-center">
        <h1 className="text-5xl font-bold leading-tight text-gray-900">
          Bike or transit?
          <br />
          Let the weather decide.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Plan any trip across Amsterdam and get a rain-aware answer in one tap.
        </p>

        <div className="mx-auto mt-10 flex max-w-3xl items-center gap-2 rounded-full border border-gray-200 bg-white p-2 shadow-md">
          <div className="flex flex-1 items-center px-3">
            <PlaceInput
              value={from}
              placeholder="From"
              onChange={setFrom}
              onSelect={(p) => setFrom(p.name)}
            />
          </div>
          <span className="h-7 w-px bg-gray-200" />
          <div className="flex flex-1 items-center px-3">
            <PlaceInput
              value={to}
              placeholder="To"
              onChange={setTo}
              onSelect={(p) => setTo(p.name)}
            />
          </div>
          <span className="h-7 w-px bg-gray-200" />
          <span className="px-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={submit}
            className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
          >
            Search
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-500">Rain-aware routing across Amsterdam</p>

        <section className="mt-16 text-left">
          <h2 className="mb-4 text-xl font-semibold">Popular trips</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR.map((trip) => (
              <button
                key={`${trip.from}-${trip.to}`}
                onClick={() => onSearch(trip)}
                aria-label={`${trip.from} → ${trip.to}`}
                className="rounded-card border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="flex h-20 items-center justify-center rounded-card bg-brand-light text-sm font-semibold text-brand">
                  {trip.from} → {trip.to}
                </div>
                <p className="mt-3 text-sm font-medium text-gray-700">
                  {trip.from} → {trip.to}
                </p>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
