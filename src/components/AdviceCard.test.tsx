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

test("shows the Best tag, title and minutes", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByText("Best")).toBeInTheDocument();
  expect(screen.getByText("By bike")).toBeInTheDocument();
  expect(screen.getByText("24 min")).toBeInTheDocument();
});

test("no tag when not recommended", () => {
  render(
    <AdviceCard option={{ ...recommended, recommended: false }} selected={false} onSelect={() => {}} />
  );
  expect(screen.queryByText("Best")).not.toBeInTheDocument();
});

test("the selected toggle is pressed", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
});

test("calls onSelect when clicked", () => {
  const onSelect = vi.fn();
  render(<AdviceCard option={recommended} selected={false} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onSelect).toHaveBeenCalledTimes(1);
});
