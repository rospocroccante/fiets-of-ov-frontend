import { render, screen } from "@testing-library/react";
import { AdviceCard } from "./AdviceCard";

const recommended = {
  mode: "bike" as const,
  title: "By bike",
  minutes: 24,
  recommended: true,
  chips: ["24 min", "dry"],
  reason: "dry during your ride -> bike",
};

test("shows Recommended badge and title when recommended", () => {
  render(<AdviceCard card={recommended} />);
  expect(screen.getByText("Recommended")).toBeInTheDocument();
  expect(screen.getByText("By bike")).toBeInTheDocument();
  // "24 min" appears in both the rating-style minutes span and the chip
  expect(screen.getAllByText("24 min").length).toBeGreaterThanOrEqual(1);
});

test("renders the reason when present", () => {
  render(<AdviceCard card={recommended} />);
  expect(screen.getByText(/dry during your ride/)).toBeInTheDocument();
});

test("no badge when not recommended", () => {
  render(<AdviceCard card={{ ...recommended, recommended: false, reason: undefined }} />);
  expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
});

test("shows n/a when minutes is null", () => {
  render(<AdviceCard card={{ ...recommended, minutes: null }} />);
  expect(screen.getByText("n/a")).toBeInTheDocument();
});
