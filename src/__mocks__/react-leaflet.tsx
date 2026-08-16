import React from "react";

type MapContainerProps = {
  children?: React.ReactNode;
  className?: string;
  attributionControl?: boolean;
  maxZoom?: number;
};

// Test spy: the options the app asked the map for. This mock renders a plain div, so
// anything Leaflet would build out of these options (the attribution control above all)
// leaves no trace in the DOM to assert against, and a test that queried for it would
// pass with the option gone. The props themselves are the only truth available here.
export const __mapContainerProps: { last: MapContainerProps | null } = { last: null };

// forwardRef so MapView's map ref (used by the zoom-to-POIs chip) attaches without
// React warnings; the mock exposes no map instance, so the ref simply stays null and
// callers must guard.
export const MapContainer = React.forwardRef<never, MapContainerProps>(
  function MapContainer(props, _ref) {
    __mapContainerProps.last = props;
    const { children, className } = props;
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

export function Polyline({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

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
export const __mapCalls = { fitBounds: 0, setView: 0, panTo: 0 };

// A single stable map object, like the real useMap: effects keyed on map identity
// must not re-fire every render.
const _map = {
  fitBounds: () => {
    __mapCalls.fitBounds += 1;
  },
  setView: () => {
    __mapCalls.setView += 1;
  },
  panTo: () => {
    __mapCalls.panTo += 1;
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
  __mapCalls.fitBounds = 0;
  __mapCalls.setView = 0;
  __mapCalls.panTo = 0;
}
