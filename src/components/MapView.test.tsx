import { fireEvent, render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MapView } from "./MapView";
import {
  __fireMapClick,
  __fireMapContextMenu,
  __fireMarkerDragEnd,
  __mapCalls,
  __mapContainerProps,
  __wheelZoom,
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

test("Escape closes the context menu (clicking the map would also drop a pin)", () => {
  renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} onContextPick={() => {}} />
  );
  act(() => __fireMapContextMenu(52.36, 4.9, 10, 20));
  expect(screen.getByRole("button", { name: /directions from here/i })).toBeInTheDocument();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("button", { name: /directions from here/i })).toBeNull();
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

test("interactive prop drives wheel zoom imperatively (options are frozen at mount)", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (interactive: boolean) => (
    <QueryClientProvider client={client}>
      <MapView origin={null} destination={null} stops={[]} route={null} interactive={interactive} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(false));
  expect(__wheelZoom.enabled).toBe(false);
  // The morph completes: the same mounted map must gain wheel zoom.
  rerender(view(true));
  expect(__wheelZoom.enabled).toBe(true);
});

test("radar readout (legend) renders only when radar+rain are enabled via props", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ host: "https://tc.test", radar: { past: [], nowcast: [] } }),
    })),
  );
  // Radar off by default: no legend on the map. The toggle now lives in the filter bar,
  // so MapView only reflects the radar/wLayers props it is handed.
  const { unmount } = renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} />,
  );
  expect(screen.queryByText("light")).toBeNull();
  unmount();

  // Radar + rain on: the intensity legend is the cue the layer is live even on a dry day.
  renderMap(
    <MapView
      origin={null}
      destination={null}
      stops={[]}
      route={null}
      radar
      wLayers={{ rain: true, wind: true }}
    />,
  );
  expect(screen.getByText("light")).toBeInTheDocument();
});

test("weather layers pause while the map is not interactive (hidden behind the home)", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ host: "https://tc.test", radar: { past: [], nowcast: [] } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  renderMap(
    <MapView
      origin={null}
      destination={null}
      stops={[]}
      route={null}
      radar
      wLayers={{ rain: true, wind: true }}
      interactive={false}
    />,
  );
  // No readout on screen and no weather fetches while invisible.
  expect(screen.queryByText("light")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("liveFix renders the position dot and its accuracy circle", () => {
  const { container, unmount } = renderMap(
    <MapView
      origin={null}
      destination={null}
      stops={[]}
      route={null}
      liveFix={{ lat: 52.37, lon: 4.89, accuracy: 25 }}
    />,
  );
  expect(container.querySelector(".leaflet-circle-marker")).toBeTruthy();
  expect(container.querySelector(".leaflet-circle")).toBeTruthy();
  unmount();

  // No fix: no dot (stops are empty, so no other circle markers can mask this).
  const { container: bare } = renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} />,
  );
  expect(bare.querySelector(".leaflet-circle-marker")).toBeNull();
  expect(bare.querySelector(".leaflet-circle")).toBeNull();
});

test("while navigating, the route refit is suppressed and the camera follows the fix", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (fix: { lat: number; lon: number; accuracy: number }) => (
    <QueryClientProvider client={client}>
      <MapView
        origin={{ lat: 52.379, lon: 4.9 }}
        destination={{ lat: 52.358, lon: 4.868 }}
        stops={[]}
        route={route}
        navigating
        liveFix={fix}
      />
    </QueryClientProvider>
  );
  const fitBefore = __mapCalls.fitBounds;
  const flyBoundsBefore = __mapCalls.flyToBounds;
  const setViewBefore = __mapCalls.setView;
  const panBefore = __mapCalls.panTo;
  const { rerender } = render(view({ lat: 52.379, lon: 4.9, accuracy: 10 }));
  // FitRoute is inactive while navigating (a replan must not snap the camera away);
  // FollowCamera did the one activation setView instead.
  expect(__mapCalls.fitBounds).toBe(fitBefore);
  expect(__mapCalls.flyToBounds).toBe(flyBoundsBefore);
  expect(__mapCalls.setView).toBe(setViewBefore + 1);
  // Each new fix pans; it does not re-run the zooming setView.
  rerender(view({ lat: 52.3785, lon: 4.899, accuracy: 10 }));
  expect(__mapCalls.panTo).toBe(panBefore + 1);
  expect(__mapCalls.setView).toBe(setViewBefore + 1);
});

test("no tile or data credit is drawn on or beside the map", () => {
  // The owner asked for the basemap credit gone from the map, twice. Leaflet's own
  // control puts one back the moment attributionControl stops being false, so the option
  // is asserted rather than the control: this suite runs against the react-leaflet mock,
  // which renders a plain div and never builds a control, so querying the DOM for one
  // passes whether the option is there or not. It is the browser suite that reads the
  // real map (browser-tests/specs/basemap.checks.mjs), and this is the same guard at the
  // level jsdom can see.
  //
  // MapLibre's own control is NOT a second way in, whatever it looks like:
  // @maplibre/maplibre-gl-leaflet forces attributionControl: false onto every GL map it
  // builds (leaflet-maplibre-gl.js:156), so `.maplibregl-ctrl-attrib` cannot appear
  // through this bridge and an assertion against it would guard nothing. The option in
  // lib/basemapGL is still worth setting: it is also what stops the bridge harvesting
  // source attributions into Leaflet's control.
  const { container } = renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} />
  );
  expect(__mapContainerProps.last?.attributionControl).toBe(false);
  expect(screen.queryByRole("note", { name: /map data sources/i })).toBeNull();
  expect(container.querySelector(".leaflet-control-attribution")).toBeNull();
  expect(container.textContent).not.toMatch(/OpenStreetMap|CARTO|OpenFreeMap|OpenMapTiles/i);
});

// ---------------------------------------------------------------------------
// Reset the view
// ---------------------------------------------------------------------------

test("the reset button puts the whole route back on screen", () => {
  renderMap(
    <MapView
      origin={{ lat: 52.379, lon: 4.9 }}
      destination={{ lat: 52.358, lon: 4.868 }}
      stops={[]}
      route={route}
    />
  );
  // FitRoute already fitted once on mount, so only the delta from the click counts.
  // The refit flies (animated) rather than snapping - same camera, smoother ride.
  const before = __mapCalls.flyToBounds;
  fireEvent.click(screen.getByRole("button", { name: /whole trip/i }));
  expect(__mapCalls.flyToBounds).toBe(before + 1);
});

test("with nothing planned the reset button goes back to the city", () => {
  renderMap(<MapView origin={null} destination={null} stops={[]} route={null} />);
  // The automatic refit deliberately leaves an empty map alone, so nothing has moved
  // the camera yet and this really is the button's own call. It flies back to the
  // city: from wherever the user wandered off to, the return is animated, not a snap.
  const before = __mapCalls.flyTo;
  fireEvent.click(screen.getByRole("button", { name: /whole trip/i }));
  expect(__mapCalls.flyTo).toBe(before + 1);
});

test("an empty map is left where the user put it until they ask for the reset", () => {
  // The guard that keeps panning usable: FitRoute runs on every plan change, and if it
  // recentred with nothing to show, a pan across an unplanned map would spring back.
  const before = {
    fit: __mapCalls.fitBounds,
    view: __mapCalls.setView,
    fly: __mapCalls.flyTo,
    flyBounds: __mapCalls.flyToBounds,
  };
  const { rerender } = renderMap(
    <MapView origin={null} destination={null} stops={[]} route={null} />
  );
  rerender(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MapView origin={null} destination={null} stops={[]} route={null} />
    </QueryClientProvider>
  );
  expect(__mapCalls.fitBounds).toBe(before.fit);
  expect(__mapCalls.setView).toBe(before.view);
  expect(__mapCalls.flyTo).toBe(before.fly);
  expect(__mapCalls.flyToBounds).toBe(before.flyBounds);
});
