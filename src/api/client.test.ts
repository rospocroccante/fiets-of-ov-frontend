import { vi } from "vitest";
import { liveGetAdvice, liveGetStops } from "./client";

test("liveGetAdvice calls the advice endpoint and returns json", async () => {
  const payload = {
    recommendation: "bike",
    reason: "x",
    bike_minutes: 10,
    transit_minutes: 12,
    max_rain_mm_per_h: 0,
    rain_expected: false,
  };
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fetchMock);

  const a = await liveGetAdvice("Centraal", "Vondelpark");
  expect(a.bike_minutes).toBe(10);
  const calledUrl = fetchMock.mock.calls[0][0] as string;
  expect(calledUrl).toContain("/api/v1/advice");
  expect(calledUrl).toContain("from=Centraal");
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
