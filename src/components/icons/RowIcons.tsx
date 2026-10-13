// The glyphs of a trip row (TripRow in HomeShortcuts.tsx). Inline SVG, not the icon font:
// the Material Symbols subset is frozen, and a glyph missing from it paints as its own
// name. 24px grid, 2px round strokes, drawn in currentColor.
const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

// A place pin for a popular trip, a clock for a recent one.
export function RowGlyph({ kind, className }: { kind: "place" | "recent"; className?: string }) {
  if (kind === "place")
    return (
      <svg {...common} data-glyph="place" className={className}>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
        <circle cx="12" cy="10" r="2.25" />
      </svg>
    );
  return (
    <svg {...common} data-glyph="clock" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function ChevronRight({ className, fov }: { className?: string; fov?: string }) {
  return (
    <svg {...common} data-fov={fov} className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}
