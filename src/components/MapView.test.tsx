import { render } from "@testing-library/react";
import { MapView } from "./MapView";
import type { Itinerary } from "../api/types";

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
  const { container } = render(
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
  const { container } = render(
    <MapView origin={null} destination={null} stops={[]} route={null} />
  );
  expect(container.querySelector(".leaflet-container")).toBeTruthy();
});
