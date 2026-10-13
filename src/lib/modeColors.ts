// One colour per transport mode, shared by the map polylines and the step-by-step
// chips so a route reads the same in both places. The hues are Amsterdam's own:
// bike green from the Dutch cycle-route signage, ferry teal for the IJ crossing,
// GVB blue for the tram, NS amber for rail; metro indigo and bus violet keep the
// family distinct on the map, walking stays muted.
export const MODE_COLORS: Record<string, string> = {
  BICYCLE: "#059669",
  WALK: "#94a3b8",
  FERRY: "#0e7490",
  TRAM: "#0077C8",
  BUS: "#7c3aed",
  SUBWAY: "#4f46e5",
  RAIL: "#d97706",
};

// Unknown or future modes fall back to the brand navy.
const DEFAULT_MODE_COLOR = "#0D4A73";

export function modeColor(mode: string): string {
  return MODE_COLORS[mode] ?? DEFAULT_MODE_COLOR;
}

// WCAG relative luminance of a "#rrggbb".
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Ink for anything filled with a leg's own mode colour: the step-by-step chips and the
// option rows' duration bar. The fill has to stay exactly the colour of that leg on the
// map, so the readable half of the pair is the text: white on the walking grey measured
// 2.56:1 and on the bike green 3.77:1, both well under AA for 11-12px. Picking whichever
// of near-black and white contrasts better against the fill keeps every mode at 4.7:1
// or above without moving a single hue. It lives here, beside the colours, so the two
// places that paint a mode colour cannot drift into two palettes.
const CHIP_DARK = "#111827";
export function chipInk(background: string): string {
  const bg = luminance(background);
  const onWhite = 1.05 / (bg + 0.05);
  const onDark = (bg + 0.05) / (luminance(CHIP_DARK) + 0.05);
  return onDark > onWhite ? CHIP_DARK : "#ffffff";
}

// A very light tint of the mode colour for soft panel backgrounds (advice banners):
// ~12% to ~4% alpha, so the surface stays clean and the mode reads as a whisper.
export function modeSoftBg(mode: string): string {
  const c = modeColor(mode);
  return `linear-gradient(135deg, ${c}1f, ${c}0a)`;
}
