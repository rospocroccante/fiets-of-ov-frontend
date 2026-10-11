import type { Tab } from "../../hooks/useAppNav";

// Inline SVG, not the icon font: the Material Symbols subset is frozen, and a glyph
// missing from it paints as its own name. Stroke icons, filled when the tab is active.
export function TabIcon({ tab, active, className }: { tab: Tab; active: boolean; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className,
  };
  if (tab === "plan")
    return (
      <svg {...common}>
        <circle cx="6" cy="19" r="2" fill={active ? "currentColor" : "none"} />
        <circle cx="18" cy="5" r="2" fill={active ? "currentColor" : "none"} />
        <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
      </svg>
    );
  if (tab === "saved")
    return (
      <svg {...common}>
        <path d="M6 4h12v16l-6-4-6 4z" fill={active ? "currentColor" : "none"} />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" fill={active ? "currentColor" : "none"} />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}
