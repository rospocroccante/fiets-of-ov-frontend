// One colour per transport mode, shared by the map polylines and the step-by-step
// chips so a route reads the same in both places. Hues sit together around the navy
// brand: cool for the self-powered and water modes (bike green, ferry teal, metro
// indigo), warm accents for street transit (tram red, rail amber), muted for walking.
export const MODE_COLORS: Record<string, string> = {
  BICYCLE: "#059669",
  WALK: "#94a3b8",
  FERRY: "#0e7490",
  TRAM: "#dc2626",
  BUS: "#7c3aed",
  SUBWAY: "#4f46e5",
  RAIL: "#d97706",
};

// Unknown or future modes fall back to the brand navy.
const DEFAULT_MODE_COLOR = "#13386E";

export function modeColor(mode: string): string {
  return MODE_COLORS[mode] ?? DEFAULT_MODE_COLOR;
}

// A brighter partner tone per mode: chips and badges render a 135deg sweep from the
// base colour into this one instead of a flat fill.
const MODE_COLORS_BRIGHT: Record<string, string> = {
  BICYCLE: "#34d399",
  WALK: "#cbd5e1",
  FERRY: "#22d3ee",
  TRAM: "#fb7185",
  BUS: "#c084fc",
  SUBWAY: "#818cf8",
  RAIL: "#fbbf24",
};

export function modeGradient(mode: string): string {
  const from = modeColor(mode);
  const to = MODE_COLORS_BRIGHT[mode] ?? "#3b82f6";
  return `linear-gradient(135deg, ${from}, ${to})`;
}
