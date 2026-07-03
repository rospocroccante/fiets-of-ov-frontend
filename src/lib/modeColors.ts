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

// A very light tint of the mode colour for soft panel backgrounds (advice banners):
// ~12% to ~4% alpha, so the surface stays clean and the mode reads as a whisper.
export function modeSoftBg(mode: string): string {
  const c = modeColor(mode);
  return `linear-gradient(135deg, ${c}1f, ${c}0a)`;
}
