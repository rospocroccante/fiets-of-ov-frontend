import { lazy } from "react";

// The map stack (leaflet + react-leaflet + the radar and wind layers on top of them) is
// the heaviest thing the app owns and the home screen draws none of it, so it lives
// behind a dynamic import. Three callers need a say in that import, which is why the
// plumbing sits in its own module rather than inside App:
//
//   - App renders LazyMapView, but only once the user is on their way to the map;
//     React.lazy alone would not have helped, because both morph stages are mounted from
//     the first paint and lazy() fetches as soon as its component is *rendered*.
//   - App also calls preloadMap() on the first sign of intent, so the chunk is on disk
//     before the morph finishes and the Suspense fallback never reaches the screen.
//   - The test setup awaits preloadMap() once, which makes isMapLoaded() true before any
//     test renders and keeps component trees behaving as they did before the split.
let loaded = false;
let requests = 0;

export function preloadMap(): Promise<typeof import("./MapView")> {
  requests += 1;
  return import("./MapView").then((m) => {
    loaded = true;
    return m;
  });
}

// Synchronous answer to "is the chunk already here?", so a first render that cannot
// possibly need the placeholder does not show one.
export function isMapLoaded(): boolean {
  return loaded;
}

// How many times anything has reached for the chunk. Not a traffic counter — the
// dynamic import caches itself — but the only *synchronous* way to tell "nothing has
// asked for the map yet" apart from "the request is still in flight", which is exactly
// the distinction the home screen's whole reason for existing rests on.
export function mapChunkRequests(): number {
  return requests;
}

export const LazyMapView = lazy(() => preloadMap().then((m) => ({ default: m.MapView })));
