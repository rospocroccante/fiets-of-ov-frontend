import { render, screen } from "@testing-library/react";
import { ResultsPanel } from "./ResultsPanel";
import { scoreAdvice } from "../lib/score";
import { mockAdviceFor } from "../api/mock";

test("idle shows a prompt", () => {
  render(<ResultsPanel state={{ status: "idle" }} />);
  expect(screen.getByText(/enter origin and destination/i)).toBeInTheDocument();
});

test("error shows the message", () => {
  render(<ResultsPanel state={{ status: "error", message: "place not found" }} />);
  expect(screen.getByText("place not found")).toBeInTheDocument();
});

test("ready renders recommended card first", () => {
  const result = scoreAdvice(mockAdviceFor("A", "Bijlmer rain"));
  render(<ResultsPanel state={{ status: "ready", result }} />);
  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings[0]).toHaveTextContent("Public transport");
});
