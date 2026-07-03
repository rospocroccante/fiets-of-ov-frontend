// Fresha-style vivid gradients, one source so home, filter bar and cards stay in
// tune. Tailwind's JIT picks these up because the full class names are literal
// strings in this file.

// The primary action gradient: Search, active toggles, the wordmark.
export const PRIMARY_GRADIENT = "bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-500";

// Gradient text variant of the same sweep, for headlines and the wordmark.
export const TEXT_GRADIENT =
  "bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-orange-500 bg-clip-text text-transparent";

// One vivid pair per popular-trip card, rotated across the grid.
export const CARD_GRADIENTS = [
  "bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500",
  "bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600",
  "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500",
  "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
];

// Advice option cards: one gradient per travel mode for the header box.
export const OPTION_GRADIENTS: Record<string, string> = {
  bike: "bg-gradient-to-br from-emerald-500 to-teal-600",
  transit: "bg-gradient-to-br from-indigo-500 to-violet-600",
  bike_and_ride: "bg-gradient-to-br from-amber-500 to-orange-600",
};
