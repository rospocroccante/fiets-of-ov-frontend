import { renderHook, act } from "@testing-library/react";
import { placeKey, useSavedPlaces } from "./useSavedPlaces";

beforeEach(() => window.localStorage.clear());

test("toggle saves, re-toggle removes; persisted across hook instances", () => {
  const { result } = renderHook(() => useSavedPlaces(() => 1000));
  act(() => result.current.toggle({ name: "NDSM", lat: 52.401, lon: 4.8935 }));
  expect(result.current.places).toHaveLength(1);
  expect(result.current.isSaved(52.401, 4.8935)).toBe(true);

  // A fresh mount reads the persisted list back.
  const { result: fresh } = renderHook(() => useSavedPlaces(() => 2000));
  expect(fresh.current.places.map((p) => p.name)).toEqual(["NDSM"]);

  act(() => fresh.current.toggle({ name: "NDSM", lat: 52.401, lon: 4.8935 }));
  expect(fresh.current.places).toHaveLength(0);
});

test("a tiny pin nudge maps to the same place key", () => {
  expect(placeKey(52.40101, 4.89351)).toBe(placeKey(52.40104, 4.89352));
});

test("corrupted storage falls back to empty", () => {
  window.localStorage.setItem("fov.savedPlaces.v1", "{not json");
  const { result } = renderHook(() => useSavedPlaces());
  expect(result.current.places).toEqual([]);
});
