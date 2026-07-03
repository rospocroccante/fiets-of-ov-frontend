import { vi } from "vitest";
import { liveGetPlan, liveGetStops } from "./client";

const PLAN = {
  recommendation: "bike",
  reason: "dry",
  max_rain_mm_per_h: 0,
  rain_expected: false,
  origin: { name: null, lat: 52.37, lon: 4.89 },
  destination: { name: null, lat: 52.4, lon: 4.9 },
  options: [],
};

test("liveGetPlan calls the plan endpoint with encoded from/to and returns json", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => PLAN });
  vi.stubGlobal("fetch", fetchMock);

  const plan = await liveGetPlan("Amsterdam Zuid", "NDSM werf");
  expect(plan.recommendation).toBe("bike");
  const calledUrl = fetchMock.mock.calls[0][0] as string;
  expect(calledUrl).toContain("/api/v1/plan");
  expect(calledUrl).toContain("from=Amsterdam%20Zuid");
  expect(calledUrl).toContain("to=NDSM%20werf");
  vi.unstubAllGlobals();
});

test("liveGetPlan surfaces the backend's error detail on a non-ok response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "no route found between these points" }),
    }),
  );
  await expect(liveGetPlan("a", "b")).rejects.toThrow("no route found between these points");
  vi.unstubAllGlobals();
});

test("liveGetPlan falls back to a generic message when the error body is not json", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    }),
  );
  await expect(liveGetPlan("a", "b")).rejects.toThrow("plan unavailable");
  vi.unstubAllGlobals();
});

test("liveGetPlan rejects a drifted response shape with a readable error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ recommendation: "bike" }) }),
  );
  await expect(liveGetPlan("a", "b")).rejects.toThrow("unexpected server response");
  vi.unstubAllGlobals();
});

test("liveGetStops requests the stops endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetchMock);
  await liveGetStops(52.36, 4.88, 500);
  const calledUrl = fetchMock.mock.calls[0][0] as string;
  expect(calledUrl).toContain("/api/v1/stops");
  expect(calledUrl).toContain("lat=52.36");
  vi.unstubAllGlobals();
});
