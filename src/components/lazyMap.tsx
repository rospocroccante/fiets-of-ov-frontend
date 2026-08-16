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
//   - The tests need to start every case from "nothing has asked for the map yet", which
//     is what resetMapChunkState() below is for.
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

// Both variables above are module state, which in a browser is exactly right — the
// chunk really is fetched once per document — and in a test run is a fact that outlives
// the test that caused it. Left alone it couples cases to each other in both directions:
// a test asserting the pre-intent state only passes if it runs before any test that
// mounts the map, and a test that fires map events without asking for one only passes
// *after* one. The suite calls this from a global beforeEach (src/test/setup.ts) so
// every test starts from a cold home screen. It does not evict the underlying dynamic
// import — nothing can — so a later preloadMap() still resolves from the module cache;
// what it restores is the app's view of whether anyone has asked yet.
export function resetMapChunkState(): void {
  loaded = false;
  requests = 0;
}

export const LazyMapView = lazy(() => preloadMap().then((m) => ({ default: m.MapView })));
