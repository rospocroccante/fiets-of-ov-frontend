import { render, screen, fireEvent } from "@testing-library/react";
import { RadarReadout } from "./RainRadar";
import { publishRadarFrame } from "../lib/radarFrame";

test("the on-map layer picker toggles rain and wind", () => {
  const toggled: string[] = [];
  render(
    <RadarReadout
      layers={{ rain: true, wind: false }}
      onLayerToggle={(k) => toggled.push(k)}
      rainError={false}
      windError={false}
    />,
  );
  expect(screen.getByRole("button", { name: "Rain" })).toHaveAttribute("aria-pressed", "true");
  const wind = screen.getByRole("button", { name: "Wind" });
  expect(wind).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(wind);
  expect(toggled).toEqual(["wind"]);
});

test("feed errors surface as explicit unavailability chips", () => {
  render(<RadarReadout layers={{ rain: true, wind: true }} rainError={true} windError={true} />);
  expect(screen.getByText(/rain radar unavailable/i)).toBeInTheDocument();
  expect(screen.getByText(/wind data unavailable/i)).toBeInTheDocument();
});

test("the frame clock is pinned to the app language, not the browser locale", () => {
  publishRadarFrame(Math.floor(Date.UTC(2026, 6, 7, 9, 5) / 1000));
  render(<RadarReadout layers={{ rain: true, wind: false }} rainError={false} windError={false} />);
  // en-GB (the app default) prints HH:mm; a regression to toLocaleTimeString([]) would print "09:05 AM" on en-US runners.
  expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
});
