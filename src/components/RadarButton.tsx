import { useI18n } from "../lib/i18n";

// The rain radar on a phone: a round button on the map, in the corner where Google Maps
// keeps its layers button, so the radar is one tap away and on screen without opening
// anything. App places it (it owns the radar state, the sheet and the layout); MapView
// starts the radar's readout under it, RADAR_BUTTON_CLEAR further down the map.
//
// This module stays out of the map chunk's imports on purpose: App renders the button,
// and RainRadar.tsx pulls react-leaflet in with it.

// The button's size, and the room the readout leaves for it: the button and 8px of air.
export const RADAR_BUTTON_PX = 48;
export const RADAR_BUTTON_CLEAR = RADAR_BUTTON_PX + 8;

// Off, the white surface and shadow of the map's other round buttons (the reset, the
// back arrow). On, a filled disc: brand by day, the night accent at night, with the icon
// in the colour that reads on it.
const OFF =
  "border-transparent bg-white text-slate-800 hover:bg-slate-50 dark:border-night-rim/30 dark:bg-night-raised dark:text-night-text dark:hover:bg-night-hover";
const ON = "border-transparent text-white dark:text-night-bg";

export function RadarButton({
  on,
  onToggle,
  top,
  hidden = false,
}: {
  on: boolean;
  onToggle: () => void;
  // Distance from the top of the map, in px.
  top: number;
  // Out of the way and out of reach, when the map it acts on is not on the screen.
  hidden?: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-fov="radar-button"
      aria-pressed={on}
      aria-label={t("radar")}
      title={t("radar")}
      onClick={onToggle}
      className={`absolute right-3 z-[1000] flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border shadow-md transition ${
        on ? ON : OFF
      }`}
      style={{ top, opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : undefined }}
      {...(hidden ? { inert: "" as const } : {})}
    >
      {on && (
        <span
          aria-hidden="true"
          data-fov="radar-fill"
          className="absolute inset-0 rounded-full bg-brand dark:bg-night-accent"
        />
      )}
      {/* A cloud with rain under it. Inline SVG rather than the icon font: that subset is
          frozen, and a glyph missing from it paints as its name across the button. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="relative h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.5 15.5h9a3.5 3.5 0 0 0 .6-6.95 5 5 0 0 0-9.7-.8A3.9 3.9 0 0 0 7.5 15.5z" />
        <path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5" />
      </svg>
    </button>
  );
}
