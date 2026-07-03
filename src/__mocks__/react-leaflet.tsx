import React from "react";

export function MapContainer({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={`leaflet-container ${className ?? ""}`.trim()}>{children}</div>;
}

export function TileLayer() {
  return null;
}

export function CircleMarker({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
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

export function useMap() {
  return {
    fitBounds: () => {},
    setView: () => {},
    scrollWheelZoom: {
      enable: () => {
        __wheelZoom.enabled = true;
      },
      disable: () => {
        __wheelZoom.enabled = false;
      },
    },
  };
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
  _handlers = handlers;
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
