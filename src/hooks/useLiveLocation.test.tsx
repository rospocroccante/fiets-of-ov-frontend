import { act, renderHook } from "@testing-library/react";
import { useLiveLocation } from "./useLiveLocation";

// Local copies of the hook's equirectangular constants so fixtures can speak in
// meters instead of magic decimal degrees.
const M_LAT = 110_574;
const mLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

// 60 m due north, then 60 m due east: exercises interpolation inside a segment,
// the corner (heading flips 0 -> 90) and the clamp at the end (total 120 m).
const A: [number, number] = [52, 4];
const B: [number, number] = [52 + 60 / M_LAT, 4];
const C: [number, number] = [B[0], 4 + 60 / mLon(B[0])];
// Stable identity: the hook restarts its replay when the points array changes.
const ROUTE: [number, number][] = [A, B, C];

describe("useLiveLocation (simulated)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("activation emits the first point synchronously", () => {
    const { result } = renderHook(() => useLiveLocation(true, { points: ROUTE }));
    const fix = result.current.fix;
    expect(fix).not.toBeNull();
    expect(fix!.lat).toBeCloseTo(A[0], 10);
    expect(fix!.lon).toBeCloseTo(A[1], 10);
    expect(fix!.accuracy).toBe(8);
    expect(fix!.speed).toBe(6); // default 6 m per default 1000 ms tick
    expect(fix!.heading).toBeCloseTo(0, 5); // first segment points due north
    expect(result.current.error).toBeNull();
  });

  test("ticks move strictly forward and cross onto the second segment", () => {
    const { result } = renderHook(() => useLiveLocation(true, { points: ROUTE }));

    act(() => vi.advanceTimersByTime(1000));
    const t1 = result.current.fix!;
    expect(t1.lat).toBeCloseTo(52 + 6 / M_LAT, 9); // 6 m north of the start
    expect(t1.lon).toBeCloseTo(4, 10);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.fix!.lat).toBeGreaterThan(t1.lat);

    // 11 ticks in total = 66 m: 6 m past the corner, heading due east.
    act(() => vi.advanceTimersByTime(9000));
    const t11 = result.current.fix!;
    expect(t11.lat).toBeCloseTo(B[0], 9);
    expect(t11.lon).toBeCloseTo(4 + 6 / mLon(B[0]), 9);
    expect(t11.heading).toBeCloseTo(90, 5);
  });

  test("stops at the last point and keeps emitting it", () => {
    const { result } = renderHook(() => useLiveLocation(true, { points: ROUTE }));
    act(() => vi.advanceTimersByTime(30_000)); // 180 m walked on a 120 m route
    const end = result.current.fix!;
    expect(end.lat).toBeCloseTo(C[0], 9);
    expect(end.lon).toBeCloseTo(C[1], 9);

    act(() => vi.advanceTimersByTime(1000));
    const later = result.current.fix!;
    expect(later).not.toBe(end); // a fresh emission, not a stale object
    expect(later.lat).toBeCloseTo(C[0], 9);
    expect(later.lon).toBeCloseTo(C[1], 9);
  });

  test("honours custom stepM and intervalMs", () => {
    const { result } = renderHook(() =>
      useLiveLocation(true, { points: ROUTE, stepM: 30, intervalMs: 500 }),
    );
    expect(result.current.fix!.speed).toBe(60); // 30 m per 0.5 s
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.fix!.lat).toBeCloseTo(52 + 30 / M_LAT, 9);
  });

  test("deactivating clears the fix and stops the timer", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useLiveLocation(active, { points: ROUTE }),
      { initialProps: { active: true } },
    );
    expect(result.current.fix).not.toBeNull();

    rerender({ active: false });
    expect(result.current.fix).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.fix).toBeNull();
  });
});

describe("useLiveLocation (real geolocation)", () => {
  afterEach(() => {
    // Stubs are added with configurable: true; remove them so other files see the
    // bare jsdom navigator again.
    delete (navigator as { geolocation?: unknown }).geolocation;
  });

  function stubGeolocation() {
    const cbs: { ok?: PositionCallback; err?: PositionErrorCallback } = {};
    const clearWatch = vi.fn();
    const watchPosition = vi.fn(
      (ok: PositionCallback, err?: PositionErrorCallback | null, _opts?: PositionOptions) => {
        cbs.ok = ok;
        cbs.err = err ?? undefined;
        return 42;
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition, clearWatch },
      configurable: true,
    });
    return { watchPosition, clearWatch, cbs };
  }

  function positionOf(
    over: Partial<{ heading: number | null; speed: number | null }>,
    timestamp = 1_700_000_000_000,
  ): GeolocationPosition {
    return {
      coords: {
        latitude: 52.37,
        longitude: 4.9,
        accuracy: 12,
        heading: null,
        speed: null,
        altitude: null,
        altitudeAccuracy: null,
        ...over,
      },
      timestamp,
    } as unknown as GeolocationPosition;
  }

  function geoErrorOf(code: number): GeolocationPositionError {
    return { code, message: "" } as unknown as GeolocationPositionError;
  }

  test("maps positions to fixes and clears the watch on unmount", () => {
    const geo = stubGeolocation();
    const { result, unmount } = renderHook(() => useLiveLocation(true));

    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(geo.watchPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10_000,
    });

    // A NaN heading (Android often reports it while standing still) becomes null.
    act(() => geo.cbs.ok!(positionOf({ heading: NaN, speed: 4.2 })));
    expect(result.current.fix).toEqual({
      lat: 52.37,
      lon: 4.9,
      accuracy: 12,
      heading: null,
      speed: 4.2,
      at: 1_700_000_000_000,
    });

    unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
  });

  test("errors set a short message but keep the last fix", () => {
    const geo = stubGeolocation();
    const { result } = renderHook(() => useLiveLocation(true));

    act(() => geo.cbs.ok!(positionOf({})));
    act(() => geo.cbs.err!(geoErrorOf(2)));
    expect(result.current.error).toBe("location unavailable");
    expect(result.current.fix?.lat).toBe(52.37);

    act(() => geo.cbs.err!(geoErrorOf(1)));
    expect(result.current.error).toBe("location permission denied");

    // A fresh position clears the error again.
    act(() => geo.cbs.ok!(positionOf({})));
    expect(result.current.error).toBeNull();
  });

  test("missing geolocation API reports 'location not supported'", () => {
    // jsdom's navigator has no geolocation and no stub is installed here.
    const { result } = renderHook(() => useLiveLocation(true));
    expect(result.current.error).toBe("location not supported");
    expect(result.current.fix).toBeNull();
  });

  test("inactive: no watch is started", () => {
    const geo = stubGeolocation();
    const { result } = renderHook(() => useLiveLocation(false));
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(result.current.fix).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
