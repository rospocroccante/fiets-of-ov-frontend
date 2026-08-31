import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { UseMyLocationButton } from "./UseMyLocationButton";

// ---------------------------------------------------------------------------
// Navigator geolocation stubs
// ---------------------------------------------------------------------------

type SuccessCallback = (pos: {
  coords: { latitude: number; longitude: number; accuracy: number };
}) => void;
type ErrorCallback = (err: {
  code: number;
  PERMISSION_DENIED: number;
  POSITION_UNAVAILABLE: number;
  TIMEOUT: number;
}) => void;

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

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: {},
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UseMyLocationButton", () => {
  it("calls onLocated with precise coords and a label (Vondelpark mock) when GPS succeeds", async () => {
    // Vondelpark coordinates — the mock reverseGeocode recognises these.
    stubGeoSuccess(52.358, 4.8686, 20);
    const onLocated = vi.fn();

    render(<UseMyLocationButton onLocated={onLocated} />);

    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    const ep = await vi.waitFor(() => {
      expect(onLocated).toHaveBeenCalledTimes(1);
      return onLocated.mock.calls[0][0];
    });

    // query must be the toFixed(6) coordinate string
    expect(ep.query).toBe("52.358000,4.868600");
    // label should come from mock reverseGeocode — which recognises Vondelpark
    expect(ep.label).toMatch(/vondelpark/i);
  });

  it("shows an amber warning when accuracy exceeds 100 m (800 m)", async () => {
    stubGeoSuccess(52.358, 4.8686, 800);
    const onLocated = vi.fn();

    render(<UseMyLocationButton onLocated={onLocated} />);

    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    // Wait for onLocated to confirm the click resolved
    await vi.waitFor(() => expect(onLocated).toHaveBeenCalledTimes(1));

    // Amber status line
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("±800m");
  });

  it("shows a red alert when the user denies location permission (code 1)", async () => {
    stubGeoError(1);
    const onLocated = vi.fn();

    render(<UseMyLocationButton onLocated={onLocated} />);

    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.length).toBeGreaterThan(0);
    // onLocated must NOT have been called
    expect(onLocated).not.toHaveBeenCalled();
  });

  it("delivers through the sink captured when the locate began, not through onLocated", async () => {
    stubGeoSuccess(52.358, 4.8686, 20);
    const onLocated = vi.fn();
    const sink = vi.fn();
    const beginLocate = vi.fn(() => sink);

    render(<UseMyLocationButton onLocated={onLocated} beginLocate={beginLocate} />);
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1));
    // beginLocate runs before the first await, so the owner can claim its race guard at click time; the fix then flows through that sink alone, which is what lets App drop a fix the user typed over.
    expect(beginLocate).toHaveBeenCalledTimes(1);
    expect(onLocated).not.toHaveBeenCalled();
    expect(sink.mock.calls[0][0].label).toMatch(/vondelpark/i);
  });
});
