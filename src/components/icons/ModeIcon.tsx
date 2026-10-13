import type { Mode } from "../../api/types";

// A travel option's mode as a glyph. Inline SVG, like TabIcon: the Material Symbols
// subset is frozen, and a glyph missing from it paints as its own name. Stroke icons in
// currentColor, so the caller decides the ink.
const COMMON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

// Wheels at 5.5 and 18.5, the frame between them, a saddle and a handlebar.
const BIKE = (
  <>
    <circle cx="5.5" cy="17" r="3.5" />
    <circle cx="18.5" cy="17" r="3.5" />
    <path d="M5.5 17 9.5 9.5H16M5.5 17H12l4-7.5 2.5 7.5M9.5 9.5 12 17M8 9.5h3M16 9.5V6.5h2" />
  </>
);

// A tram or bus seen from the front: body, windscreen line, two lamps and the wheels.
const TRANSIT = (
  <>
    <rect x="5" y="3.5" width="14" height="14" rx="3" />
    <path d="M5 10.5h14M8 17.5 6.5 20.5M16 17.5l1.5 3" />
    <circle cx="8.5" cy="14" r="0.75" fill="currentColor" />
    <circle cx="15.5" cy="14" r="0.75" fill="currentColor" />
  </>
);

export function ModeIcon({ mode, className }: { mode: Mode; className?: string }) {
  if (mode === "bike") return <svg {...COMMON} className={className}>{BIKE}</svg>;
  if (mode === "transit") return <svg {...COMMON} className={className}>{TRANSIT}</svg>;
  // Bike and ride: the bike in front, small, and the vehicle it is ridden to behind it.
  // The stroke is widened inside each scaled group so it draws as thick as the others.
  return (
    <svg {...COMMON} className={className}>
      <g transform="translate(9 0) scale(0.62)" strokeWidth={3.2}>
        {TRANSIT}
      </g>
      <g transform="translate(0 9) scale(0.62)" strokeWidth={3.2}>
        {BIKE}
      </g>
    </svg>
  );
}
