import { fireEvent, render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MapView } from "./MapView";
import {
  __fireMapClick,
  __fireMapContextMenu,
  __fireMarkerDragEnd,
} from "../__mocks__/react-leaflet";
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

test("dragging the start pin calls onMovePoint with start + lat/lon", () => {
  const moves: Array<[string, { lat: number; lon: number }]> = [];
  renderMap(
    <MapView
      origin={{ lat: 52.379, lon: 4.9 }}
      destination={{ lat: 52.358, lon: 4.868 }}
      stops={[]}
      route={null}
      onMovePoint={(which, c) => moves.push([which, c])}
    />
  );
  __fireMarkerDragEnd("start", 52.36, 4.9);
  expect(moves).toEqual([["start", { lat: 52.36, lon: 4.9 }]]);
});

test("dragging the end pin calls onMovePoint with end + lat/lon", () => {
  const moves: Array<[string, { lat: number; lon: number }]> = [];
  renderMap(
    <MapView
      origin={{ lat: 52.379, lon: 4.9 }}
      destination={{ lat: 52.358, lon: 4.868 }}
      stops={[]}
      route={null}
      onMovePoint={(which, c) => moves.push([which, c])}
    />
  );
  __fireMarkerDragEnd("end", 52.36, 4.9);
  expect(moves).toEqual([["end", { lat: 52.36, lon: 4.9 }]]);
});

test("right-click opens a menu; 'from here' fires onContextPick('start') and closes", () => {
  const picks: Array<[string, { lat: number; lon: number }]> = [];
  renderMap(
    <MapView
      origin={null}
      destination={null}
      stops={[]}
      route={null}
      onContextPick={(which, c) => picks.push([which, c])}
    />
  );
  act(() => __fireMapContextMenu(52.36, 4.9, 10, 20));
  const fromHere = screen.getByRole("button", { name: /directions from here/i });
  fireEvent.click(fromHere);
  expect(picks).toEqual([["start", { lat: 52.36, lon: 4.9 }]]);
  // Menu closes after a choice.
  expect(screen.queryByRole("button", { name: /directions from here/i })).toBeNull();
});

test("right-click menu 'to here' fires onContextPick('end') and closes", () => {
  const picks: Array<[string, { lat: number; lon: number }]> = [];
  renderMap(
    <MapView
      origin={null}
      destination={null}
      stops={[]}
      route={null}
      onContextPick={(which, c) => picks.push([which, c])}
    />
  );
  act(() => __fireMapContextMenu(52.36, 4.9, 10, 20));
  const toHere = screen.getByRole("button", { name: /directions to here/i });
  fireEvent.click(toHere);
  expect(picks).toEqual([["end", { lat: 52.36, lon: 4.9 }]]);
  expect(screen.queryByRole("button", { name: /directions to here/i })).toBeNull();
});

test("renders without error when interactive={false}", () => {
  const { container } = renderMap(
    <MapView
      origin={null}
      destination={null}
      stops={[]}
      route={null}
      interactive={false}
    />
  );
  expect(container.querySelector(".leaflet-container")).toBeTruthy();
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
  fireEvent.click(btn);
  expect(btn).toHaveAttribute("aria-pressed", "false");
});
