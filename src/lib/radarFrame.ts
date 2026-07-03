import { useSyncExternalStore } from "react";

// The radar animation advances a frame every 700ms. That tick must not re-render the
// map (or the app) — only the little clock chip that displays it. An external store
// lets the producer (RadarOverlay, inside the Leaflet map) push the current frame time
// and the consumer (RadarReadout) subscribe in isolation, with nothing in between.
let frame: number | null = null;
const listeners = new Set<() => void>();

export function publishRadarFrame(time: number): void {
  if (time === frame) return;
  frame = time;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRadarFrame(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => frame,
    () => frame,
  );
}
