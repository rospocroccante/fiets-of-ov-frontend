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
