import { render, screen, fireEvent } from "@testing-library/react";
import { AdviceCard } from "./AdviceCard";
import type { OptionView } from "../lib/planView";
import type { Itinerary } from "../api/types";

const itinerary: Itinerary = {
  minutes: 24,
  distance_m: 4750,
  start_time: 0,
  end_time: 0,
  legs: [],
};

const recommended: OptionView = {
  mode: "bike",
  title: "By bike",
  minutes: 24,
  distanceKm: 4.8,
  recommended: true,
  summary: "4.8 km by bike",
  itinerary,
};

test("shows Recommended badge, title, minutes and summary", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByText("Recommended")).toBeInTheDocument();
  expect(screen.getByText("By bike")).toBeInTheDocument();
  expect(screen.getByText("24 min")).toBeInTheDocument();
  expect(screen.getByText("4.8 km by bike")).toBeInTheDocument();
});

test("no badge when not recommended", () => {
  render(
    <AdviceCard option={{ ...recommended, recommended: false }} selected={false} onSelect={() => {}} />
  );
  expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
});

test("calls onSelect when clicked", () => {
  const onSelect = vi.fn();
  render(<AdviceCard option={recommended} selected={false} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onSelect).toHaveBeenCalledTimes(1);
});
