// The chevron of a trip row (TripRow in HomeShortcuts.tsx). Inline SVG, not the icon font:
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

export function ChevronRight({ className, fov }: { className?: string; fov?: string }) {
  return (
    <svg {...common} data-fov={fov} className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}
