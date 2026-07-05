import { render, screen, fireEvent } from "@testing-library/react";
import { RadarReadout } from "./RainRadar";

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
