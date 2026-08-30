import { renderHook, act } from "@testing-library/react";
import { useRecentTrips } from "./useRecentTrips";

beforeEach(() => window.localStorage.clear());

const trip = (n: number) => ({
  fromLabel: `From ${n}`,
  fromQuery: `f${n}`,
  toLabel: `To ${n}`,
  toQuery: `t${n}`,
});

test("records newest-first, dedupes on the query pair, caps at 8", () => {
  let t = 0;
  const { result } = renderHook(() => useRecentTrips(() => ++t));
  act(() => {
    for (let i = 0; i < 10; i++) result.current.record(trip(i));
  });
  expect(result.current.trips).toHaveLength(8);
  expect(result.current.trips[0].fromLabel).toBe("From 9");

  // Re-running trip 5 moves it to the top without duplicating it.
  act(() => result.current.record(trip(5)));
  expect(result.current.trips[0].fromLabel).toBe("From 5");
  expect(result.current.trips.filter((r) => r.fromQuery === "f5")).toHaveLength(1);
});

test("persists across instances and clears", () => {
  const { result } = renderHook(() => useRecentTrips(() => 1));
  act(() => result.current.record(trip(1)));

  const { result: fresh } = renderHook(() => useRecentTrips(() => 2));
  expect(fresh.current.trips).toHaveLength(1);
  act(() => fresh.current.clear());
  expect(fresh.current.trips).toEqual([]);

  const { result: after } = renderHook(() => useRecentTrips(() => 3));
  expect(after.current.trips).toEqual([]);
});
