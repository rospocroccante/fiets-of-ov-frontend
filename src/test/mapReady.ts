import { act, waitFor } from "@testing-library/react";

// App code-splits the map stack and only renders it once the user shows some sign of
// heading for the map (see components/lazyMap and WARM_EVENTS in App) — a gesture jsdom
// never produces on its own. So a test that drives map events has to do two things a
// real user does implicitly: signal the intent, then wait for the chunk to mount.
// The mocked MapContainer's .leaflet-container is the marker that the real (mock-backed)
// MapView has taken the Suspense fallback's place.
//
// Note for anyone writing a test that asserts on the *placeholder*: the module-level
// "already fetched" flag in lazyMap survives between tests in the same file, so once one
// test has called this the rest render the map straight away. Assert the pre-intent
// state in the same test that calls this, not in a later one.
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
