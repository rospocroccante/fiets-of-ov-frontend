import { render } from "@testing-library/react";
import { MapView } from "./MapView";

test("renders a leaflet container without crashing", () => {
  const { container } = render(
    <MapView
      origin={{ lat: 52.379, lon: 4.9 }}
      destination={{ lat: 52.358, lon: 4.868 }}
      stops={[]}
    />
  );
  expect(container.querySelector(".leaflet-container")).toBeTruthy();
});
