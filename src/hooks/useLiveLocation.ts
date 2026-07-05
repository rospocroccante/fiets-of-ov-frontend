import { useEffect, useState } from "react";

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number; // meters
  heading: number | null; // degrees clockwise from north; NaN from the API -> null
  speed: number | null; // m/s
  at: number; // epoch ms
}

export interface Simulation {
  points: [number, number][]; // route to replay
  intervalMs?: number; // default 1000
  stepM?: number; // meters advanced per tick; default 6 (bike pace at 1 s ticks)
}

// Equirectangular meter helpers: deliberate tiny copies of routeProgress's private
// ones, so that lib keeps its internals private. Error at city scale is far below
// GPS accuracy.
const M_LAT = 110_574;
const mLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function distM(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * M_LAT;
  const dx = (b[1] - a[1]) * mLon((a[0] + b[0]) / 2);
  return Math.hypot(dx, dy);
}

// Compass bearing of a -> b in degrees (0 = north, 90 = east).
function bearingDeg(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * M_LAT;
  const dx = (b[1] - a[1]) * mLon((a[0] + b[0]) / 2);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

// Live position for navigation: wraps geolocation.watchPosition, or replays a route
// at a steady pace when `simulate` is given (mock mode / demo). GPS errors keep the
// last fix so a transient dropout does not blank the dot.
export function useLiveLocation(
  active: boolean,
  simulate?: Simulation,
): { fix: Fix | null; error: string | null } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Destructured up front so the effect restarts only when the route or pace really
  // changes, not whenever the caller re-creates the options object.
  const points = simulate?.points;
  const intervalMs = simulate?.intervalMs ?? 1000;
  const stepM = simulate?.stepM ?? 6;

  useEffect(() => {
    if (!active) {
      setFix(null);
      setError(null);
      return;
    }

    if (points) {
      if (points.length === 0) return;
      const cum = [0];
      for (let i = 1; i < points.length; i++) {
        cum.push(cum[i - 1] + distM(points[i - 1], points[i]));
      }
      const total = cum[cum.length - 1];
      const speed = stepM / (intervalMs / 1000);

      let traveled = 0;
      let seg = 0; // cursor: traveled only grows, so each emit resumes the scan here

      const emit = () => {
        if (points.length === 1 || total === 0) {
          const [lat, lon] = points[0];
          setFix({ lat, lon, accuracy: 8, heading: null, speed, at: Date.now() });
          return;
        }
        // Clamp at the end: the simulator stops at (and keeps emitting) the last point.
        const d = Math.min(traveled, total);
        while (seg < points.length - 2 && d >= cum[seg + 1]) seg++;
        const a = points[seg];
        const b = points[seg + 1];
        const len = cum[seg + 1] - cum[seg];
        // Zero-length segments were skipped above unless the whole tail is degenerate.
        const t = len > 0 ? (d - cum[seg]) / len : 0;
        setFix({
          lat: a[0] + t * (b[0] - a[0]),
          lon: a[1] + t * (b[1] - a[1]),
          accuracy: 8,
          heading: bearingDeg(a, b),
          speed,
          at: Date.now(),
        });
      };

      // First fix synchronously: the dot (and tests) must not wait a whole tick.
      emit();
      const id = setInterval(() => {
        traveled += stepM;
        emit();
      }, intervalMs);
      return () => clearInterval(id);
    }

    if (!("geolocation" in navigator)) {
      setError("location not supported");
      return;
    }
    const geo = navigator.geolocation;
    const id = geo.watchPosition(
      (pos) => {
        const c = pos.coords;
        setFix({
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy,
          heading: c.heading == null || Number.isNaN(c.heading) ? null : c.heading,
          speed: c.speed ?? null,
          at: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(err.code === 1 ? "location permission denied" : "location unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10_000 },
    );
    return () => geo.clearWatch(id);
  }, [active, points, intervalMs, stepM]);

  return { fix, error };
}
