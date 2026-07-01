import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { HomeHero } from "./HomeHero";
import type { TripDraft } from "../trip";

// ---------------------------------------------------------------------------
// Geolocation stub helpers
// ---------------------------------------------------------------------------

type SuccessCallback = (pos: {
  coords: { latitude: number; longitude: number; accuracy: number };
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

describe("HomeHero", () => {
  it("renders wordmark and headline", () => {
    render(<HomeHero onSearch={() => {}} />);
    expect(screen.getByText("Fiets of OV")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("typing From and To then searching calls onSearch with TripDraft", () => {
    const onSearch = vi.fn();
    render(<HomeHero onSearch={onSearch} />);

    fireEvent.change(screen.getByPlaceholderText("From"), {
      target: { value: "Centraal" },
    });
    fireEvent.change(screen.getByPlaceholderText("To"), {
      target: { value: "Vondelpark" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    const draft: TripDraft = onSearch.mock.calls[0][0];
    expect(draft.from).toEqual({ label: "Centraal", query: "Centraal" });
    expect(draft.to).toEqual({ label: "Vondelpark", query: "Vondelpark" });
  });

  it("a popular-trip quick pick calls onSearch once with from.label and to.label", () => {
    const onSearch = vi.fn();
    render(<HomeHero onSearch={onSearch} />);

    // popular trip buttons have aria-label like "Amsterdam Centraal → Vondelpark"
    const popularButtons = screen.getAllByRole("button", { name: /Amsterdam Centraal/i });
    fireEvent.click(popularButtons[0]);

    expect(onSearch).toHaveBeenCalledTimes(1);
    const draft: TripDraft = onSearch.mock.calls[0][0];
    expect(draft).toHaveProperty("from.label");
    expect(draft).toHaveProperty("to.label");
  });

  it("GPS on From fills the field with a name and sends coordinates as query", async () => {
    // Vondelpark coordinates — mock reverseGeocode recognises these
    stubGeoSuccess(52.358, 4.8686, 20);
    const onSearch = vi.fn();
    render(<HomeHero onSearch={onSearch} />);

    // Click the GPS button next to the From field (first "Use my location" button)
    const gpsButtons = screen.getAllByRole("button", { name: /use my location/i });
    fireEvent.click(gpsButtons[0]);

    // Wait for onLocate to have resolved (reverseGeocode is async)
    await vi.waitFor(() => {
      const input = screen.getByPlaceholderText("From") as HTMLInputElement;
      expect(input.value.length).toBeGreaterThan(0);
    });

    // Fill To so search is not blocked
    fireEvent.change(screen.getByPlaceholderText("To"), {
      target: { value: "Centraal" },
    });

    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    const draft: TripDraft = onSearch.mock.calls[0][0];
    // The query must be the raw coordinate string, not the display name
    expect(draft.from.query).toMatch(/^52\.35/);
  });
});
