import React from "react";

type MapContainerProps = {
  children?: React.ReactNode;
  className?: string;
  attributionControl?: boolean;
  zoomControl?: boolean;
  maxZoom?: number;
};

// Test spy: the options the app asked the map for. This mock renders a plain div, so
// anything Leaflet would build out of these options (the attribution control above all)
// leaves no trace in the DOM to assert against, and a test that queried for it would
// pass with the option gone. The props themselves are the only truth available here.
export const __mapContainerProps: { last: MapContainerProps | null } = { last: null };

// The ref is handed the same object useMap() returns, so the imperative buttons that go
// through MapView's map ref (zoom to POIs, reset the view) reach the __mapCalls spies
// instead of no-opping against a null. It used to stay null, which meant clicking those
// buttons in a test did nothing and the test still passed. Callers must go on guarding
// per method: this object is a handful of counters, not an L.Map.
export const MapContainer = React.forwardRef<unknown, MapContainerProps>(
  function MapContainer(props, ref) {
    __mapContainerProps.last = props;
    const { children, className } = props;
    if (typeof ref === "function") ref(_map);
    else if (ref) ref.current = _map;
    return <div className={`leaflet-container ${className ?? ""}`.trim()}>{children}</div>;
  },
);

export function TileLayer() {
  return null;
}

// Circle markers render an identifiable span so tests can assert presence (the live
// position dot, stop dots); Circle mirrors it for the accuracy halo.
export function CircleMarker({ children }: { children?: React.ReactNode }) {
  return <span className="leaflet-circle-marker">{children}</span>;
}

export function Circle({ children }: { children?: React.ReactNode }) {
  return <span className="leaflet-circle">{children}</span>;
}

// What the ref of a Polyline gets: the slice of L.Polyline the route draw touches. The
// element is a real, detached SVG path, so the inline styles MapView puts on it can be
// read back; a test that wants the canvas case or a dashed leg changes the layer.
export interface MockPolylineLayer {
  options: { color?: string; dashArray?: string; opacity?: number };
  getElement: () => Element | undefined;
  setStyle: (style: { opacity?: number }) => void;
}

// Test spy: every Polyline on screen, in render order (the casings, then the legs).
export const __polylines: MockPolylineLayer[] = [];

export const Polyline = React.forwardRef<
  MockPolylineLayer,
  { children?: React.ReactNode; pathOptions?: MockPolylineLayer["options"] }
>(function Polyline({ children, pathOptions }, ref) {
  const [layer] = React.useState<MockPolylineLayer>(() => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    return {
      options: { ...pathOptions },
      getElement: () => el,
      setStyle(style) {
        Object.assign(this.options, style);
      },
    };
  });
  React.useImperativeHandle(ref, () => layer, [layer]);
  React.useLayoutEffect(() => {
    __polylines.push(layer);
    return () => {
      __polylines.splice(__polylines.indexOf(layer), 1);
    };
  }, [layer]);
  return <>{children}</>;
});

type MarkerEventHandlers = {
  dragend?: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => void;
};

const _markerHandlers = new Map<string, MarkerEventHandlers>();

export function Marker({
  children,
  title,
  eventHandlers,
}: {
  children?: React.ReactNode;
  title?: string;
  draggable?: boolean;
  eventHandlers?: MarkerEventHandlers;
}) {
  if (title !== undefined && eventHandlers !== undefined) {
    _markerHandlers.set(title, eventHandlers);
  }
  return <>{children}</>;
}

export function Popup({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>;
}

export function Tooltip({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>;
}

// Test spy: records the last scrollWheelZoom enable/disable driven through useMap.
export const __wheelZoom = { enabled: null as boolean | null };

// Test spy: counts imperative camera calls (FitRoute vs FollowCamera assertions).
// Tests should compare before/after deltas taken inside the test; __resetMapMock zeroes
// them between tests, so an absolute value only means anything within one case.
// lastBoundsOptions is the options object of the latest fitBounds or flyToBounds, which
// is where the padding that keeps a route clear of the results sheet shows up.
export const __mapCalls = {
  fitBounds: 0,
  setView: 0,
  panTo: 0,
  setZoom: 0,
  flyTo: 0,
  flyToBounds: 0,
  lastBoundsOptions: undefined as unknown,
};

// Test spy: whether MapView last showed or removed Leaflet's +/- control. The option on
// MapContainer only applies when the map is built, so MapView also adds and removes the
// control on the map itself, and this is where that lands. null: never touched.
export const __zoomControl = { shown: null as boolean | null };

// A single stable map object, like the real useMap: effects keyed on map identity
// must not re-fire every render.
const _map = {
  fitBounds: (_bounds?: unknown, options?: unknown) => {
    __mapCalls.fitBounds += 1;
    __mapCalls.lastBoundsOptions = options;
  },
  setView: () => {
    __mapCalls.setView += 1;
  },
  panTo: () => {
    __mapCalls.panTo += 1;
  },
  setZoom: () => {
    __mapCalls.setZoom += 1;
  },
  flyTo: () => {
    __mapCalls.flyTo += 1;
  },
  flyToBounds: (_bounds?: unknown, options?: unknown) => {
    __mapCalls.flyToBounds += 1;
    __mapCalls.lastBoundsOptions = options;
  },
  zoomControl: {
    remove: () => {
      __zoomControl.shown = false;
    },
    addTo: () => {
      __zoomControl.shown = true;
    },
    getContainer: (): HTMLElement | undefined => undefined,
  },
  scrollWheelZoom: {
    enable: () => {
      __wheelZoom.enabled = true;
    },
    disable: () => {
      __wheelZoom.enabled = false;
    },
  },
};

export function useMap() {
  return _map;
}

type MapHandlers = {
  click?: (e: { latlng: { lat: number; lng: number } }) => void;
  contextmenu?: (e: {
    latlng: { lat: number; lng: number };
    containerPoint: { x: number; y: number };
  }) => void;
};

let _handlers: MapHandlers = {};

export function useMapEvents(handlers: MapHandlers) {
  // Merge instead of replace: MapView mounts several subscribers (map events,
  // viewport tracker) and the test helpers must keep firing the click/contextmenu
  // handlers regardless of mount order.
  _handlers = { ..._handlers, ...handlers };
  return {};
}

// Test helper: simulate a user clicking the map at (lat, lng).
export function __fireMapClick(lat: number, lng: number): void {
  _handlers.click?.({ latlng: { lat, lng } });
}

// Test helper: simulate a right-click (contextmenu) on the map.
export function __fireMapContextMenu(lat: number, lng: number, x?: number, y?: number): void {
  _handlers.contextmenu?.({
    latlng: { lat, lng },
    containerPoint: { x: x ?? 0, y: y ?? 0 },
  });
}

// Test helper: simulate the dragend event on a named marker.
export function __fireMarkerDragEnd(which: string, lat: number, lng: number): void {
  const handlers = _markerHandlers.get(which);
  handlers?.dragend?.({ target: { getLatLng: () => ({ lat, lng }) } });
}

// Handlers are registered on render and never unregistered — a real Leaflet map drops
// them with the map instance, this mock has nowhere to hang that. So after a test
// unmounts, its closures are still in these two tables and __fireMapClick and friends
// keep "working": they call into a tree that no longer exists, which produces no error
// and no DOM change, so the next test's failure reads as a timeout somewhere else
// entirely. The global beforeEach (src/test/setup.ts) empties them, which makes firing
// an event before the map is mounted a visible no-op instead of a phantom hit.
export function __resetMapMock(): void {
  _handlers = {};
  _markerHandlers.clear();
  __wheelZoom.enabled = null;
  __zoomControl.shown = null;
  __mapCalls.fitBounds = 0;
  __mapCalls.setView = 0;
  __mapCalls.panTo = 0;
  __mapCalls.setZoom = 0;
  __mapCalls.flyTo = 0;
  __mapCalls.flyToBounds = 0;
  __mapCalls.lastBoundsOptions = undefined;
  __polylines.length = 0;
}
