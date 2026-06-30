import { render, screen, fireEvent } from "@testing-library/react";
import { ResultsPanel } from "./ResultsPanel";
import { buildPlanView } from "../lib/planView";
import { mockPlanFor } from "../api/mock";

test("idle shows a prompt", () => {
  render(<ResultsPanel state={{ status: "idle" }} />);
  expect(screen.getByText(/enter origin and destination/i)).toBeInTheDocument();
});

test("error shows the message", () => {
  render(<ResultsPanel state={{ status: "error", message: "no bike route found for this trip" }} />);
  expect(screen.getByText("no bike route found for this trip")).toBeInTheDocument();
});

test("ready shows the weather reason, both options, and step-by-step", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  render(
    <ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect: () => {} }} />
  );
  // weather banner shows the recommendation reason
  expect(screen.getByText(/take tram/i)).toBeInTheDocument();
  // both option cards (recommended transit first)
  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings[0]).toHaveTextContent("Public transport");
  // step-by-step for the selected (transit) itinerary
  expect(screen.getByText(/Step by step/)).toBeInTheDocument();
  expect(screen.getByText("Metro 52")).toBeInTheDocument();
});

test("clicking an option calls onSelect", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  const onSelect = vi.fn();
  render(<ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect }} />);
  fireEvent.click(screen.getByText("By bike"));
  expect(onSelect).toHaveBeenCalledWith("bike");
});
