// The "mock" badge: the one sign on screen that the planner and the geocoder answer from
// fixtures (VITE_API_MODE=mock). It takes no touches. Where it sits is App's call, per
// layout: `place` carries the positioning classes, and `top` a measured offset where the
// spot follows something on the screen.
export function MockBadge({ place, top }: { place: string; top?: string }) {
  return (
    <div
      data-fov="mock-badge"
      className={`pointer-events-none rounded-full bg-brand px-3 py-1 text-xs text-white ${place}`.trimEnd()}
      style={top != null ? { top } : undefined}
    >
      mock
    </div>
  );
}
