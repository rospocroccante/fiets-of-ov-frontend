import { render, screen, fireEvent } from "@testing-library/react";
import { NavigationOverlay } from "./NavigationOverlay";
import type { NavManeuver } from "../lib/routeProgress";

const right: NavManeuver = { at: 650, direction: "RIGHT", street: "Prinsengracht", legIndex: 0 };

test("shows the rounded distance, street and turn glyph for a RIGHT maneuver", () => {
  render(
    <NavigationOverlay next={right} toNext={647} remaining={2340} etaMinutes={9} onExit={() => {}} />,
  );
  // 647 m rounds to the nearest 10; the remaining sub-row switches to km above 1000.
  expect(screen.getByText("650 m")).toBeInTheDocument();
  expect(screen.getByText("Prinsengracht")).toBeInTheDocument();
  expect(screen.getByText("turn_right")).toBeInTheDocument();
  expect(screen.getByText("2.3 km")).toBeInTheDocument();
  expect(screen.getByText("~9 min")).toBeInTheDocument();
});

test("ALIGHT shows the stop name with the transit glyph", () => {
  const alight: NavManeuver = { at: 1200, direction: "ALIGHT", street: "Azartplein", legIndex: 1 };
  render(
    <NavigationOverlay next={alight} toNext={180} remaining={400} etaMinutes={2} onExit={() => {}} />,
  );
  expect(screen.getByText("Azartplein")).toBeInTheDocument();
  expect(screen.getByText("tram")).toBeInTheDocument();
  expect(screen.getByText("180 m")).toBeInTheDocument();
});

test("null next renders the arrived state", () => {
  render(<NavigationOverlay next={null} toNext={0} remaining={0} etaMinutes={1} onExit={() => {}} />);
  expect(screen.getByText("You have arrived")).toBeInTheDocument();
  expect(screen.getByText("sports_score")).toBeInTheDocument();
});

test("unknown directions fall back to the straight glyph", () => {
  const odd: NavManeuver = { at: 10, direction: "ELEVATOR", street: null, legIndex: 0 };
  render(<NavigationOverlay next={odd} toNext={25} remaining={30} etaMinutes={1} onExit={() => {}} />);
  expect(screen.getByText("straight")).toBeInTheDocument();
});

test("Exit button fires onExit", () => {
  const onExit = vi.fn();
  render(<NavigationOverlay next={right} toNext={100} remaining={100} etaMinutes={1} onExit={onExit} />);
  fireEvent.click(screen.getByRole("button", { name: /exit navigation/i }));
  expect(onExit).toHaveBeenCalledTimes(1);
});
