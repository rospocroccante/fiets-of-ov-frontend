import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MapView } from "./MapView";
import { __fireMapClick } from "../__mocks__/react-leaflet";
import type { Itinerary } from "../api/types";

// MapView hosts the rain-radar hook (react-query), so every render needs a client.
function renderMap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const route: Itinerary = {
  minutes: 10,
  distance_m: 1000,
  start_time: 0,
  end_time: 600000,
  legs: [
    {
      mode: "BICYCLE",
      minutes: 10,
      distance_m: 1000,
      route: null,
      route_long_name: null,
      headsign: null,
      from: { name: "A", lat: 52.379, lon: 4.9 },
      to: { name: "B", lat: 52.358, lon: 4.868 },
      geometry: null,
      start_time: 0,
      end_time: 600000,
      steps: [],
    },
  ],
};

test("renders a leaflet container with a route", () => {
  const { container } = renderMap(
    <MapView
      origin={{ lat: 52.379, lon: 4.9 }}
      destination={{ lat: 52.358, lon: 4.868 }}
      stops={[]}
      route={route}
    />
  );
  expect(container.querySelector(".leaflet-container")).toBeTruthy();
});

test("renders without a route", () => {
  const { container } = renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} />
  );
  expect(container.querySelector(".leaflet-container")).toBeTruthy();
});

test("clicking the map calls onPick with lat/lon (lng mapped to lon)", () => {
  const picks: Array<{ lat: number; lon: number }> = [];
  renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} onPick={(c) => picks.push(c)} picking />
  );
  __fireMapClick(52.36, 4.89);
  expect(picks).toEqual([{ lat: 52.36, lon: 4.89 }]);
});

test("without onPick, firing a map click is a no-op (no handler registered)", () => {
  renderMap(<MapView origin={null} destination={null} stops={[]} route={null} />);
  // Should not throw; no handler registered by MapView this render.
  expect(() => __fireMapClick(52.36, 4.89)).not.toThrow();
});

test("radar toggle switches mixed mode on and off", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ host: "https://tc.test", radar: { past: [], nowcast: [] } }),
    })),
  );
  renderMap(<MapView origin={null} destination={null} stops={[]} route={null} />);
  const btn = screen.getByRole("button", { name: "Radar" });
  expect(btn).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(btn);
  expect(btn).toHaveAttribute("aria-pressed", "true");
  // Legend is the cue that the layer is live even on a dry (fully transparent) day.
  expect(screen.getByText("light")).toBeInTheDocument();
  // Per-layer chips appear with the master toggle.
  expect(screen.getByRole("button", { name: "Rain" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Wind" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Clouds" })).toBeNull();
  fireEvent.click(btn);
  expect(btn).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByText("light")).toBeNull();
});
