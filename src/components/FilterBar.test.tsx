import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "./FilterBar";
import type { WeatherLayersState } from "./RainRadar";

const LAYERS: WeatherLayersState = { rain: true, wind: true };

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
  const { rerender } = renderBar({ onToggleRadar: () => toggles.push(1) });
  const radarBtn = screen.getByRole("button", { name: "Radar" });
  expect(radarBtn).toHaveAttribute("aria-pressed", "false");
  // Layer chips are hidden while the radar is off.
  expect(screen.queryByRole("button", { name: "Rain" })).toBeNull();
  fireEvent.click(radarBtn);
  expect(toggles).toEqual([1]);

  // With the radar active the per-layer chips show, reflecting wLayers state.
  rerender(
    <FilterBar
      count={2}
      hideMap={false}
      onToggleMap={() => {}}
      armed={null}
      onArm={() => {}}
      radar
      wLayers={LAYERS}
      onToggleRadar={() => {}}
      onToggleLayer={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Radar" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Rain" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Wind" })).toHaveAttribute("aria-pressed", "true");
});

test("map-only controls (Set on map, Radar) are hidden when the map is hidden", () => {
  renderBar({ hideMap: true });
  expect(screen.queryByRole("button", { name: /^start$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
  // The map toggle itself flips to "Show map".
  expect(screen.getByRole("button", { name: /show map/i })).toBeInTheDocument();
});
