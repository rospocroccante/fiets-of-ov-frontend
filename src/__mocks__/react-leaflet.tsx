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

export function Marker({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function Popup({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>;
}

export function Tooltip({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>;
}

export function useMap() {
  return {
    fitBounds: () => {},
    setView: () => {},
  };
}

let _clickHandler: ((e: { latlng: { lat: number; lng: number } }) => void) | null = null;

export function useMapEvents(handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) {
  _clickHandler = handlers.click ?? null;
  return {};
}

// Test helper: simulate a user clicking the map at (lat, lng).
export function __fireMapClick(lat: number, lng: number) {
  _clickHandler?.({ latlng: { lat, lng } });
}
