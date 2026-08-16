import { vi } from "vitest";
import { ApiError, liveGetPlan, liveGetStops } from "./client";

// What a fetch rejection looks like when AbortSignal.timeout fires (and the older
// engines that still report a plain AbortError for the same thing).
function abortRejection(name: "TimeoutError" | "AbortError"): Error {
  const e = new Error("The operation was aborted");
  e.name = name;
  return e;
}

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

test("live requests carry a deadline, so a hung backend cannot load forever", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => PLAN });
  vi.stubGlobal("fetch", fetchMock);

  await liveGetPlan("a", "b");
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(init.signal).toBeDefined();
  expect(init.signal?.aborted).toBe(false);
  vi.unstubAllGlobals();
});

test.each(["TimeoutError", "AbortError"] as const)(
  "liveGetPlan reports a %s as a timeout the user can act on",
  async (name) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortRejection(name)));

    const error = await liveGetPlan("a", "b").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("timeout");
    expect((error as ApiError).message).toBe("the routing service did not answer in time");
    vi.unstubAllGlobals();
  },
);

test("a timeout and an http error do not tell the user the same thing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortRejection("TimeoutError")));
  const timedOut = (await liveGetPlan("a", "b").catch((e: unknown) => e)) as ApiError;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: "no route found" }) }),
  );
  const rejected = (await liveGetPlan("a", "b").catch((e: unknown) => e)) as ApiError;

  expect(timedOut.kind).toBe("timeout");
  expect(rejected.kind).toBe("http");
  expect(timedOut.message).not.toBe(rejected.message);
  vi.unstubAllGlobals();
});

test("liveGetPlan reports an unreachable backend as a network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

  const error = (await liveGetPlan("a", "b").catch((e: unknown) => e)) as ApiError;
  expect(error.kind).toBe("network");
  expect(error.message).toBe("could not reach the routing service");
  vi.unstubAllGlobals();
});

test("a caller's own abort is passed through, not relabelled as a timeout", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(abortRejection("AbortError"));
    }),
  );

  const error = await liveGetPlan("a", "b", controller.signal).catch((e: unknown) => e);
  expect(error).not.toBeInstanceOf(ApiError);
  expect((error as Error).name).toBe("AbortError");
  vi.unstubAllGlobals();
});

test("an html page from a static host is reported as a bad response, not a parse error", async () => {
  // What a live build actually gets when it is deployed with nothing serving /api.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token '<', \"<!doctype \"... is not valid JSON");
      },
    }),
  );

  const error = (await liveGetPlan("a", "b").catch((e: unknown) => e)) as ApiError;
  expect(error.kind).toBe("shape");
  expect(error.message).toBe("unexpected server response");
  vi.unstubAllGlobals();
});

test("a stops timeout degrades to no stops instead of taking the plan down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortRejection("TimeoutError")));
  await expect(liveGetStops(52.36, 4.88, 500)).resolves.toEqual([]);
  vi.unstubAllGlobals();
});
