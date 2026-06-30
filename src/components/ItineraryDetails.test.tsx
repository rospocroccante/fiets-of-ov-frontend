import { render, screen } from "@testing-library/react";
import { ItineraryDetails } from "./ItineraryDetails";
import { mockPlanFor } from "../api/mock";

test("renders transit legs step by step with line badges", () => {
  const plan = mockPlanFor("A", "Bijlmer rain");
  const itinerary = plan.options.find((o) => o.kind === "transit")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByText(/Step by step/)).toBeInTheDocument();
  expect(screen.getByText("Metro 52")).toBeInTheDocument();
  expect(screen.getByText("Tram 1")).toBeInTheDocument();
  expect(screen.getAllByText("Walk").length).toBeGreaterThan(0);
});

test("renders a bike itinerary", () => {
  const plan = mockPlanFor("A", "Vondelpark");
  const itinerary = plan.options.find((o) => o.kind === "bike")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByText("Bike")).toBeInTheDocument();
});
