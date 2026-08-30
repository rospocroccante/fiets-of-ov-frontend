import { act, waitFor } from "@testing-library/react";

// App code-splits the map stack and only renders it once the user shows some sign of
// heading for the map (see components/lazyMap and WARM_EVENTS in App) — a gesture jsdom
// never produces on its own. So a test that drives map events has to do two things a
// real user does implicitly: signal the intent, then wait for the chunk to mount.
// The mocked MapContainer's .leaflet-container is the marker that the real (mock-backed)
// MapView has taken the Suspense fallback's place.
//
// Call it in every test that drives the map, including tests that follow one which
// already did. It used to be optional-by-accident: lazyMap's "already fetched" flag is
// module state, so the first call in a file made the map mount for all the rest, and
// tests written after that one worked without asking. Under a shuffled order they
// stopped working, so the flag is now reset before every test (test/setup.ts) and the
// only test that gets a map is the one that asks for it. Calling it twice is free.
export function whenMapMounted(): Promise<void> {
  // The listener flips React state, so the dispatch belongs inside act().
  act(() => {
    window.dispatchEvent(new Event("pointerdown"));
  });
  return waitFor(() => {
    if (!document.querySelector(".leaflet-container")) {
      throw new Error("map stage not mounted yet");
    }
  });
}
