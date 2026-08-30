import { describe, it, expect, afterEach } from "vitest";
import { getCurrentPosition, geoErrorMessage, accuracyWarning, GeoError } from "./geolocate";

// ---------------------------------------------------------------------------
// Helpers to stub navigator.geolocation
// ---------------------------------------------------------------------------

type SuccessCallback = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type ErrorCallback = (err: { code: number; PERMISSION_DENIED: number; POSITION_UNAVAILABLE: number; TIMEOUT: number }) => void;

function stubGeoSuccess(lat: number, lon: number, accuracy: number) {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      geolocation: {
        getCurrentPosition: (ok: SuccessCallback) => {
          ok({ coords: { latitude: lat, longitude: lon, accuracy } });
        },
      },
    },
    writable: true,
    configurable: true,
  });
}

function stubGeoError(code: number) {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      geolocation: {
        getCurrentPosition: (_ok: SuccessCallback, err: ErrorCallback) => {
          err({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        },
      },
    },
    writable: true,
    configurable: true,
  });
}

function stubNoGeolocation() {
  Object.defineProperty(globalThis, "navigator", {
    value: {},
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCurrentPosition", () => {
  afterEach(() => {
    // Restore a neutral navigator so other tests are not affected.
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("resolves a Fix with lat, lon, accuracy on success", async () => {
    stubGeoSuccess(52.358, 4.8686, 20);
    const fix = await getCurrentPosition();
    expect(fix.lat).toBe(52.358);
    expect(fix.lon).toBe(4.8686);
    expect(fix.accuracy).toBe(20);
  });

  it("rejects with kind 'denied' when error code is 1 (PERMISSION_DENIED)", async () => {
    stubGeoError(1);
    await expect(getCurrentPosition()).rejects.toMatchObject({ kind: "denied" });
  });

  it("rejects with kind 'timeout' when error code is 3 (TIMEOUT)", async () => {
    stubGeoError(3);
    await expect(getCurrentPosition()).rejects.toMatchObject({ kind: "timeout" });
  });

  it("rejects with kind 'unavailable' for other error codes (POSITION_UNAVAILABLE = 2)", async () => {
    stubGeoError(2);
    await expect(getCurrentPosition()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects with kind 'unsupported' when navigator.geolocation is missing", async () => {
    stubNoGeolocation();
    await expect(getCurrentPosition()).rejects.toMatchObject({ kind: "unsupported" });
  });
});

// ---------------------------------------------------------------------------

describe("accuracyWarning", () => {
  it("returns null for accuracy <= 100m", () => {
    expect(accuracyWarning(50)).toBeNull();
    expect(accuracyWarning(100)).toBeNull();
  });

  it("returns a warning string containing '+-<N>m' for accuracy > 100m", () => {
    const msg = accuracyWarning(500);
    expect(msg).not.toBeNull();
    expect(msg).toContain("±500m");
  });

  it("rounds the accuracy value in the warning", () => {
    const msg = accuracyWarning(123.7);
    expect(msg).not.toBeNull();
    expect(msg).toContain("±124m");
  });
});

// ---------------------------------------------------------------------------

describe("geoErrorMessage", () => {
  it("mentions 'permission' for kind 'denied'", () => {
    const msg = geoErrorMessage(new GeoError("denied", "denied"));
    expect(msg.toLowerCase()).toMatch(/permission/);
  });

  it("mentions timeout for kind 'timeout'", () => {
    const msg = geoErrorMessage(new GeoError("timeout", "timeout"));
    expect(msg.toLowerCase()).toMatch(/timeout|timed out|time/);
  });

  it("returns a fallback message for non-GeoError errors", () => {
    const msg = geoErrorMessage(new Error("network error"));
    expect(msg.toLowerCase()).toContain("unavailable");
  });

  it("handles kind 'unsupported'", () => {
    const msg = geoErrorMessage(new GeoError("unsupported", "unsupported"));
    expect(msg.length).toBeGreaterThan(0);
  });

  it("handles kind 'unavailable'", () => {
    const msg = geoErrorMessage(new GeoError("unavailable", "unavailable"));
    expect(msg.length).toBeGreaterThan(0);
  });
});
