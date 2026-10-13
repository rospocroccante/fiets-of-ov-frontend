// The "mock" badge: the one sign on screen that the planner and the geocoder answer from
// fixtures (VITE_API_MODE=mock). It takes no touches. Where it sits is App's call, per
// layout, and `place` carries the positioning classes.
export function MockBadge({ place }: { place: string }) {
  return (
    <div
      data-fov="mock-badge"
      className={`pointer-events-none rounded-full bg-brand px-3 py-1 text-xs text-white ${place}`.trimEnd()}
    >
      mock
    </div>
  );
}
