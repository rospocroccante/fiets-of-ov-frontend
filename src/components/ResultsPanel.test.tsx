import { render, screen, fireEvent, act } from "@testing-library/react";
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
  // the selected option's departure line sits between the toggles and the steps
  expect(screen.getByText(/Leave (now|at)/)).toBeInTheDocument();
});

test("all options filtered away shows a friendly empty state", () => {
  const view = { ...buildPlanView(mockPlanFor("A", "Bijlmer rain")), options: [] };
  render(<ResultsPanel state={{ status: "ready", view, selectedMode: "bike", onSelect: () => {} }} />);
  expect(screen.getByText(/no options match/i)).toBeInTheDocument();
});

test("clicking an option calls onSelect", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  const onSelect = vi.fn();
  render(<ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect }} />);
  fireEvent.click(screen.getByText("By bike"));
  expect(onSelect).toHaveBeenCalledWith("bike");
});

test("the departure line keeps up with the clock instead of freezing at first render", () => {
  vi.useFakeTimers();
  try {
    const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
    const departure = view.options[0].itinerary.start_time;
    // Ten minutes before departure: the panel shows the clock time.
    vi.setSystemTime(departure - 10 * 60_000);
    render(
      <ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect: () => {} }} />,
    );
    expect(screen.getByText(/Leave at/)).toBeInTheDocument();

    // Nine minutes later the same mounted panel must say "leave now", untouched.
    act(() => vi.advanceTimersByTime(9 * 60_000));
    expect(screen.getByText("Leave now")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("onStartNav renders a Start button beside the departure line and fires on click", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  const onStartNav = vi.fn();
  render(
    <ResultsPanel
      state={{ status: "ready", view, selectedMode: "transit", onSelect: () => {} }}
      onStartNav={onStartNav}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
  expect(onStartNav).toHaveBeenCalledTimes(1);
});
