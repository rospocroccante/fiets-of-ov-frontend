import React from "react";

// forwardRef so MapView's map ref (used by the zoom-to-POIs chip) attaches without
// React warnings; the mock exposes no map instance, so the ref simply stays null and
// callers must guard.
export const MapContainer = React.forwardRef<never, { children?: React.ReactNode; className?: string }>(
  function MapContainer({ children, className }, _ref) {
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
// Tests should compare before/after deltas; counters are never reset.
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
