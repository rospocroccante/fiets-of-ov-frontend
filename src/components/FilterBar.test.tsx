import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "./FilterBar";
import type { KindFilter } from "./FilterBar";
import type { WeatherLayersState } from "./RainRadar";

const LAYERS: WeatherLayersState = { rain: true, wind: true };
const KINDS: KindFilter = { bike: true, transit: true, bike_and_ride: true };

function renderBar(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props: React.ComponentProps<typeof FilterBar> = {
    count: 2,
    hideMap: false,
    onToggleMap: () => {},
    armed: null,
    onArm: () => {},
    radar: false,
    wLayers: LAYERS,
    onToggleRadar: () => {},
    onToggleLayer: () => {},
    kinds: KINDS,
    onToggleKind: () => {},
    dryOnly: false,
    onToggleDry: () => {},
    ...overrides,
  };
  return render(<FilterBar {...props} />);
}

test("clicking Start requests arming the start endpoint", () => {
  const armed: string[] = [];
  renderBar({ onArm: (w) => armed.push(w) });
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  expect(armed).toEqual(["start"]);
});

test("the armed endpoint's button is pressed", () => {
  renderBar({ armed: "end" });
  expect(screen.getByRole("button", { name: /^end$/i })).toHaveAttribute("aria-pressed", "true");
});

test("Radar toggle reports the master toggle; Rain/Wind chips appear only when active", () => {
  const toggles: number[] = [];
  renderBar({ onToggleRadar: () => toggles.push(1) });
  const radarBtn = screen.getByRole("button", { name: "Radar" });
  expect(radarBtn).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: "Rain" })).toBeNull();
  fireEvent.click(radarBtn);
  expect(toggles).toEqual([1]);
});

test("map-only controls (Set on map, Radar) are hidden when the map is hidden", () => {
  renderBar({ hideMap: true });
  expect(screen.queryByRole("button", { name: /^start$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
  expect(screen.getByRole("button", { name: /show map/i })).toBeInTheDocument();
});

test("mode chips are real filters: pressed state reflects kinds, click toggles", () => {
  const toggled: string[] = [];
  renderBar({
    kinds: { bike: true, transit: false, bike_and_ride: true },
    onToggleKind: (m) => toggled.push(m),
  });
  expect(screen.getByRole("button", { name: "Bike" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Transit" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Transit" }));
  expect(toggled).toEqual(["transit"]);
});

test("Filters opens a popover with kind checkboxes and the dry-only toggle", () => {
  const toggled: string[] = [];
  const dry = vi.fn();
  renderBar({ onToggleKind: (m) => toggled.push(m), onToggleDry: dry });
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getByText(/show options/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("checkbox", { name: /bike \+ ov/i }));
  expect(toggled).toEqual(["bike_and_ride"]);
  fireEvent.click(screen.getByRole("checkbox", { name: /only dry options/i }));
  expect(dry).toHaveBeenCalledTimes(1);

  // Outside click closes the popover.
  fireEvent.click(screen.getByRole("button", { name: /close filters/i }));
  expect(screen.queryByText(/show options/i)).toBeNull();
});
